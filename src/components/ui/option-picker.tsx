"use client";

import { useMemo, useState } from "react";
import { Combobox, type ComboOption } from "@/components/ui/combobox";

const EMPTY = "__empty__";

/** "  broken   white " → "broken white" (untuk cek dobel tanpa beda huruf besar/kecil & spasi) */
export function optionKey(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Daftar opsi unik (tanpa dobel beda huruf besar/kecil), diurutkan. */
export function uniqueOptions(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = (v ?? "").replace(/\s+/g, " ").trim();
    if (t && !seen.has(optionKey(t))) seen.set(optionKey(t), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "id"));
}

/**
 * Pilih dari daftar yang sudah ada, atau tambah baru lewat "+ Tambah …".
 * Ketik nama yang sudah ada (beda huruf besar/kecil) → otomatis pakai yang sudah ada, jadi tidak dobel.
 */
export function OptionPicker({
  options,
  value,
  onChange,
  noun,
  placeholder,
  allowEmpty,
  invalid,
  size,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  /** mis. "jenis kain", "warna" */
  noun: string;
  placeholder?: string;
  /** Tampilkan opsi "— Kosong —" */
  allowEmpty?: boolean;
  invalid?: boolean;
  size?: "md" | "sm";
}) {
  const [added, setAdded] = useState<string[]>([]);
  const all = useMemo(() => uniqueOptions([...options, ...added, value]), [options, added, value]);

  const comboOptions: ComboOption[] = useMemo(
    () => [
      ...(allowEmpty ? [{ value: EMPTY, label: "— Kosong —" }] : []),
      ...all.map((o) => ({ value: o, label: o })),
    ],
    [all, allowEmpty],
  );

  function addNew(query: string) {
    let text = query.replace(/\s+/g, " ").trim();
    if (!text) text = (window.prompt(`Nama ${noun} baru`) ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const existing = all.find((o) => optionKey(o) === optionKey(text));
    if (existing) {
      onChange(existing);
      return;
    }
    setAdded((a) => [...a, text]);
    onChange(text);
  }

  return (
    <Combobox
      options={comboOptions}
      value={value ? (all.find((o) => optionKey(o) === optionKey(value)) ?? value) : null}
      onChange={(v) => onChange(!v || v === EMPTY ? "" : v)}
      placeholder={placeholder ?? `Pilih ${noun}`}
      emptyText={`Belum ada — pilih "+ Tambah" di bawah`}
      invalid={invalid}
      size={size}
      footerAction={{
        label: (q) => {
          const t = q.replace(/\s+/g, " ").trim();
          if (!t) return `+ Tambah ${noun} baru`;
          const existing = all.find((o) => optionKey(o) === optionKey(t));
          return existing ? `Pakai "${existing}" (sudah ada)` : `+ Tambah ${noun} "${t}"`;
        },
        onSelect: addNew,
      }}
    />
  );
}
