"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { InfoBanner } from "@/components/ui/info-banner";
import { SkuCell } from "@/components/ui/table-parts";
import { StatusBadge } from "@/components/ui/badge";
import { STATUS_PRIORITY } from "@/lib/ppic";
import { useAppData } from "@/components/providers/app-data";
import { getNextPoBatch, getNextPoNo, listVendors, savePurchaseOrder, type PoDetail, type Vendor } from "@/app/actions/po";
import { poSchema } from "@/lib/validators";
import { fmtDate, fmtInt, fmtRupiah } from "@/lib/format";
import { cn } from "@/lib/cn";
import { VendorFormModal } from "./vendor-form-modal";
import { poName } from "@/lib/doc-names";

interface Line {
  skuId: string;
  label: string;
  code: string;
  suggested: number;
  qty: string;
  price: string;
  /** Sudah diterima (mode edit) — qty tidak boleh di bawah ini */
  received: number;
}

/** Angka → teks input harga (desimal pakai koma, sesuai format Indonesia). */
const priceStr = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

function parsePrice(s: string): number | null | undefined {
  const t = s.replace(/[.\s]/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Buat PO baru (dari SKU yang dicentang di PPIC, atau kosong) atau ubah PO yang ada. */
export function PoFormModal({
  open,
  onOpenChange,
  skuIds = [],
  po,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skuIds?: string[];
  /** Isi = mode edit */
  po?: PoDetail | null;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const { today, params, rows, rowById, skuOptions } = useAppData();
  const editing = !!po;

  const [poNo, setPoNo] = useState(po?.po_no ?? "");
  const [poDate, setPoDate] = useState(po?.po_date ?? today);
  const [expected, setExpected] = useState(
    po ? (po.expected_date ?? "") : format(addDays(parseISO(today), params.lead_time_days), "yyyy-MM-dd"),
  );
  const [vendorId, setVendorId] = useState<string | null>(po?.vendor_id ?? null);
  const [batch, setBatch] = useState(po?.batch ?? "");
  // Batch diisi otomatis (batch berikutnya untuk vendor) sampai user mengetik sendiri
  const [batchTouched, setBatchTouched] = useState(!!po);
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [note, setNote] = useState(po?.note ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    po
      ? po.lines.map((l) => ({
          skuId: l.sku_id,
          label: l.label,
          code: l.code,
          suggested: l.qty_suggested,
          qty: String(l.qty),
          price: priceStr(l.unit_price),
          received: l.qty_received,
        }))
      : skuIds.map((id) => newLine(id)),
  );
  const [saving, setSaving] = useState<"draft" | "open" | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [newVendorName, setNewVendorName] = useState<string | null>(null);

  function newLine(id: string): Line {
    const row = rowById.get(id);
    const suggested = row?.suggestion ?? 0;
    return {
      skuId: id,
      label: row?.label ?? "SKU tidak aktif",
      code: row?.code ?? "—",
      suggested,
      qty: String(suggested > 0 ? suggested : 1),
      price: row?.unit_cost ? priceStr(row.unit_cost) : "",
      received: 0,
    };
  }

  useEffect(() => {
    let alive = true;
    if (!po) {
      getNextPoNo(Number(today.slice(0, 4))).then((res) => {
        if (!alive) return;
        if (res.ok) setPoNo((cur) => cur || res.data);
        else toast.error(`Gagal memuat No PO: ${res.error}`);
      });
    }
    listVendors().then((res) => {
      if (!alive) return;
      if (res.ok) {
        setVendors(res.data);
        if (!po && res.data.length === 1) setVendorId(res.data[0].id);
      } else {
        toast.error(`Gagal memuat vendor: ${res.error}`);
        setVendors([]);
      }
    });
    return () => {
      alive = false;
    };
  }, [today, po]);

  useEffect(() => {
    if (batchTouched || !vendorId) return;
    let alive = true;
    getNextPoBatch(vendorId).then((res) => {
      if (alive && res.ok) setBatch(res.data);
    });
    return () => {
      alive = false;
    };
  }, [vendorId, batchTouched]);

  const vendorOptions: ComboOption[] = (vendors ?? []).map((v) => ({
    value: v.id,
    label: v.name,
    sublabel: [v.contact_person, v.phone].filter(Boolean).join(" · ") || undefined,
  }));
  // Vendor PO lama yang sudah nonaktif tetap tampil
  if (po && vendorId === po.vendor_id && !vendorOptions.some((o) => o.value === po.vendor_id)) {
    vendorOptions.unshift({ value: po.vendor_id, label: po.vendor.name, sublabel: "nonaktif" });
  }

  const lineIds = useMemo(() => new Set(lines.map((l) => l.skuId)), [lines]);
  const addOptions = useMemo(() => skuOptions.filter((o) => !lineIds.has(o.value)), [skuOptions, lineIds]);

  const parsed = lines.map((l) => {
    const n = Number(l.qty);
    const qtyNum = l.qty !== "" && Number.isInteger(n) && n > 0 ? n : null;
    const priceNum = parsePrice(l.price);
    return { ...l, qtyNum, priceNum, belowReceived: qtyNum !== null && qtyNum < l.received };
  });
  const totalQty = parsed.reduce((s, l) => s + (l.qtyNum ?? 0), 0);
  const hasPrice = parsed.some((l) => typeof l.priceNum === "number");
  const totalAmount = parsed.reduce((s, l) => s + (l.qtyNum ?? 0) * (l.priceNum ?? 0), 0);

  function update(skuId: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.skuId === skuId ? { ...l, ...patch } : l)));
  }

  function addSku(id: string | null) {
    if (!id || lineIds.has(id)) return;
    setLines((ls) => [...ls, newLine(id)]);
  }

  /** Tambah sekaligus semua SKU HABIS & PRODUKSI yang belum ada di PO (urut prioritas, saran terbesar dulu). */
  function addPriority() {
    const add = rows
      .filter((r) => (r.status === "HABIS" || r.status === "PRODUKSI") && !lineIds.has(r.id))
      .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || b.suggestion - a.suggestion);
    if (add.length === 0) {
      toast("Semua SKU HABIS & PRODUKSI sudah ada di PO");
      return;
    }
    setLines((ls) => [...ls, ...add.map((r) => newLine(r.id))]);
    toast.success(`${fmtInt(add.length)} SKU ditambahkan`);
  }

  /** Hapus semua baris (kecuali yang sudah ada penerimaannya). */
  function clearLines() {
    setLines((ls) => ls.filter((l) => l.received > 0));
  }

  async function save(status: "draft" | "open") {
    setSubmitted(true);
    if (parsed.some((l) => l.priceNum === undefined)) {
      toast.error("Harga/pcs harus angka");
      return;
    }
    const bad = parsed.find((l) => l.belowReceived);
    if (bad) {
      toast.error(`Qty ${bad.code} tidak boleh kurang dari yang sudah diterima (${fmtInt(bad.received)})`);
      return;
    }
    const input = {
      id: po?.id ?? null,
      po_no: poNo,
      batch: batch.trim() || null,
      vendor_id: vendorId ?? "",
      po_date: poDate,
      expected_date: expected || null,
      status,
      note: note.trim() || null,
      lines: parsed.map((l) => ({
        sku_id: l.skuId,
        qty_suggested: l.suggested,
        qty: l.qtyNum ?? 0,
        unit_price: l.priceNum ?? null,
      })),
    };
    const check = poSchema.safeParse(input);
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? "Data belum lengkap");
      return;
    }
    setSaving(status);
    const res = await savePurchaseOrder(check.data);
    setSaving(null);
    if (!res.ok) {
      toast.error(`Gagal menyimpan PO: ${res.error}`);
      return;
    }
    const vendorName = vendors?.find((v) => v.id === vendorId)?.name ?? po?.vendor.name ?? "vendor";
    toast.success(
      editing
        ? `${res.data.po_no} diperbarui`
        : status === "draft"
          ? `${res.data.po_no} disimpan sebagai draft`
          : `${res.data.po_no} dibuat untuk ${vendorName} · ${fmtInt(totalQty)} pcs`,
    );
    onSaved?.(res.data.id);
    onOpenChange(false);
    router.refresh();
  }

  const isDraft = !po || po.status === "draft";

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        wide
        eyebrow="Purchase Order"
        title={editing ? `Ubah ${po.po_no}` : "Buat PO Baru"}
        sub={editing ? "Perubahan langsung berlaku ke PO & dokumennya" : "Pesan barang ke vendor · semua satuan dalam pcs"}
        footer={
          <>
            <Button onClick={() => onOpenChange(false)}>Batal</Button>
            {isDraft && (
              <Button loading={saving === "draft"} disabled={saving !== null} onClick={() => save("draft")}>
                Simpan sebagai Draft
              </Button>
            )}
            <Button variant="blue" loading={saving === "open"} disabled={saving !== null} onClick={() => save("open")}>
              {isDraft ? "Simpan & Kirim PO" : "Simpan Perubahan"}
            </Button>
          </>
        }
      >
        <InfoBanner head="Ringkasan PO">
          <strong>{fmtInt(lines.length)} SKU</strong> · Total <strong>{fmtInt(totalQty)} pcs</strong>
          {hasPrice && (
            <>
              {" "}
              · Nilai <strong>{fmtRupiah(totalAmount)}</strong>
            </>
          )}{" "}
          · Kedatangan <strong>{fmtDate(expected || null)}</strong>
        </InfoBanner>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="mb-4">
            <label className="form-label">No PO</label>
            <input
              className={cn("form-input", submitted && !poNo.trim() && "error")}
              value={poNo}
              placeholder="Memuat..."
              onChange={(e) => setPoNo(e.target.value.toUpperCase())}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Tanggal PO</label>
            <input
              type="date"
              className={cn("form-input", submitted && !poDate && "error")}
              value={poDate}
              onChange={(e) => setPoDate(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Tanggal Kedatangan</label>
            <input
              type="date"
              className={cn("form-input", submitted && expected && expected < poDate && "error")}
              value={expected}
              min={poDate || undefined}
              onChange={(e) => setExpected(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Vendor</label>
            <Combobox
              options={vendorOptions}
              value={vendorId}
              onChange={setVendorId}
              invalid={submitted && !vendorId}
              placeholder={vendors === null ? "Memuat..." : "Pilih vendor..."}
              emptyText="Vendor tidak ditemukan"
              footerAction={{ label: "+ Tambah vendor baru", onSelect: (q) => setNewVendorName(q) }}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Batch</label>
            <input
              className="form-input"
              value={batch}
              maxLength={40}
              inputMode="numeric"
              placeholder={vendorId ? "Mis. 3" : "Pilih vendor dulu"}
              onChange={(e) => {
                setBatchTouched(true);
                setBatch(e.target.value);
              }}
            />
          </div>
        </div>
        {vendorId && (
          <div className="-mt-2 mb-3 text-[11.5px] text-grey-1">
            Nama dokumen:{" "}
            <span className="font-semibold text-ink-3">
              {poName({ vendor_name: vendors?.find((v) => v.id === vendorId)?.name ?? po?.vendor.name, batch, po_date: poDate || today })}
            </span>
          </div>
        )}

        <div className="mt-1 mb-2 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-end sm:gap-4">
          <div>
            <div className="text-[11px] font-bold tracking-[0.06em] text-grey-1 uppercase">SKU dalam PO</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              <button type="button" onClick={addPriority} className="cursor-pointer font-semibold text-primary-2 hover:underline">
                + Tambah semua HABIS & PRODUKSI
              </button>
              {lines.some((l) => l.received === 0) && (
                <button type="button" onClick={clearLines} className="cursor-pointer font-semibold text-grey-1 hover:text-neg">
                  Kosongkan
                </button>
              )}
            </div>
          </div>
          <div className="w-full sm:w-[340px]">
            <Combobox
              size="sm"
              options={addOptions}
              value={null}
              onChange={addSku}
              placeholder="+ Tambah SKU (ketik nama / kode)"
              emptyText="SKU tidak ditemukan"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="sku-row-table min-w-[640px]">
            <thead>
              <tr>
                <th>SKU</th>
                <th className="num w-[80px]">Saran</th>
                <th className="num w-[110px]">Qty (pcs)</th>
                <th className="num w-[130px]">Harga/pcs</th>
                <th className="num w-[120px]">Jumlah</th>
                <th className="w-9" />
              </tr>
            </thead>
            <tbody>
              {parsed.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[12.5px] text-grey-1">
                    Belum ada SKU. Ketik nama / kode di kolom &quot;Tambah SKU&quot; di atas, atau klik &quot;Tambah semua HABIS &amp;
                    PRODUKSI&quot;.
                  </td>
                </tr>
              )}
              {parsed.map((l) => (
                <tr key={l.skuId}>
                  <td>
                    <SkuCell label={l.label} code={l.code} />
                    {(() => {
                      const r = rowById.get(l.skuId);
                      if (!r) return null;
                      return (
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-grey-1">
                          <StatusBadge status={r.status} />
                          <span>
                            Stok <span className={cn("num font-semibold", r.stock <= 0 ? "text-neg" : "text-ink-3")}>{fmtInt(r.stock)}</span>
                            {r.inProduction > 0 && <> · dalam PO {fmtInt(r.inProduction)}</>}
                          </span>
                        </div>
                      );
                    })()}
                    {l.received > 0 && (
                      <div className={cn("text-[11px]", l.belowReceived ? "font-semibold text-neg" : "text-pos")}>
                        Sudah diterima {fmtInt(l.received)} pcs
                      </div>
                    )}
                  </td>
                  <td className="num text-grey-1">{l.suggested > 0 ? fmtInt(l.suggested) : "—"}</td>
                  <td className="num">
                    <input
                      type="number"
                      min={Math.max(1, l.received)}
                      inputMode="numeric"
                      className={cn("qty-input", ((submitted && !l.qtyNum) || l.belowReceived) && "error")}
                      value={l.qty}
                      onChange={(e) => update(l.skuId, { qty: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    <input
                      inputMode="decimal"
                      className={cn("qty-input !w-[110px]", l.priceNum === undefined && "error")}
                      value={l.price}
                      placeholder="opsional"
                      onChange={(e) => update(l.skuId, { price: e.target.value })}
                    />
                  </td>
                  <td className="num text-ink-3">
                    {typeof l.priceNum === "number" && l.qtyNum ? fmtRupiah(l.priceNum * l.qtyNum) : "—"}
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      disabled={l.received > 0}
                      title={l.received > 0 ? "SKU yang sudah diterima tidak bisa dihapus" : "Hapus baris"}
                      onClick={() => setLines((ls) => ls.filter((x) => x.skuId !== l.skuId))}
                      aria-label="Hapus baris"
                      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-grey-2 hover:bg-neg-tint hover:text-neg disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {parsed.length > 0 && (
              <tfoot>
                <tr>
                  <td className="text-grey-1">
                    Total: <span className="text-ink">{fmtInt(parsed.length)} SKU</span>
                  </td>
                  <td />
                  <td className="num pr-[10px] text-right text-ink">{fmtInt(totalQty)} pcs</td>
                  <td />
                  <td className="num text-ink">{hasPrice ? fmtRupiah(totalAmount) : "—"}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="mt-4">
          <label className="form-label">Catatan untuk Vendor (opsional)</label>
          <textarea
            className="form-input"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Prioritas, spesifikasi, syarat pembayaran..."
          />
        </div>
      </Modal>

      {newVendorName !== null && (
        <VendorFormModal
          vendor={null}
          initialName={newVendorName}
          onClose={() => setNewVendorName(null)}
          onSaved={(v) => {
            setVendors((vs) => [...(vs ?? []), v].sort((a, b) => a.name.localeCompare(b.name)));
            setVendorId(v.id);
            setNewVendorName(null);
          }}
        />
      )}
    </>
  );
}
