"use client";

/**
 * Penyimpanan lokal rekaman (IndexedDB) supaya video tidak hilang:
 * - `sessions` + `chunks`: rekaman yang sedang berjalan, potongan tiap 1 detik. Kalau tab tertutup,
 *   saat halaman dibuka lagi potongan ini dirakit dan dikirim dengan status "terputus".
 * - `jobs`: antrean kirim ke server (simpan catatan, upload video). Diproses berurutan, dicoba ulang
 *   otomatis saat online / tiap 15 detik.
 */
import { createClient } from "@/lib/supabase/client";
import type { PackStatus } from "./types";

const DB_NAME = "pb-packing";
const BUCKET = "pack-videos";

export interface RecordingSession {
  id: string;
  resi: string;
  marketplace: string;
  /** Nama yang packing (pilihan di layar rekam); kosong = nama akun */
  packerName?: string;
  startedAt: number;
  mime: string;
  path: string;
}

export interface SaveJob {
  kind: "save";
  key: string;
  recordId: string;
  resi: string;
  marketplace: string;
  packerName?: string;
  status: PackStatus;
  startedAt: number;
  finishedAt: number;
  durationSec: number;
  attempts: number;
}

export interface UploadJob {
  kind: "upload";
  key: string;
  recordId: string;
  path: string;
  mime: string;
  blob: Blob;
  uploaded: boolean;
  attempts: number;
}

export type Job = SaveJob | UploadJob;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("sessions", { keyPath: "id" });
      db.createObjectStore("chunks", { keyPath: ["sessionId", "seq"] });
      db.createObjectStore("jobs", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        t.oncomplete = () => resolve(req ? req.result : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

// ── Sesi rekaman ──
export const saveSession = (s: RecordingSession) => tx("sessions", "readwrite", (st) => st.put(s));
export const listSessions = () => tx<RecordingSession[]>("sessions", "readonly", (st) => st.getAll());
export const addChunk = (sessionId: string, seq: number, blob: Blob) =>
  tx("chunks", "readwrite", (st) => st.put({ sessionId, seq, blob }));

export async function readChunks(sessionId: string): Promise<Blob[]> {
  const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
  const rows = await tx<{ seq: number; blob: Blob }[]>("chunks", "readonly", (st) => st.getAll(range));
  return rows.sort((a, b) => a.seq - b.seq).map((r) => r.blob);
}

export async function clearSession(sessionId: string) {
  const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
  await tx("chunks", "readwrite", (st) => st.delete(range));
  await tx("sessions", "readwrite", (st) => st.delete(sessionId));
}

// ── Antrean kirim ──
export const putJob = (job: Job) => tx("jobs", "readwrite", (st) => st.put(job));
const deleteJob = (key: string) => tx("jobs", "readwrite", (st) => st.delete(key));
export const listJobs = () => tx<Job[]>("jobs", "readonly", (st) => st.getAll());

export function saveJobKey(recordId: string) {
  return `1-save-${recordId}`; // "1-" < "2-": catatan selalu dikirim sebelum videonya
}
export function uploadJobKey(recordId: string) {
  return `2-upload-${recordId}`;
}

// ── Pemrosesan antrean ──
export interface QueueStatus {
  pending: number;
  uploading: { recordId: string; progress: number } | null;
  lastError: string | null;
}

type Listener = (s: QueueStatus) => void;
const listeners = new Set<Listener>();
let status: QueueStatus = { pending: 0, uploading: null, lastError: null };
const doneRecords = new Set<string>();

function emit(patch: Partial<QueueStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

export function subscribeQueue(l: Listener) {
  listeners.add(l);
  l(status);
  return () => listeners.delete(l);
}

/** Record yang videonya sudah selesai terupload di sesi ini (untuk tampilan "Video tersimpan"). */
export function isUploaded(recordId: string) {
  return doneRecords.has(recordId);
}

function uploadBlob(job: UploadJob, token: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${job.path}`;
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("Content-Type", job.mime.split(";")[0]);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      // 409 = file sudah ada (upload sebelumnya berhasil tapi responsnya hilang) → anggap sukses
      if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 409) resolve();
      else if (xhr.status === 413) reject(new Error("Video terlalu besar untuk batas storage (maks 50 MB)"));
      else reject(new Error(`Upload gagal (${xhr.status}) ${xhr.responseText.slice(0, 120)}`));
    };
    xhr.onerror = () => reject(new Error("Koneksi terputus saat upload"));
    xhr.ontimeout = () => reject(new Error("Upload terlalu lama"));
    xhr.timeout = 10 * 60_000;
    xhr.send(job.blob);
  });
}

async function runJob(job: Job) {
  const supabase = createClient();
  if (job.kind === "save") {
    const { error } = await supabase.rpc("save_pack_record", {
      p_id: job.recordId,
      p_resi: job.resi,
      p_marketplace: job.marketplace,
      p_status: job.status,
      p_started_at: new Date(job.startedAt).toISOString(),
      p_finished_at: new Date(job.finishedAt).toISOString(),
      p_duration_sec: job.durationSec,
      p_packer_name: job.packerName ?? null,
    });
    if (error) throw new Error(error.message);
    return;
  }
  if (!job.uploaded) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sesi login habis — buka ulang halaman");
    await uploadBlob(job, token, (p) => emit({ uploading: { recordId: job.recordId, progress: p } }));
    job.uploaded = true;
    await putJob(job);
  }
  const { error } = await supabase.rpc("attach_pack_video", {
    p_id: job.recordId,
    p_path: job.path,
    p_size: job.blob.size,
    p_mime: job.mime,
  });
  if (error) throw new Error(error.message);
  doneRecords.add(job.recordId);
}

let running = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Proses semua job berurutan. Berhenti di job pertama yang gagal lalu coba lagi nanti. */
export async function processQueue(): Promise<void> {
  if (running) return;
  running = true;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  try {
    const jobs = (await listJobs()).sort((a, b) => a.key.localeCompare(b.key));
    emit({ pending: jobs.length });
    for (const job of jobs) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        emit({ lastError: "Offline — video disimpan di HP dan diupload otomatis saat online" });
        break;
      }
      try {
        await runJob(job);
        await deleteJob(job.key);
        emit({ pending: Math.max(0, status.pending - 1), uploading: null, lastError: null });
      } catch (e) {
        job.attempts++;
        await putJob(job).catch(() => {});
        emit({ uploading: null, lastError: e instanceof Error ? e.message : String(e) });
        break;
      }
    }
  } finally {
    running = false;
    const left = (await listJobs().catch(() => [])).length;
    emit({ pending: left });
    if (left > 0) retryTimer = setTimeout(() => void processQueue(), 15_000);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void processQueue());
}
