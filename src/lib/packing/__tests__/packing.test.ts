import { describe, expect, it } from "vitest";
import { decideScan, needsDuplicateWarning, normalizeResi, rememberScan, type ScanPhase } from "../scan-rules";
import { computeExpiry, daysLeft, videoState } from "../expiry";
import { buildVideoPath, extFromMime, pickMimeType } from "../media";
import { loginEmail } from "../types";

const cfg = { cooldownMs: 2500 };
const fresh = { lastCode: null, lastAt: 0 };
const T0 = 1_000_000;
const recording: ScanPhase = { phase: "recording", resi: "SPXID0123456789", startedAt: T0 };

describe("Aturan scan", () => {
  it("idle: scan resi → mulai rekam", () => {
    expect(decideScan({ phase: "idle" }, " spxid0123456789 ", T0, fresh, cfg)).toEqual({ type: "start", resi: "SPXID0123456789" });
  });
  it("resi lain saat merekam ditolak dengan pesan jelas", () => {
    const d = decideScan(recording, "JX9876543210", T0 + 20_000, fresh, cfg);
    expect(d).toEqual({
      type: "reject",
      resi: "JX9876543210",
      message: "Masih merekam SPXID0123456789. Selesaikan paket ini dulu.",
    });
  });
  it("scan ganda (masih cooldown) diabaikan", () => {
    const mem = rememberScan("SPXID0123456789", T0);
    expect(decideScan(recording, "SPXID0123456789", T0 + 800, mem, cfg)).toEqual({ type: "ignore", reason: "cooldown" });
  });
  it("resi sama saat merekam tidak menghentikan rekaman (selesai hanya lewat tombol)", () => {
    expect(decideScan(recording, "SPXID0123456789", T0 + 4_000, fresh, cfg)).toEqual({ type: "ignore", reason: "recording" });
    expect(decideScan(recording, "SPXID0123456789", T0 + 600_000, fresh, cfg)).toEqual({ type: "ignore", reason: "recording" });
  });
  it("kode yang bukan resi diabaikan", () => {
    expect(normalizeResi("https://shopee.co.id/x?y=1")).toBeNull();
    expect(normalizeResi("123")).toBeNull();
    expect(decideScan({ phase: "idle" }, "abc", T0, fresh, cfg)).toEqual({ type: "ignore", reason: "invalid" });
  });
  it("duplikat memberi peringatan hanya kalau aktif dan pernah direkam", () => {
    const h = { record_count: 1, last_finished_at: "2026-10-20T10:00:00Z", last_packer_name: "Budi" };
    expect(needsDuplicateWarning(h, true)).toBe(true);
    expect(needsDuplicateWarning(h, false)).toBe(false);
    expect(needsDuplicateWarning({ ...h, record_count: 0 }, true)).toBe(false);
    expect(needsDuplicateWarning(null, true)).toBe(false);
  });
});

describe("Kedaluwarsa video", () => {
  it("= jam selesai + lama simpan", () => {
    expect(computeExpiry(new Date("2026-10-20T10:02:00Z"), 14).toISOString()).toBe("2026-11-03T10:02:00.000Z");
    expect(computeExpiry(new Date("2026-10-20T10:02:00Z"), 7).toISOString()).toBe("2026-10-27T10:02:00.000Z");
  });
  it("sisa hari dibulatkan ke atas, tidak minus", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    expect(daysLeft("2026-10-27T10:00:00Z", now)).toBe(1);
    expect(daysLeft("2026-11-03T12:00:00Z", now)).toBe(8);
    expect(daysLeft("2026-10-25T00:00:00Z", now)).toBe(0);
  });
  it("status video", () => {
    expect(videoState({ status: "selesai", video_path: "a", video_deleted_at: "x" })).toBe("expired");
    expect(videoState({ status: "selesai", video_path: "a", video_deleted_at: null })).toBe("available");
    expect(videoState({ status: "selesai", video_path: null, video_deleted_at: null })).toBe("uploading");
    expect(videoState({ status: "dibatalkan", video_path: null, video_deleted_at: null })).toBe("none");
  });
});

describe("File video", () => {
  it("nama file <tahun>/<bulan>/<resi>_<timestamp>.<ext> (WIB)", () => {
    const ts = Date.UTC(2026, 9, 31, 18, 0, 0); // 1 Nov 01.00 WIB
    expect(buildVideoPath("SPX/123", ts, "mp4")).toBe(`2026/11/SPX123_${ts}.mp4`);
  });
  it("pilih mime yang didukung", () => {
    expect(pickMimeType((m) => m.startsWith("video/webm"))).toBe("video/webm;codecs=vp9");
    expect(pickMimeType((m) => m === "video/mp4")).toBe("video/mp4");
    expect(pickMimeType(() => false)).toBeNull();
    expect(extFromMime("video/mp4;codecs=avc1")).toBe("mp4");
    expect(extFromMime("video/webm")).toBe("webm");
  });
  it("login pakai username atau email", () => {
    expect(loginEmail(" Budi ")).toBe("budi@petugas.prettybasic.id");
    expect(loginEmail("admin@prettybasic.id")).toBe("admin@prettybasic.id");
  });
});
