"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { saveVendor, type Vendor } from "@/app/actions/po";
import { vendorSchema } from "@/lib/validators";
import { cn } from "@/lib/cn";

/** Tambah / ubah data vendor. */
export function VendorFormModal({
  vendor,
  initialName = "",
  onClose,
  onSaved,
}: {
  /** null = vendor baru */
  vendor: Vendor | null;
  initialName?: string;
  onClose: () => void;
  onSaved: (v: Vendor) => void;
}) {
  const [form, setForm] = useState({
    name: vendor?.name ?? initialName,
    contact_person: vendor?.contact_person ?? "",
    phone: vendor?.phone ?? "",
    email: vendor?.email ?? "",
    address: vendor?.address ?? "",
    note: vendor?.note ?? "",
    is_active: vendor?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSubmitted(true);
    const input = { id: vendor?.id ?? null, ...form };
    const check = vendorSchema.safeParse(input);
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? "Data belum lengkap");
      return;
    }
    setSaving(true);
    const res = await saveVendor(input);
    setSaving(false);
    if (!res.ok) {
      toast.error(`Gagal menyimpan vendor: ${res.error}`);
      return;
    }
    toast.success(vendor ? `${res.data.name} diperbarui` : `${res.data.name} ditambahkan`);
    onSaved(res.data);
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={vendor ? "Ubah Vendor" : "Tambah Vendor"}
      sub="Data ini muncul di dokumen PO dan Surat Jalan"
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Simpan Vendor
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <div className="mb-4 sm:col-span-2">
          <label className="form-label">Nama Vendor</label>
          <input
            autoFocus
            className={cn("form-input", submitted && !form.name.trim() && "error")}
            value={form.name}
            onChange={set("name")}
            placeholder="Mis. Konveksi Sejahtera"
          />
        </div>
        <div className="mb-4">
          <label className="form-label">Nama Kontak (opsional)</label>
          <input className="form-input" value={form.contact_person} onChange={set("contact_person")} placeholder="Mis. Bu Rina" />
        </div>
        <div className="mb-4">
          <label className="form-label">No. Telepon / WA (opsional)</label>
          <input className="form-input" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="08xx" />
        </div>
        <div className="mb-4 sm:col-span-2">
          <label className="form-label">Email (opsional)</label>
          <input className="form-input" type="email" value={form.email} onChange={set("email")} />
        </div>
        <div className="mb-4 sm:col-span-2">
          <label className="form-label">Alamat (opsional)</label>
          <textarea className="form-input" value={form.address} onChange={set("address")} maxLength={500} />
        </div>
        <div className="mb-4 sm:col-span-2">
          <label className="form-label">Catatan (opsional)</label>
          <textarea
            className="form-input"
            value={form.note}
            onChange={set("note")}
            maxLength={1000}
            placeholder="Mis. spesialis kaos, minimal order 50 pcs"
          />
        </div>
        {vendor && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink-2 select-none sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-primary"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Vendor aktif (muncul di pilihan saat buat PO / pengiriman kain)
          </label>
        )}
      </div>
    </Modal>
  );
}
