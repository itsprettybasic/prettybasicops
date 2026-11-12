"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ActiveSwitch } from "@/components/ppic/sku-form-modal";
import { saveWarehouse } from "@/app/actions/warehouses";
import type { Warehouse } from "@/lib/stock/warehouse-types";

export function WarehouseFormModal({
  open,
  onOpenChange,
  warehouse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = tambah gudang baru */
  warehouse: Warehouse | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(warehouse?.name ?? "");
  const [address, setAddress] = useState(warehouse?.address ?? "");
  const [note, setNote] = useState(warehouse?.note ?? "");
  const [active, setActive] = useState(warehouse?.is_active ?? true);
  const [ppic, setPpic] = useState(warehouse?.counts_in_ppic ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isDefault = !!warehouse?.is_default;

  async function submit() {
    if (!name.trim()) {
      setError("Nama gudang wajib diisi");
      return;
    }
    setSaving(true);
    const res = await saveWarehouse({
      id: warehouse?.id ?? null,
      name,
      address,
      note,
      is_active: isDefault ? true : active,
      counts_in_ppic: ppic,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(warehouse ? `${name.trim()} diperbarui` : `Gudang ${name.trim()} ditambahkan`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      eyebrow="Gudang"
      title={warehouse ? "Edit Gudang" : "Tambah Gudang"}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Batal</Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {warehouse ? "Simpan Perubahan" : "Simpan Gudang"}
          </Button>
        </>
      }
    >
      <div className="mb-4">
        <label className="form-label">Nama Gudang</label>
        <input
          className="form-input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="mis. Gudang Toko, Gudang Reject"
        />
      </div>
      <div className="mb-4">
        <label className="form-label">Alamat (opsional)</label>
        <input className="form-input" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="mb-4">
        <label className="form-label">Catatan (opsional)</label>
        <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="mb-3 flex items-center justify-between gap-4 rounded-[10px] border border-line px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-ink">Dihitung di PPIC</div>
          <div className="text-[11.5px] text-grey-1">
            Stock gudang ini ikut dihitung di Rekomendasi Produksi & Stock Live. Matikan untuk gudang reject, display, dll.
          </div>
        </div>
        <ActiveSwitch checked={ppic} onChange={setPpic} label="Dihitung di PPIC" />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-[10px] border border-line px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-ink">Aktif</div>
          <div className="text-[11.5px] text-grey-1">
            {isDefault
              ? "Gudang utama selalu aktif."
              : "Gudang nonaktif tidak bisa dipilih di catatan baru. Stock & riwayatnya tetap tersimpan."}
          </div>
        </div>
        <ActiveSwitch checked={isDefault ? true : active} onChange={setActive} disabled={isDefault} label="Aktif" />
      </div>

      {error && <div className="form-error mt-3">{error}</div>}
    </Modal>
  );
}
