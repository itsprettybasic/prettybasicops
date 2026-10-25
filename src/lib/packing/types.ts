export type AppRole = "admin" | "supervisor" | "petugas";
export type PackStatus = "merekam" | "selesai" | "dibatalkan" | "dihentikan_otomatis" | "terputus";
export type PackQuality = "hemat" | "standar" | "tinggi";

export interface PackSettings {
  retention_days: number;
  max_duration_sec: number;
  min_duration_sec: number;
  quality: PackQuality;
  marketplaces: string[];
  /** Nama yang packing (mis. Lulu, Lala), dipilih sebelum mulai rekam. Kosong = pakai nama akun. */
  packers: string[];
  duplicate_warning: boolean;
  record_audio: boolean;
  storage_quota_gb: number;
  updated_at: string;
  updated_by_name: string | null;
}

export interface PackRecord {
  id: string;
  resi: string;
  marketplace: string;
  packer_id: string;
  packer_name: string;
  version: number;
  started_at: string;
  finished_at: string | null;
  duration_sec: number | null;
  status: PackStatus;
  video_path: string | null;
  video_size: number | null;
  video_mime: string | null;
  video_uploaded_at: string | null;
  video_expires_at: string | null;
  video_deleted_at: string | null;
  order_id: string | null;
  created_at: string;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  petugas: "Petugas Packing",
};

export const PACK_STATUS_LABEL: Record<PackStatus, string> = {
  merekam: "Sedang merekam",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
  dihentikan_otomatis: "Dihentikan otomatis",
  terputus: "Terputus",
};

/** Resolusi & bitrate per kualitas. Bitrate Hemat dijaga supaya 10 menit < 50 MB (batas file paket gratis Supabase). */
export const QUALITY_PRESET: Record<PackQuality, { label: string; width: number; height: number; bitrate: number }> = {
  hemat: { label: "Hemat (480p)", width: 854, height: 480, bitrate: 600_000 },
  standar: { label: "Standar (720p)", width: 1280, height: 720, bitrate: 1_200_000 },
  tinggi: { label: "Tinggi (1080p)", width: 1920, height: 1080, bitrate: 2_500_000 },
};

export const RETENTION_OPTIONS = [7, 14, 30, 60, 90];

/** Akun petugas login pakai username; di Supabase Auth disimpan sebagai email di domain ini (tidak pernah dikirimi email). */
export const STAFF_EMAIL_DOMAIN = "petugas.prettybasic.id";

export function loginEmail(input: string): string {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${STAFF_EMAIL_DOMAIN}`;
}

/** Perkiraan ukuran video (MB) untuk durasi tertentu. */
export function estimateSizeMb(quality: PackQuality, seconds: number): number {
  return (QUALITY_PRESET[quality].bitrate * seconds) / 8 / 1024 / 1024;
}
