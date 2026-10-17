import { addMonths, differenceInCalendarDays, format, getDaysInMonth, parseISO, startOfMonth } from "date-fns";

/** Key bulan `yyyy-MM` untuk tanggal `yyyy-MM-dd`. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Bulan relatif terhadap `today`: 0 = bulan berjalan, -1 = H-1, dst. Mengembalikan tanggal awal bulan `yyyy-MM-dd`. */
export function monthStart(today: string, offset: number): string {
  return format(addMonths(startOfMonth(parseISO(today)), offset), "yyyy-MM-dd");
}

export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

export function daysInMonth(monthStartDate: string): number {
  return getDaysInMonth(parseISO(monthStartDate));
}
