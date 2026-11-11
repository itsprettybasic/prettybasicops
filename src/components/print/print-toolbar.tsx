"use client";

import { Printer, X } from "lucide-react";

/** Tombol di atas dokumen — tidak ikut tercetak. */
export function PrintToolbar({ fileName }: { fileName: string }) {
  return (
    <div className="sticky top-0 z-10 mb-4 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 print:hidden">
      <div className="min-w-0 text-[12.5px] text-grey-1">
        Pilih <strong className="text-ink-2">Simpan sebagai PDF</strong> di jendela cetak untuk menyimpan file{" "}
        <span className="hidden sm:inline">({fileName}.pdf)</span>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => window.close()}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-2 hover:border-grey-3"
        >
          <X className="h-3.5 w-3.5" /> Tutup
        </button>
        <button
          type="button"
          onClick={() => {
            const prev = document.title;
            document.title = fileName;
            window.print();
            document.title = prev;
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-primary bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
        >
          <Printer className="h-3.5 w-3.5" /> Cetak / PDF
        </button>
      </div>
    </div>
  );
}
