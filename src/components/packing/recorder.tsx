"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CameraOff, CheckCircle2, CloudOff, ScanBarcode, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InfoBanner } from "@/components/ui/info-banner";
import { cn } from "@/lib/cn";
import { fmtDate, fmtTime } from "@/lib/format";
import {
  decideScan,
  needsDuplicateWarning,
  normalizeResi,
  rememberScan,
  type ResiHistory,
  type ScanMemory,
  type ScanPhase,
} from "@/lib/packing/scan-rules";
import { startScanner, type Scanner } from "@/lib/packing/scanner";
import { buildVideoPath, extFromMime, fmtBytes, fmtDuration, pickMimeType } from "@/lib/packing/media";
import {
  addChunk,
  clearSession,
  isUploaded,
  listSessions,
  processQueue,
  putJob,
  readChunks,
  saveJobKey,
  saveSession,
  subscribeQueue,
  uploadJobKey,
  type QueueStatus,
  type RecordingSession,
} from "@/lib/packing/queue";
import { computeExpiry } from "@/lib/packing/expiry";
import { PACK_STATUS_LABEL, QUALITY_PRESET, type PackSettings, type PackStatus } from "@/lib/packing/types";

const MARKETPLACE_KEY = "pb-pack-marketplace";

type Screen = "ready" | "confirm" | "recording" | "done";
type CamState = { kind: "starting" } | { kind: "ready" } | { kind: "error"; title: string; detail: string };

interface FinishedPack {
  id: string;
  resi: string;
  marketplace: string;
  status: PackStatus;
  finishedAt: number;
  durationSec: number;
  size: number;
}

function cameraError(e: unknown): { title: string; detail: string } {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      title: "Izin kamera ditolak",
      detail:
        "iPhone: buka Pengaturan → Safari → Kamera → pilih Izinkan, lalu muat ulang halaman. Android (Chrome): ketuk ikon gembok di samping alamat web → Izin → Kamera → Izinkan.",
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { title: "Kamera tidak ditemukan", detail: "Pastikan perangkat punya kamera belakang yang berfungsi." };
  }
  if (name === "NotReadableError") {
    return { title: "Kamera sedang dipakai aplikasi lain", detail: "Tutup aplikasi lain yang memakai kamera, lalu coba lagi." };
  }
  return { title: "Kamera tidak bisa dibuka", detail: e instanceof Error ? e.message : String(e) };
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // tidak didukung — abaikan
  }
}

export function PackRecorder({
  settings,
  settingsError,
  packerName,
  todayCount: initialTodayCount,
}: {
  settings: PackSettings;
  settingsError?: boolean;
  packerName: string;
  todayCount: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<Scanner | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef<RecordingSession | null>(null);
  const phaseRef = useRef<ScanPhase>({ phase: "idle" });
  const memoryRef = useRef<ScanMemory>({ lastCode: null, lastAt: 0 });
  const busyRef = useRef(false); // sedang cek duplikat / memulai / menyelesaikan
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  const [cam, setCam] = useState<CamState>({ kind: "starting" });
  const [screen, setScreen] = useState<Screen>("ready");
  const [marketplace, setMarketplace] = useState(settings.marketplaces[0] ?? "Shopee");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<FinishedPack | null>(null);
  const [todayCount, setTodayCount] = useState(initialTodayCount);
  const [queue, setQueue] = useState<QueueStatus>({ pending: 0, uploading: null, lastError: null });
  const [online, setOnline] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // Resi yang sudah terbaca, menunggu petugas menekan "Mulai Rekam"
  const [pending, setPending] = useState<{ resi: string; history: ResiHistory | null } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const marketplaceRef = useRef(marketplace);
  marketplaceRef.current = marketplace;

  // ── Marketplace terakhir ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MARKETPLACE_KEY);
      if (saved && settings.marketplaces.includes(saved)) setMarketplace(saved);
    } catch {
      // localStorage tidak tersedia
    }
  }, [settings.marketplaces]);

  function chooseMarketplace(m: string) {
    setMarketplace(m);
    try {
      localStorage.setItem(MARKETPLACE_KEY, m);
    } catch {
      // abaikan
    }
  }

  // ── Antrean upload & status online ──
  useEffect(() => {
    const unsub = subscribeQueue(setQueue);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      unsub();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // ── Pulihkan rekaman yang terputus (tab tertutup saat merekam) ──
  useEffect(() => {
    (async () => {
      try {
        const leftovers = await listSessions();
        for (const s of leftovers) {
          const chunks = await readChunks(s.id);
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: s.mime.split(";")[0] });
            await putJob({
              kind: "save",
              key: saveJobKey(s.id),
              recordId: s.id,
              resi: s.resi,
              marketplace: s.marketplace,
              status: "terputus",
              startedAt: s.startedAt,
              finishedAt: s.startedAt + chunks.length * 1000,
              durationSec: chunks.length,
              attempts: 0,
            });
            await putJob({
              kind: "upload",
              key: uploadJobKey(s.id),
              recordId: s.id,
              path: s.path,
              mime: s.mime,
              blob,
              uploaded: false,
              attempts: 0,
            });
            toast.info(`Rekaman ${s.resi} sebelumnya terputus — potongan videonya disimpan`);
          }
          await clearSession(s.id);
        }
      } catch (e) {
        toast.error(`Gagal memulihkan rekaman lokal: ${e instanceof Error ? e.message : String(e)}`);
      }
      void processQueue();
    })();
  }, []);

  // ── Wake lock ──
  const acquireWake = useCallback(async () => {
    try {
      if ("wakeLock" in navigator && !wakeRef.current) {
        wakeRef.current = await navigator.wakeLock.request("screen");
        wakeRef.current.addEventListener("release", () => {
          wakeRef.current = null;
        });
      }
    } catch {
      // ditolak / tidak didukung — layar mungkin mati sendiri
    }
  }, []);

  const releaseWake = useCallback(() => {
    void wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && phaseRef.current.phase === "recording") void acquireWake();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [acquireWake]);

  // ── Selesai / batal ──
  const finish = useCallback(
    async (status: PackStatus) => {
      const session = sessionRef.current;
      const recorder = recorderRef.current;
      if (!session || phaseRef.current.phase !== "recording") return;
      phaseRef.current = { phase: "idle" };
      busyRef.current = true;
      sessionRef.current = null;
      recorderRef.current = null;
      setCancelOpen(false);
      setHint(null);

      try {
        if (recorder && recorder.state !== "inactive") {
          await new Promise<void>((resolve) => {
            recorder.onstop = () => resolve();
            recorder.onerror = () => resolve();
            try {
              recorder.stop();
            } catch {
              resolve();
            }
          });
        }
        const finishedAt = Date.now();
        const durationSec = Math.max(0, Math.round((finishedAt - session.startedAt) / 1000));
        const blob = new Blob(chunksRef.current, { type: session.mime.split(";")[0] });
        chunksRef.current = [];

        await putJob({
          kind: "save",
          key: saveJobKey(session.id),
          recordId: session.id,
          resi: session.resi,
          marketplace: session.marketplace,
          status,
          startedAt: session.startedAt,
          finishedAt,
          durationSec,
          attempts: 0,
        });
        if (status !== "dibatalkan" && blob.size > 0) {
          await putJob({
            kind: "upload",
            key: uploadJobKey(session.id),
            recordId: session.id,
            path: session.path,
            mime: session.mime,
            blob,
            uploaded: false,
            attempts: 0,
          });
        }
        await clearSession(session.id);

        // Jangan langsung mulai rekam lagi kalau resi yang sama masih terbaca
        memoryRef.current = { lastCode: session.resi, lastAt: Date.now() };
        releaseWake();
        if (status !== "dibatalkan") setTodayCount((c) => c + 1);
        setResult({
          id: session.id,
          resi: session.resi,
          marketplace: session.marketplace,
          status,
          finishedAt,
          durationSec,
          size: status === "dibatalkan" ? 0 : blob.size,
        });
        setScreen(status === "dibatalkan" ? "ready" : "done");
        vibrate(status === "dibatalkan" ? 80 : [80, 60, 80]);
        if (status === "dibatalkan") toast("Rekaman dibatalkan — video tidak disimpan");
        if (status === "dihentikan_otomatis") toast.warning("Rekaman dihentikan otomatis karena melewati durasi maksimal");
        if (status === "terputus") toast.warning("Rekaman terputus — potongan videonya disimpan");
        void processQueue();
      } catch (e) {
        toast.error(`Gagal menyimpan rekaman: ${e instanceof Error ? e.message : String(e)}`);
        setScreen("ready");
      } finally {
        busyRef.current = false;
      }
    },
    [releaseWake],
  );

  const finishRef = useRef(finish);
  finishRef.current = finish;

  // ── Mulai rekam ──
  const beginRecording = useCallback(
    async (resi: string) => {
      const stream = streamRef.current;
      if (!stream) return;
      const mime = typeof MediaRecorder === "undefined" ? null : pickMimeType((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) {
        toast.error("Browser ini tidak bisa merekam video. Pakai Chrome (Android) atau Safari (iPhone) terbaru.");
        busyRef.current = false;
        return;
      }

      const startedAt = Date.now();
      const id = crypto.randomUUID();
      const session: RecordingSession = {
        id,
        resi,
        marketplace: marketplaceRef.current,
        startedAt,
        mime,
        path: buildVideoPath(resi, startedAt, extFromMime(mime)),
      };

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: QUALITY_PRESET[settings.quality].bitrate });
      } catch (e) {
        toast.error(`Gagal memulai rekaman: ${e instanceof Error ? e.message : String(e)}`);
        busyRef.current = false;
        return;
      }

      chunksRef.current = [];
      let seq = 0;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          void addChunk(id, seq++, e.data).catch(() => {});
        }
      };
      recorder.onerror = () => void finishRef.current("terputus");

      sessionRef.current = session;
      recorderRef.current = recorder;
      phaseRef.current = { phase: "recording", resi, startedAt };
      recorder.start(1000);
      await saveSession(session).catch(() => {});

      setResult(null);
      setBanner(null);
      setHint(null);
      setElapsed(0);
      setScreen("recording");
      vibrate(120);
      void acquireWake();
      busyRef.current = false;

      // Tandai "merekam" di server (boleh gagal — catatan final dikirim lewat antrean)
      void createClient()
        .rpc("save_pack_record", {
          p_id: id,
          p_resi: resi,
          p_marketplace: session.marketplace,
          p_status: "merekam",
          p_started_at: new Date(startedAt).toISOString(),
          p_finished_at: null,
          p_duration_sec: null,
        })
        .then(() => {}, () => {});
    },
    [settings.quality, acquireWake],
  );

  /** Resi terbaca → tampilkan rincian dulu (+ peringatan duplikat); rekaman mulai setelah tombol ditekan. */
  const showPending = useCallback(
    async (resi: string) => {
      busyRef.current = true;
      let history: ResiHistory | null = null;
      if (settings.duplicate_warning && navigator.onLine) {
        try {
          const { data, error } = await createClient().rpc("pack_resi_history", { p_resi: resi });
          history = !error && Array.isArray(data) ? (data[0] as ResiHistory | undefined) ?? null : null;
        } catch {
          // offline / gagal cek — tetap bisa rekam
        }
      }
      vibrate(needsDuplicateWarning(history, settings.duplicate_warning) ? [60, 40, 60] : 60);
      setPending({ resi, history });
      setResult(null);
      setBanner(null);
      setScreen("confirm");
      busyRef.current = false;
    },
    [settings.duplicate_warning],
  );

  // ── Hasil scan ──
  const onCode = useCallback(
    (raw: string) => {
      if (busyRef.current) return;
      const now = Date.now();
      const decision = decideScan(phaseRef.current, raw, now, memoryRef.current, {
        minDurationSec: settings.min_duration_sec,
      });
      if (normalizeResi(raw)) memoryRef.current = rememberScan(raw, now);

      switch (decision.type) {
        case "start":
          if (pendingRef.current?.resi !== decision.resi) void showPending(decision.resi);
          break;
        case "finish":
          void finishRef.current("selesai");
          break;
        case "reject":
          vibrate([200, 80, 200]);
          setBanner(decision.message);
          toast.error(decision.message);
          break;
        case "ignore":
          if (decision.reason === "too_soon") setHint(`Tunggu minimal ${settings.min_duration_sec} detik sebelum scan penutup`);
          break;
      }
    },
    [settings.min_duration_sec, showPending],
  );

  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  // ── Kamera (satu stream untuk scan + rekam) ──
  const startCamera = useCallback(async () => {
    scannerRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCam({ kind: "starting" });

    if (!navigator.mediaDevices?.getUserMedia) {
      setCam({
        kind: "error",
        title: "Kamera tidak tersedia",
        detail: "Buka web ini lewat https:// di Chrome (Android) atau Safari (iPhone).",
      });
      return;
    }
    const preset = QUALITY_PRESET[settings.quality];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: preset.width }, height: { ideal: preset.height } },
        audio: settings.record_audio,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      track?.addEventListener("ended", () => {
        if (phaseRef.current.phase === "recording") void finishRef.current("terputus");
        setCam({ kind: "error", title: "Kamera berhenti", detail: "Kamera terputus. Ketuk Coba lagi untuk membuka ulang." });
      });

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      scannerRef.current = await startScanner(video, (code) => onCodeRef.current(code));
      setEngine(scannerRef.current.engine);
      setCam({ kind: "ready" });
    } catch (e) {
      setCam({ kind: "error", ...cameraError(e) });
    }
  }, [settings.quality, settings.record_audio]);

  useEffect(() => {
    void startCamera();
    return () => {
      scannerRef.current?.stop();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop(); // potongan sudah di IndexedDB → dipulihkan sebagai "terputus" saat halaman dibuka lagi
        } catch {
          // abaikan
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void wakeRef.current?.release().catch(() => {});
    };
  }, [startCamera]);

  // ── Timer & batas durasi maksimal ──
  useEffect(() => {
    if (screen !== "recording") return;
    const t = setInterval(() => {
      const p = phaseRef.current;
      if (p.phase !== "recording") return;
      const sec = (Date.now() - p.startedAt) / 1000;
      setElapsed(sec);
      if (sec >= settings.max_duration_sec) void finishRef.current("dihentikan_otomatis");
    }, 250);
    return () => clearInterval(t);
  }, [screen, settings.max_duration_sec]);

  // Banner tolak hilang sendiri
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  function manualFinish() {
    const p = phaseRef.current;
    if (p.phase !== "recording" || busyRef.current) return;
    if (Date.now() - p.startedAt < settings.min_duration_sec * 1000) {
      setHint(`Tunggu minimal ${settings.min_duration_sec} detik sebelum menyelesaikan`);
      return;
    }
    void finish("selesai");
  }

  function nextPackage() {
    setResult(null);
    setScreen("ready");
    setBanner(null);
    setHint(null);
  }

  const recording = screen === "recording";
  const minReached = elapsed >= settings.min_duration_sec;

  return (
    <div className="pb-6">
      {settingsError && (
        <InfoBanner variant="warn" head="Pengaturan belum termuat">
          Memakai pengaturan bawaan (14 hari, maks 10 menit, Hemat 480p). Rekaman tetap tersimpan.
        </InfoBanner>
      )}

      {/* Kamera */}
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-[14px] bg-ink transition-[aspect-ratio]",
          // Kamera mengecil saat menampilkan rincian supaya tombol utama langsung terlihat tanpa scroll
          screen === "confirm" || screen === "done" ? "aspect-[16/9]" : "aspect-square",
          recording && "ring-4 ring-neg",
        )}
      >
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />

        {cam.kind === "ready" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                "h-[45%] w-[85%] rounded-xl border-[3px] shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]",
                recording ? "border-neg" : "border-white",
              )}
            />
          </div>
        )}

        {recording && (
          <div className="absolute inset-x-3 top-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-full bg-neg px-3 py-1.5 text-sm font-extrabold tracking-wide text-white">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
              REC
            </span>
            <span className="num rounded-full bg-black/60 px-3 py-1.5 text-base font-bold text-white">
              {fmtDuration(elapsed)}
            </span>
          </div>
        )}

        {cam.kind === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white/80">
            Membuka kamera…
          </div>
        )}

        {cam.kind === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink px-6 text-center text-white">
            <CameraOff className="h-10 w-10 text-warn" />
            <div className="text-lg font-bold">{cam.title}</div>
            <p className="text-sm leading-relaxed text-white/80">{cam.detail}</p>
            <Button variant="primary" className="mt-2 h-12 px-6 text-base" onClick={() => void startCamera()}>
              Coba lagi
            </Button>
          </div>
        )}

        {banner && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-neg px-4 py-3 text-center text-[15px] font-bold text-white shadow-lg">
            {banner}
          </div>
        )}
      </div>

      {/* ── Layar 1: siap scan ── */}
      {screen === "ready" && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="form-label">Marketplace</div>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.min(settings.marketplaces.length, 3)}, minmax(0, 1fr))` }}
            >
              {settings.marketplaces.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => chooseMarketplace(m)}
                  className={cn(
                    "h-14 cursor-pointer rounded-xl border-2 px-2 text-base font-bold transition-colors",
                    marketplace === m ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-2",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-4">
            <ScanBarcode className="h-8 w-8 shrink-0 text-primary" />
            <div>
              <div className="text-base font-bold text-ink">Arahkan kamera ke barcode resi</div>
              <div className="text-[13px] text-grey-1">Setelah resi terbaca, cek rinciannya lalu tekan Mulai Rekam</div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-[13.5px]">
            <div>
              <div className="text-grey-1">Petugas</div>
              <div className="font-semibold text-ink">{packerName}</div>
            </div>
            <div className="text-right">
              <div className="text-grey-1">Paket hari ini</div>
              <div className="num text-xl font-extrabold text-ink">{todayCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Layar 1b: resi terbaca, konfirmasi mulai ── */}
      {screen === "confirm" && pending && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-white px-4 py-3">
            <div className="text-[12px] font-bold tracking-[0.06em] text-grey-1 uppercase">Resi terbaca</div>
            <div className="mt-1 font-mono text-2xl font-extrabold break-all text-ink">{pending.resi}</div>
          </div>

          {needsDuplicateWarning(pending.history, settings.duplicate_warning) && pending.history && (
            <InfoBanner variant="warn" head="Resi sudah pernah direkam" className="mb-0">
              Sudah direkam <strong>{pending.history.record_count} kali</strong>
              {pending.history.last_finished_at && (
                <>
                  {" "}
                  (terakhir {fmtDate(pending.history.last_finished_at)} {fmtTime(pending.history.last_finished_at)}
                  {pending.history.last_packer_name ? ` oleh ${pending.history.last_packer_name}` : ""})
                </>
              )}
              . Kalau dilanjutkan, tersimpan sebagai versi baru — video lama tetap ada.
            </InfoBanner>
          )}

          <div>
            <div className="form-label">Marketplace</div>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.min(settings.marketplaces.length, 3)}, minmax(0, 1fr))` }}
            >
              {settings.marketplaces.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => chooseMarketplace(m)}
                  className={cn(
                    "h-12 cursor-pointer rounded-xl border-2 px-2 text-[15px] font-bold transition-colors",
                    marketplace === m ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-2",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="neg"
            className="h-16 w-full text-lg"
            onClick={() => {
              const resi = pending.resi;
              setPending(null);
              void beginRecording(resi);
            }}
          >
            <span className="h-3 w-3 rounded-full bg-white" />
            Mulai Rekam
          </Button>
          <Button
            variant="ghost"
            className="h-12 w-full text-base"
            onClick={() => {
              setPending(null);
              setScreen("ready");
            }}
          >
            Batal, scan resi lain
          </Button>
        </div>
      )}

      {/* ── Layar 2: sedang merekam ── */}
      {screen === "recording" && sessionRef.current && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-white px-4 py-3">
            <div className="text-[12px] font-bold tracking-[0.06em] text-grey-1 uppercase">Sedang merekam</div>
            <div className="mt-1 font-mono text-2xl font-extrabold break-all text-ink">{sessionRef.current.resi}</div>
            <div className="mt-1 text-[14px] font-semibold text-ink-3">{sessionRef.current.marketplace}</div>
          </div>
          {hint && <div className="rounded-lg bg-warn-tint px-3 py-2 text-center text-[13px] font-semibold text-warn-text">{hint}</div>}
          <Button variant="primary" className="h-16 w-full text-lg" onClick={manualFinish} disabled={!minReached}>
            {minReached ? "Selesai Rekam" : `Selesai bisa setelah ${settings.min_duration_sec} detik`}
          </Button>
          <div className="text-center text-[13px] text-grey-1">
            Atau scan resi yang sama lagi · berhenti otomatis setelah {Math.round(settings.max_duration_sec / 60)} menit
          </div>
          <Button variant="ghost" className="h-12 w-full text-base text-neg hover:text-neg" onClick={() => setCancelOpen(true)}>
            Batalkan rekaman
          </Button>
        </div>
      )}

      {/* ── Layar 3: selesai ── */}
      {screen === "done" && result && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-white px-4 py-4">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className={cn("h-6 w-6", result.status === "selesai" ? "text-pos" : "text-warn")} />
              <div className="text-lg font-bold text-ink">
                {result.status === "selesai" ? "Paket selesai direkam" : PACK_STATUS_LABEL[result.status]}
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
              <dt className="text-grey-1">Resi</dt>
              <dd className="font-mono font-bold break-all text-ink">{result.resi}</dd>
              <dt className="text-grey-1">Marketplace</dt>
              <dd className="font-semibold text-ink">{result.marketplace}</dd>
              <dt className="text-grey-1">Petugas</dt>
              <dd className="font-semibold text-ink">{packerName}</dd>
              <dt className="text-grey-1">Jam selesai</dt>
              <dd className="font-semibold text-ink">{fmtTime(new Date(result.finishedAt))} WIB</dd>
              <dt className="text-grey-1">Durasi</dt>
              <dd className="num font-semibold text-ink">{fmtDuration(result.durationSec)}</dd>
              <dt className="text-grey-1">Status</dt>
              <dd className="font-semibold text-ink">{PACK_STATUS_LABEL[result.status]}</dd>
              <dt className="text-grey-1">Video</dt>
              <dd>
                <VideoStatus recordId={result.id} size={result.size} queue={queue} online={online} />
              </dd>
              <dt className="text-grey-1">Disimpan s/d</dt>
              <dd className="font-semibold text-ink">
                {fmtDate(computeExpiry(new Date(result.finishedAt), settings.retention_days))}
              </dd>
            </dl>
          </div>
          <Button variant="primary" className="h-16 w-full text-lg" onClick={nextPackage}>
            Scan paket berikutnya
          </Button>
        </div>
      )}

      {/* Antrean upload */}
      {(queue.pending > 0 || !online) && screen !== "done" && (
        <QueueLine queue={queue} online={online} />
      )}

      {engine && (
        <div className="mt-4 text-center text-[11px] text-grey-2">
          Pemindai: {engine === "native" ? "bawaan browser" : "ZXing"} · {QUALITY_PRESET[settings.quality].label}
        </div>
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Batalkan rekaman?"
        tone="neg"
        confirmLabel="Ya, batalkan"
        message="Video paket ini tidak akan disimpan."
        onConfirm={() => finish("dibatalkan")}
      />
    </div>
  );
}

function VideoStatus({ recordId, size, queue, online }: { recordId: string; size: number; queue: QueueStatus; online: boolean }) {
  if (size === 0) return <span className="font-semibold text-grey-1">Tidak ada video</span>;
  if (isUploaded(recordId)) {
    return <span className="font-semibold text-pos">Video tersimpan ✓ ({fmtBytes(size)})</span>;
  }
  if (queue.uploading?.recordId === recordId) {
    return (
      <span className="font-semibold text-primary-2">Mengupload {Math.round(queue.uploading.progress * 100)}%</span>
    );
  }
  if (!online || queue.lastError) {
    return (
      <span className="font-semibold text-warn-text">
        Menunggu koneksi — tersimpan di HP
        {queue.lastError && online && <span className="block text-[12px] font-normal text-grey-1">{queue.lastError}</span>}
      </span>
    );
  }
  return <span className="font-semibold text-grey-1">Menunggu upload… ({fmtBytes(size)})</span>;
}

function QueueLine({ queue, online }: { queue: QueueStatus; online: boolean }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-[13px]">
      {online ? <UploadCloud className="h-5 w-5 shrink-0 text-primary-2" /> : <CloudOff className="h-5 w-5 shrink-0 text-warn" />}
      <div className="min-w-0">
        <div className="font-semibold text-ink">
          {queue.uploading
            ? `Mengupload video ${Math.round(queue.uploading.progress * 100)}%`
            : online
              ? `${queue.pending} data menunggu dikirim`
              : "Offline — video disimpan di HP"}
        </div>
        {queue.lastError && <div className="truncate text-grey-1">{queue.lastError}</div>}
      </div>
    </div>
  );
}
