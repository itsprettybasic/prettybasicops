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
import { useAppData } from "@/components/providers/app-data";
import { createBatch, createKonveksi, getNextBatchNo, listKonveksi, type Konveksi } from "@/app/actions/batch";
import { batchSchema } from "@/lib/validators";
import { fmtDate, fmtInt } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Line {
  skuId: string;
  suggested: number;
  qty: string;
}

export function BatchModal({
  open,
  onOpenChange,
  skuIds,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** SKU yang dicentang di tabel PPIC */
  skuIds: string[];
  onCreated?: () => void;
}) {
  const router = useRouter();
  const { today, params, rowById, skuOptions } = useAppData();

  const [batchNo, setBatchNo] = useState("");
  const [sentDate, setSentDate] = useState(today);
  const [konveksiId, setKonveksiId] = useState<string | null>(null);
  const [konveksi, setKonveksi] = useState<Konveksi[] | null>(null);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    skuIds.map((id) => {
      const suggested = rowById.get(id)?.suggestion ?? 0;
      return { skuId: id, suggested, qty: String(suggested > 0 ? suggested : 1) };
    }),
  );
  const [saving, setSaving] = useState<"draft" | "in_production" | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [newKonveksiName, setNewKonveksiName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getNextBatchNo(Number(today.slice(0, 4))).then((res) => {
      if (!alive) return;
      if (res.ok) setBatchNo((cur) => cur || res.data);
      else toast.error(`Gagal memuat No Batch: ${res.error}`);
    });
    listKonveksi().then((res) => {
      if (!alive) return;
      if (res.ok) {
        setKonveksi(res.data);
        if (res.data.length === 1) setKonveksiId(res.data[0].id);
      } else {
        toast.error(`Gagal memuat konveksi: ${res.error}`);
        setKonveksi([]);
      }
    });
    return () => {
      alive = false;
    };
  }, [today]);

  const konveksiOptions: ComboOption[] = (konveksi ?? []).map((k) => ({ value: k.id, label: k.name }));
  const lineIds = useMemo(() => new Set(lines.map((l) => l.skuId)), [lines]);
  const addOptions = useMemo(() => skuOptions.filter((o) => !lineIds.has(o.value)), [skuOptions, lineIds]);

  const parsed = lines.map((l) => {
    const n = Number(l.qty);
    return { ...l, row: rowById.get(l.skuId), qtyNum: l.qty !== "" && Number.isInteger(n) && n > 0 ? n : null };
  });
  const totalQty = parsed.reduce((s, l) => s + (l.qtyNum ?? 0), 0);
  const estDone = sentDate ? format(addDays(parseISO(sentDate), params.lead_time_days), "yyyy-MM-dd") : null;

  function updateQty(skuId: string, qty: string) {
    setLines((ls) => ls.map((l) => (l.skuId === skuId ? { ...l, qty } : l)));
  }

  function addSku(id: string | null) {
    if (!id || lineIds.has(id)) return;
    const suggested = rowById.get(id)?.suggestion ?? 0;
    setLines((ls) => [...ls, { skuId: id, suggested, qty: String(suggested > 0 ? suggested : 1) }]);
  }

  async function save(status: "draft" | "in_production") {
    setSubmitted(true);
    const input = {
      batch_no: batchNo,
      konveksi_id: konveksiId ?? "",
      sent_date: sentDate,
      est_done_date: estDone,
      status,
      note: note.trim() || null,
      lines: parsed.map((l) => ({ sku_id: l.skuId, qty_suggested: l.suggested, qty_planned: l.qtyNum ?? 0 })),
    };
    const check = batchSchema.safeParse(input);
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? "Data belum lengkap");
      return;
    }
    setSaving(status);
    const res = await createBatch(check.data);
    setSaving(null);
    if (!res.ok) {
      toast.error(`Gagal menyimpan batch: ${res.error}`);
      return;
    }
    toast.success(
      status === "draft"
        ? `${res.data.batch_no} disimpan sebagai draft`
        : `${res.data.batch_no} dikirim ke ${konveksi?.find((k) => k.id === konveksiId)?.name ?? "konveksi"} · ${fmtInt(totalQty)} pcs`,
    );
    onCreated?.();
    onOpenChange(false);
    router.refresh();
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        wide
        title="Buat Batch Produksi Baru"
        sub="Konfirmasi SKU & qty · Kirim ke konveksi"
        footer={
          <>
            <Button onClick={() => onOpenChange(false)}>Batal</Button>
            <Button loading={saving === "draft"} disabled={saving !== null} onClick={() => save("draft")}>
              Simpan sebagai Draft
            </Button>
            <Button
              variant="blue"
              loading={saving === "in_production"}
              disabled={saving !== null}
              onClick={() => save("in_production")}
            >
              Kirim ke Konveksi
            </Button>
          </>
        }
      >
        <InfoBanner head="Ringkasan Batch">
          <strong>{fmtInt(lines.length)} SKU</strong> terpilih · Total <strong>{fmtInt(totalQty)} pcs</strong> · Estimasi
          selesai <strong>{fmtDate(estDone)}</strong>
        </InfoBanner>

        <div className="grid grid-cols-3 gap-4">
          <div className="mb-4">
            <label className="form-label">No Batch</label>
            <input
              className={cn("form-input", submitted && !batchNo.trim() && "error")}
              value={batchNo}
              placeholder="Memuat..."
              onChange={(e) => setBatchNo(e.target.value.toUpperCase())}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Tanggal Kirim</label>
            <input
              type="date"
              className={cn("form-input", submitted && !sentDate && "error")}
              value={sentDate}
              onChange={(e) => setSentDate(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Konveksi</label>
            <Combobox
              options={konveksiOptions}
              value={konveksiId}
              onChange={setKonveksiId}
              invalid={submitted && !konveksiId}
              placeholder={konveksi === null ? "Memuat..." : "Pilih konveksi..."}
              emptyText="Konveksi tidak ditemukan"
              footerAction={{ label: "+ Tambah konveksi baru", onSelect: (q) => setNewKonveksiName(q) }}
            />
          </div>
        </div>

        <div className="mt-1 mb-2 flex items-end justify-between gap-4">
          <div className="text-[11px] font-bold tracking-[0.06em] text-grey-1 uppercase">SKU dalam Batch</div>
          <div className="w-[340px]">
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

        <table className="sku-row-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th className="num w-[100px]">Saran</th>
              <th className="num w-[120px]">Qty Final</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {parsed.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-[12.5px] text-grey-1">
                  Belum ada SKU. Tambahkan lewat kolom di atas.
                </td>
              </tr>
            )}
            {parsed.map((l) => (
              <tr key={l.skuId}>
                <td>
                  <SkuCell label={l.row?.label ?? "SKU tidak aktif"} code={l.row?.code ?? "—"} />
                </td>
                <td className="num text-grey-1">{l.suggested > 0 ? fmtInt(l.suggested) : "—"}</td>
                <td className="num">
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className={cn("qty-input", submitted && !l.qtyNum && "error")}
                    value={l.qty}
                    onChange={(e) => updateQty(l.skuId, e.target.value)}
                  />
                </td>
                <td className="text-center">
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((x) => x.skuId !== l.skuId))}
                    aria-label="Hapus baris"
                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-grey-2 hover:bg-neg-tint hover:text-neg"
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
              </tr>
            </tfoot>
          )}
        </table>

        <div className="mt-4">
          <label className="form-label">Catatan untuk Konveksi (opsional)</label>
          <textarea
            className="form-input"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Prioritas, deadline khusus..."
          />
        </div>
      </Modal>

      {newKonveksiName !== null && (
        <NewKonveksiModal
          initialName={newKonveksiName}
          onClose={() => setNewKonveksiName(null)}
          onCreated={(k) => {
            setKonveksi((ks) => [...(ks ?? []), k].sort((a, b) => a.name.localeCompare(b.name)));
            setKonveksiId(k.id);
            setNewKonveksiName(null);
          }}
        />
      )}
    </>
  );
}

function NewKonveksiModal({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (k: Konveksi) => void;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Nama konveksi wajib diisi");
      return;
    }
    setSaving(true);
    const res = await createKonveksi({ name, capacity_per_day: null });
    setSaving(false);
    if (!res.ok) {
      toast.error(`Gagal menambah konveksi: ${res.error}`);
      return;
    }
    toast.success(`${res.data.name} ditambahkan`);
    onCreated(res.data);
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Tambah Konveksi"
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Simpan Konveksi
          </Button>
        </>
      }
    >
      <div>
        <label className="form-label">Nama Konveksi</label>
        <input
          autoFocus
          className="form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mis. Konveksi Sejahtera"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
      </div>
    </Modal>
  );
}
