"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { VendorFormModal } from "@/components/po/vendor-form-modal";
import { useAppData } from "@/components/providers/app-data";
import { listVendors, type Vendor } from "@/app/actions/po";
import {
  getFabricSuggestions,
  getNextSjNo,
  listPosForVendor,
  saveFabricShipment,
  type FabricShipmentDetail,
} from "@/app/actions/fabric";
import { fabricShipmentSchema } from "@/lib/validators";
import { SHIPMENT_UNITS, SHIPMENT_UNIT_LABEL, fmtUnitTotals, sumByUnit, type ShipmentUnit } from "@/lib/fabric";
import { cn } from "@/lib/cn";

interface Line {
  key: number;
  fabric: string;
  color: string;
  qty: string;
  unit: ShipmentUnit;
  note: string;
}

let lineKey = 0;
/** Baris baru ikut satuan baris terakhir (default KG) */
const blank = (unit: ShipmentUnit = "kg"): Line => ({ key: ++lineKey, fabric: "", color: "", qty: "", unit, note: "" });

/** "12,5" / "12.5" → 12.5 ; kosong → null ; tidak valid → NaN */
function parseQty(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export function FabricFormModal({
  shipment,
  onClose,
  onSaved,
}: {
  /** Isi = mode edit */
  shipment?: FabricShipmentDetail | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const { today } = useAppData();
  const editing = !!shipment;

  const [sjNo, setSjNo] = useState(shipment?.sj_no ?? "");
  const [date, setDate] = useState(shipment?.ship_date ?? today);
  const [vendorId, setVendorId] = useState<string | null>(shipment?.vendor_id ?? null);
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [poId, setPoId] = useState<string | null>(shipment?.po_id ?? null);
  const [pos, setPos] = useState<{ id: string; po_no: string; po_date: string }[]>([]);
  const [driver, setDriver] = useState(shipment?.driver_name ?? "");
  const [vehicle, setVehicle] = useState(shipment?.vehicle_no ?? "");
  const [note, setNote] = useState(shipment?.note ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    shipment?.lines.length
      ? shipment.lines.map((l) => ({
          key: ++lineKey,
          fabric: l.fabric_type,
          color: l.color,
          qty: String(l.qty).replace(".", ","),
          unit: l.unit,
          note: l.note ?? "",
        }))
      : [blank()],
  );
  const [suggest, setSuggest] = useState<{ types: string[]; colors: string[] }>({ types: [], colors: [] });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [newVendorName, setNewVendorName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!shipment) {
      getNextSjNo(Number(today.slice(0, 4))).then((res) => {
        if (!alive) return;
        if (res.ok) setSjNo((cur) => cur || res.data);
        else toast.error(`Gagal memuat No Surat Jalan: ${res.error}`);
      });
    }
    listVendors().then((res) => {
      if (!alive) return;
      if (res.ok) setVendors(res.data);
      else {
        toast.error(`Gagal memuat vendor: ${res.error}`);
        setVendors([]);
      }
    });
    getFabricSuggestions().then((res) => alive && res.ok && setSuggest(res.data));
    return () => {
      alive = false;
    };
  }, [today, shipment]);

  useEffect(() => {
    if (!vendorId) {
      setPos([]);
      return;
    }
    let alive = true;
    listPosForVendor(vendorId).then((res) => {
      if (alive && res.ok) setPos(res.data);
    });
    return () => {
      alive = false;
    };
  }, [vendorId]);

  const vendorOptions: ComboOption[] = (vendors ?? []).map((v) => ({
    value: v.id,
    label: v.name,
    sublabel: [v.contact_person, v.phone].filter(Boolean).join(" · ") || undefined,
  }));
  if (shipment && !vendorOptions.some((o) => o.value === shipment.vendor_id)) {
    vendorOptions.unshift({ value: shipment.vendor_id, label: shipment.vendor.name, sublabel: "nonaktif" });
  }
  const poOptions: ComboOption[] = pos.map((p) => ({ value: p.id, label: p.po_no }));
  if (shipment?.po_id && shipment.po_no && vendorId === shipment.vendor_id && !poOptions.some((o) => o.value === shipment.po_id)) {
    poOptions.unshift({ value: shipment.po_id, label: shipment.po_no });
  }

  const parsed = lines.map((l) => {
    const qty = parseQty(l.qty);
    const empty = !l.fabric.trim() && !l.color.trim() && !l.qty.trim() && !l.note.trim();
    return {
      ...l,
      qtyNum: qty,
      empty,
      qtyBad: !empty && (qty === null || Number.isNaN(qty) || qty <= 0),
    };
  });
  const used = parsed.filter((l) => !l.empty);
  const totalText = fmtUnitTotals(
    sumByUnit(used.filter((l) => l.qtyNum && !Number.isNaN(l.qtyNum)).map((l) => ({ qty: l.qtyNum!, unit: l.unit }))),
  );

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function save() {
    setSubmitted(true);
    if (used.some((l) => l.qtyBad)) {
      toast.error("Qty harus angka lebih dari 0, mis. 12,5");
      return;
    }
    const input = {
      id: shipment?.id ?? null,
      sj_no: sjNo,
      ship_date: date,
      vendor_id: vendorId ?? "",
      po_id: poId,
      driver_name: driver,
      vehicle_no: vehicle,
      note,
      lines: used.map((l) => ({
        fabric_type: l.fabric,
        color: l.color,
        qty: l.qtyNum ?? 0,
        unit: l.unit,
        note: l.note,
      })),
    };
    const check = fabricShipmentSchema.safeParse(input);
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? "Data belum lengkap");
      return;
    }
    setSaving(true);
    const res = await saveFabricShipment(input);
    setSaving(false);
    if (!res.ok) {
      toast.error(`Gagal menyimpan: ${res.error}`);
      return;
    }
    toast.success(editing ? `${res.data.sj_no} diperbarui` : `${res.data.sj_no} tersimpan · ${totalText}`);
    onSaved?.(res.data.id);
    onClose();
    router.refresh();
  }

  return (
    <>
      <Modal
        open
        onOpenChange={(o) => !o && onClose()}
        wide
        eyebrow="Pengiriman Kain"
        title={editing ? `Ubah ${shipment.sj_no}` : "Catat Pengiriman Kain"}
        sub="Kain yang dikirim ke vendor · satuan bisa KG, Yard, Meter, atau Roll"
        footer={
          <>
            <Button onClick={onClose}>Batal</Button>
            <Button variant="blue" loading={saving} onClick={save}>
              {editing ? "Simpan Perubahan" : "Simpan Pengiriman"}
            </Button>
          </>
        }
      >
        <datalist id="fabric-types">
          {suggest.types.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <datalist id="fabric-colors">
          {suggest.colors.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="mb-4">
            <label className="form-label">No Surat Jalan</label>
            <input
              className={cn("form-input", submitted && !sjNo.trim() && "error")}
              value={sjNo}
              placeholder="Memuat..."
              onChange={(e) => setSjNo(e.target.value.toUpperCase())}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Tanggal Kirim</label>
            <input
              type="date"
              className={cn("form-input", submitted && !date && "error")}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Vendor</label>
            <Combobox
              options={vendorOptions}
              value={vendorId}
              onChange={(v) => {
                setVendorId(v);
                setPoId(null);
              }}
              invalid={submitted && !vendorId}
              placeholder={vendors === null ? "Memuat..." : "Pilih vendor..."}
              emptyText="Vendor tidak ditemukan"
              footerAction={{ label: "+ Tambah vendor baru", onSelect: (q) => setNewVendorName(q) }}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Untuk PO (opsional)</label>
            <Combobox
              options={poOptions}
              value={poId}
              onChange={setPoId}
              disabled={!vendorId}
              placeholder={!vendorId ? "Pilih vendor dulu" : poOptions.length ? "Pilih PO..." : "Tidak ada PO aktif"}
              emptyText="Tidak ada PO aktif untuk vendor ini"
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Nama Sopir / Kurir (opsional)</label>
            <input className="form-input" value={driver} onChange={(e) => setDriver(e.target.value)} maxLength={80} />
          </div>
          <div className="mb-4">
            <label className="form-label">No. Kendaraan (opsional)</label>
            <input
              className="form-input"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value.toUpperCase())}
              maxLength={20}
              placeholder="B 1234 XY"
            />
          </div>
          <div className="mb-4 sm:col-span-2">
            <label className="form-label">Catatan (opsional)</label>
            <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </div>
        </div>

        <div className="mt-1 mb-2 text-[11px] font-bold tracking-[0.06em] text-grey-1 uppercase">Daftar Kain</div>
        <div className="overflow-x-auto">
          <table className="sku-row-table min-w-[720px]">
            <thead>
              <tr>
                <th className="w-10">No</th>
                <th>Jenis Kain</th>
                <th className="w-[150px]">Warna</th>
                <th className="num w-[100px]">Qty</th>
                <th className="w-[100px]">Satuan</th>
                <th className="w-[170px]">Keterangan</th>
                <th className="w-9" />
              </tr>
            </thead>
            <tbody>
              {parsed.map((l, i) => (
                <tr key={l.key}>
                  <td className="num text-grey-1">{i + 1}</td>
                  <td>
                    <input
                      list="fabric-types"
                      className={cn("form-input !py-1.5", submitted && !l.empty && !l.fabric.trim() && "error")}
                      value={l.fabric}
                      placeholder="Mis. Rayon Twill"
                      onChange={(e) => update(l.key, { fabric: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      list="fabric-colors"
                      className={cn("form-input !py-1.5", submitted && !l.empty && !l.color.trim() && "error")}
                      value={l.color}
                      placeholder="Mis. Hitam"
                      onChange={(e) => update(l.key, { color: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    <input
                      inputMode="decimal"
                      className={cn("qty-input", submitted && l.qtyBad && "error")}
                      value={l.qty}
                      placeholder="0"
                      onChange={(e) => update(l.key, { qty: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="select-input w-full !py-1.5"
                      value={l.unit}
                      aria-label="Satuan"
                      onChange={(e) => update(l.key, { unit: e.target.value as ShipmentUnit })}
                    >
                      {SHIPMENT_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {SHIPMENT_UNIT_LABEL[u]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="form-input !py-1.5"
                      value={l.note}
                      maxLength={200}
                      onChange={(e) => update(l.key, { note: e.target.value })}
                    />
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      onClick={() => setLines((ls) => (ls.length <= 1 ? [blank()] : ls.filter((x) => x.key !== l.key)))}
                      aria-label="Hapus baris"
                      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-grey-2 hover:bg-neg-tint hover:text-neg"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={7} className="!py-2">
                  <button
                    type="button"
                    onClick={() => setLines((ls) => [...ls, blank(ls[ls.length - 1]?.unit)])}
                    className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-grey-3 py-2 text-[12.5px] font-semibold text-grey-1 transition-colors hover:border-primary-2 hover:bg-primary-tint hover:text-primary-2"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah baris kain
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="text-grey-1">
                  Total: <span className="text-ink">{used.length} baris</span>
                </td>
                <td colSpan={2} className="num pr-[10px] text-right whitespace-nowrap text-ink">
                  {totalText}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
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
