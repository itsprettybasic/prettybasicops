import { formatInTimeZone } from "date-fns-tz";
import { id as localeId } from "date-fns/locale";
import { parseISO } from "date-fns";

export const TIMEZONE = "Asia/Jakarta";

const intFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const decFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** Angka bulat format Indonesia: 1.047 */
export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return intFormat.format(Math.round(n));
}

/** Angka desimal (maks 1 digit) format Indonesia: 128,5 */
export function fmtDec(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return decFormat.format(n);
}

/** Angka bertanda: +248 / −312 (pakai minus sign asli). */
export function fmtSigned(n: number): string {
  if (n > 0) return `+${fmtInt(n)}`;
  if (n < 0) return `−${fmtInt(Math.abs(n))}`;
  return "0";
}

/** Rupiah ringkas: Rp 428jt / Rp 1,2M */
export function fmtRupiahShort(n: number): string {
  if (n >= 1e9) return `Rp ${decFormat.format(n / 1e9)}M`;
  if (n >= 1e6) return `Rp ${intFormat.format(Math.round(n / 1e6))}jt`;
  if (n >= 1e3) return `Rp ${intFormat.format(Math.round(n / 1e3))}rb`;
  return `Rp ${intFormat.format(n)}`;
}

export function fmtRupiah(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `Rp ${intFormat.format(n)}`;
}

/** Tanggal hari ini di Asia/Jakarta: `yyyy-MM-dd`. */
export function todayJakarta(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

function toDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  // `yyyy-MM-dd` diperlakukan sebagai tanggal kalender di Jakarta (tengah hari supaya aman dari pergeseran zona)
  return d.length === 10 ? parseISO(`${d}T12:00:00+07:00`) : parseISO(d);
}

/** Sabtu, 17 Oktober 2026 */
export function fmtDateLong(d: string | Date): string {
  return formatInTimeZone(toDate(d), TIMEZONE, "EEEE, d MMMM yyyy", { locale: localeId });
}

/** 17 Okt 2026 */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return formatInTimeZone(toDate(d), TIMEZONE, "d MMM yyyy", { locale: localeId });
}

/** 17 Okt */
export function fmtDateShort(d: string | Date): string {
  return formatInTimeZone(toDate(d), TIMEZONE, "dd MMM", { locale: localeId });
}

/** 14:20 */
export function fmtTime(d: string | Date): string {
  return formatInTimeZone(toDate(d), TIMEZONE, "HH:mm");
}

/** Juli 2026 */
export function fmtMonthYear(d: string | Date): string {
  return formatInTimeZone(toDate(d), TIMEZONE, "MMMM yyyy", { locale: localeId });
}

/** Sep */
export function fmtMonthShort(d: string | Date): string {
  return formatInTimeZone(toDate(d), TIMEZONE, "MMM", { locale: localeId });
}
