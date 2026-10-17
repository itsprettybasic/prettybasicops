"use client";

import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface ComboOption {
  value: string;
  label: string;
  /** Baris kedua kecil abu (mis. kode SKU) */
  sublabel?: string;
  /** Info kecil di kanan (mis. stock) */
  right?: React.ReactNode;
  /** Teks tambahan untuk pencarian */
  keywords?: string;
  disabled?: boolean;
}

const MAX_RESULTS = 50;

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Cocok jika setiap kata yang diketik muncul di mana saja (case-insensitive). "polly blue" → POLLYTOP-BLUE-XSS */
export function matchOption(option: ComboOption, query: string) {
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize(`${option.label} ${option.sublabel ?? ""} ${option.keywords ?? ""}`);
  return q.split(" ").every((word) => hay.includes(word));
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Ketik untuk cari...",
  emptyText = "Tidak ditemukan",
  disabled,
  invalid,
  inputRef,
  onEnterAfterSelect,
  footerAction,
  className,
  size = "md",
}: {
  options: ComboOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Dipanggil setelah opsi dipilih lewat keyboard (Enter) — mis. pindah fokus ke kolom qty. */
  onEnterAfterSelect?: () => void;
  /** Aksi di bawah daftar, mis. "+ Tambah konveksi baru" */
  footerAction?: { label: string; onSelect: (query: string) => void };
  className?: string;
  size?: "md" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);
  const viaKeyboard = useRef(false);

  const selected = options.find((o) => o.value === value) ?? null;
  const results = useMemo(() => {
    const out: ComboOption[] = [];
    for (const o of options) {
      if (matchOption(o, query)) out.push(o);
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
  }, [options, query]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
    if (viaKeyboard.current) onEnterAfterSelect?.();
  }

  const displayValue = open ? query : selected ? (selected.sublabel ? `${selected.sublabel} — ${selected.label}` : selected.label) : "";

  return (
    <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
      <Command shouldFilter={false} loop className={cn("relative", className)}>
        <Popover.Anchor asChild>
          <div ref={anchorRef} className="relative">
            <Command.Input
              ref={inputRef}
              value={displayValue}
              disabled={disabled}
              placeholder={open && selected ? selected.label : placeholder}
              onValueChange={(v) => {
                setQuery(v);
                if (!open) setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onMouseDown={() => setOpen(true)}
              onKeyDown={(e) => {
                viaKeyboard.current = e.key === "Enter";
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Tab") setOpen(false);
              }}
              onBlur={(e) => {
                // Klik di dalam dropdown tidak menutup combobox
                const next = e.relatedTarget as Node | null;
                if (next && document.querySelector("[data-combo-content]")?.contains(next)) return;
                setOpen(false);
                setQuery("");
              }}
              className={cn(
                "w-full rounded-lg border bg-white pr-9 pl-3 font-medium text-ink placeholder:text-grey-2 focus:border-primary-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-line-2 disabled:text-grey-1",
                size === "md" ? "py-2.5 text-[13px]" : "py-1.5 text-[12.5px]",
                open && selected && "placeholder:text-ink-3",
                invalid ? "border-neg" : "border-line",
              )}
            />
            <span className="pointer-events-none absolute top-1/2 right-3.5 h-2 w-2 -translate-y-[70%] rotate-45 border-r-[1.5px] border-b-[1.5px] border-grey-1" />
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            data-combo-content
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
            style={{ width: "var(--radix-popover-trigger-width)" }}
            className="z-[200] min-w-[220px] overflow-hidden rounded-lg border border-line bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
          >
            <Command.List className="max-h-[260px] overflow-y-auto">
              {results.length === 0 && (
                <div className="px-3.5 py-3 text-[12.5px] text-grey-1">{emptyText}</div>
              )}
              {results.map((o) => (
                <Command.Item
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onSelect={() => pick(o.value)}
                  className="flex cursor-pointer items-center gap-3 border-b border-line-2 px-3.5 py-2.5 text-[13px] last:border-b-0 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 data-[selected=true]:bg-primary-tint"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink">{o.label}</div>
                    {o.sublabel && <div className="truncate text-[11px] font-medium text-grey-1">{o.sublabel}</div>}
                  </div>
                  {o.right !== undefined && <div className="num shrink-0 text-[11.5px] text-grey-1">{o.right}</div>}
                </Command.Item>
              ))}
              {footerAction && (
                <Command.Item
                  value="__footer_action__"
                  onMouseDown={(e) => e.preventDefault()}
                  onSelect={() => {
                    setOpen(false);
                    footerAction.onSelect(query);
                    setQuery("");
                  }}
                  className="cursor-pointer border-t border-line px-3.5 py-2.5 text-[12.5px] font-semibold text-primary-2 data-[selected=true]:bg-primary-tint"
                >
                  {footerAction.label}
                </Command.Item>
              )}
            </Command.List>
          </Popover.Content>
        </Popover.Portal>
      </Command>
    </Popover.Root>
  );
}
