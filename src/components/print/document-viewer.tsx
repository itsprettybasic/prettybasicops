"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, ExternalLink, Loader2, Printer, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

/** Lebar iframe tetap supaya tata letak dokumen selalu sama (A4 = 794px + ruang). */
const FRAME_W = 860;
/** A4 dalam mm, margin PDF 10 mm di semua sisi. */
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 10;

/** Style yang disisipkan ke halaman dokumen saat tampil di dalam popup. */
const EMBED_CSS = `[data-print-toolbar]{display:none!important}body>div{padding-top:16px}`;

async function renderPdf(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  const paper = doc?.querySelector<HTMLElement>("[data-paper]");
  if (!doc || !paper) throw new Error("Dokumen belum siap");
  await doc.fonts?.ready;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  const cs = frame.contentWindow!.getComputedStyle(paper);
  const padTop = parseFloat(cs.paddingTop);
  const padLeft = parseFloat(cs.paddingLeft);
  const contentW = paper.clientWidth - padLeft - parseFloat(cs.paddingRight);
  const top = paper.getBoundingClientRect().top + padTop;

  // Titik potong halaman yang aman: bawah tiap baris tabel & tiap blok utama
  const breaks = Array.from(paper.querySelectorAll<HTMLElement>("tr, :scope > *, :scope > * > *"))
    .map((el) => el.getBoundingClientRect().bottom - top)
    .filter((y) => y > 0)
    .sort((a, b) => a - b);

  const scale = 2;
  const canvas = await html2canvas(paper, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    onclone: (_d, el) => {
      el.style.padding = "0";
      el.style.margin = "0";
      el.style.boxShadow = "none";
      el.style.width = `${contentW}px`;
      el.style.maxWidth = "none";
    },
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const usableW = PAGE_W - MARGIN * 2;
  const usableH = PAGE_H - MARGIN * 2;
  const pxPerMm = contentW / usableW; // CSS px per mm
  const pageCss = usableH * pxPerMm; // tinggi 1 halaman dalam CSS px
  const totalCss = canvas.height / scale;

  let start = 0;
  let first = true;
  while (start < totalCss - 1) {
    let end = Math.min(start + pageCss, totalCss);
    if (end < totalCss) {
      const safe = breaks.filter((y) => y > start + pageCss * 0.35 && y <= start + pageCss);
      if (safe.length) end = safe[safe.length - 1];
    }
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.ceil((end - start) * scale);
    const ctx = slice.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, Math.floor(start * scale), canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN, MARGIN, usableW, (end - start) / pxPerMm);
    first = false;
    start = end;
  }
  return pdf.output("blob");
}

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Popup pratinjau dokumen (PO, Bukti Penerimaan, Surat Jalan) dengan Download PDF, Cetak & Bagikan. */
export function DocumentViewer({
  open,
  onOpenChange,
  url,
  fileName,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  fileName: string;
  title: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(1123);
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState<null | "pdf" | "share">(null);

  useEffect(() => {
    if (open) setReady(false);
  }, [open, url]);

  // Skala pratinjau mengikuti lebar popup (HP tetap muat)
  useEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (box.clientWidth - 8) / FRAME_W)));
    ro.observe(box);
    return () => ro.disconnect();
  }, [open, ready]);

  const onLoad = useCallback(async () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const style = doc.createElement("style");
    style.textContent = EMBED_CSS;
    doc.head.appendChild(style);
    await doc.fonts?.ready;
    // tunggu logo
    await Promise.all(
      Array.from(doc.images).map((img) => (img.complete ? null : new Promise((r) => img.addEventListener("load", r, { once: true })))),
    );
    setHeight(doc.documentElement.scrollHeight);
    setReady(true);
  }, []);

  async function getPdf() {
    if (!frameRef.current) throw new Error("Dokumen belum siap");
    return renderPdf(frameRef.current);
  }

  async function download() {
    setBusy("pdf");
    try {
      saveBlob(await getPdf(), `${fileName}.pdf`);
      toast.success(`${fileName}.pdf diunduh`);
    } catch (e) {
      toast.error(`Gagal membuat PDF: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  function print() {
    const w = frameRef.current?.contentWindow;
    if (!w) return;
    const prev = w.document.title;
    w.document.title = fileName;
    w.focus();
    w.print();
    w.document.title = prev;
  }

  async function share() {
    setBusy("share");
    try {
      const blob = await getPdf();
      const file = new File([blob], `${fileName}.pdf`, { type: "application/pdf" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${title} ${fileName}` });
        } catch (e) {
          if ((e as Error).name !== "AbortError") throw e;
        }
      } else {
        saveBlob(blob, file.name);
        toast.success("PDF sudah diunduh — lampirkan file-nya ke WhatsApp atau email", { duration: 6000 });
      }
    } catch (e) {
      toast.error(`Gagal membagikan: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:px-4";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-[rgba(15,23,42,0.55)]" />
        <div className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-6">
          <Dialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="pointer-events-auto flex h-[94vh] w-full max-w-[960px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_rgba(15,23,42,0.2)] focus:outline-none"
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
              <div className="mr-auto min-w-0">
                <div className="text-[11px] font-bold tracking-[0.08em] text-primary-2 uppercase">{title}</div>
                <Dialog.Title className="truncate text-[16px] font-bold text-ink">{fileName}</Dialog.Title>
              </div>
              <button
                type="button"
                disabled={!ready || !!busy}
                onClick={download}
                className={cn(btn, "border-primary bg-primary text-white hover:bg-primary-hover")}
              >
                {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Download PDF
              </button>
              <button type="button" disabled={!ready} onClick={print} className={cn(btn, "border-line bg-white text-ink-2 hover:border-grey-3")}>
                <Printer className="h-3.5 w-3.5" /> Cetak
              </button>
              <button
                type="button"
                disabled={!ready || !!busy}
                onClick={share}
                className={cn(btn, "border-line bg-white text-ink-2 hover:border-grey-3")}
              >
                {busy === "share" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                Bagikan
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener"
                title="Buka di tab baru"
                aria-label="Buka di tab baru"
                className="hidden h-9 w-9 items-center justify-center rounded-lg border border-line text-grey-1 hover:border-grey-3 hover:text-ink sm:inline-flex"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <Dialog.Close
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-white text-grey-1 hover:border-grey-3 hover:text-ink"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div ref={boxRef} className="relative min-h-0 flex-1 overflow-y-auto bg-[#e9edf2]">
              {!ready && (
                <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#e9edf2] text-[13px] text-grey-1">
                  <Loader2 className="h-4 w-4 animate-spin" /> Menyiapkan dokumen...
                </div>
              )}
              <div className="mx-auto overflow-hidden" style={{ width: FRAME_W * scale, height: height * scale }}>
                {open && (
                  <iframe
                    ref={frameRef}
                    src={url}
                    title={`${title} ${fileName}`}
                    onLoad={onLoad}
                    className="origin-top-left border-0"
                    style={{ width: FRAME_W, height, transform: `scale(${scale})` }}
                  />
                )}
              </div>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Tombol yang membuka popup dokumen. */
export function DocumentButton({
  url,
  fileName,
  title,
  label,
  className,
  iconOnly,
}: {
  url: string;
  fileName: string;
  title: string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title={iconOnly ? `${title} ${fileName}` : undefined}
        aria-label={iconOnly ? `${title} ${fileName}` : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          className ??
          (iconOnly
            ? "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-grey-1 hover:bg-primary-tint hover:text-primary-2"
            : "inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-line bg-white px-4 py-[9px] text-[13px] font-semibold text-ink-2 hover:border-grey-3")
        }
      >
        <Printer className="h-3.5 w-3.5" />
        {!iconOnly && (label ?? title)}
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()}>
          <DocumentViewer open={open} onOpenChange={setOpen} url={url} fileName={fileName} title={title} />
        </div>
      )}
    </>
  );
}
