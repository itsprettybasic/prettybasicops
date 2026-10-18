"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  onOpenChange,
  title,
  sub,
  eyebrow,
  wide,
  size,
  footerLeft,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  eyebrow?: string;
  wide?: boolean;
  size?: "sm";
  /** Aksi di kiri footer */
  footerLeft?: React.ReactNode;
  /** Aksi di kanan footer */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-[rgba(15,23,42,0.5)]" />
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
          <Dialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className={cn(
              "pointer-events-auto max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white px-4 py-5 sm:px-8 sm:py-7 shadow-[0_20px_60px_rgba(15,23,42,0.15)] focus:outline-none",
              size === "sm" ? "max-w-[480px]" : wide ? "max-w-[980px]" : "max-w-[820px]",
            )}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                {eyebrow && (
                  <div className="mb-1 text-[11px] font-bold tracking-[0.08em] text-primary-2 uppercase">{eyebrow}</div>
                )}
                <Dialog.Title className="mb-1 text-xl font-bold tracking-[-0.015em] text-ink">{title}</Dialog.Title>
                {sub && <div className="text-[13px] text-grey-1">{sub}</div>}
              </div>
              <Dialog.Close
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line bg-white text-grey-1 hover:border-grey-3 hover:text-ink"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            {children}
            {(footer || footerLeft) && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-2.5 border-t border-line pt-[18px]">
                <div className="flex flex-wrap gap-2.5">{footerLeft}</div>
                <div className="ml-auto flex flex-wrap justify-end gap-2.5">{footer}</div>
              </div>
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
