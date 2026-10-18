"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { saveSku } from "@/app/actions/master-sku";
import { skuSchema, suggestSkuCode, type SkuInput } from "@/lib/validators";
import type { SkuInfo } from "@/lib/data/ppic";
import { cn } from "@/lib/cn";

/** Toggle kecil Aktif/Nonaktif. */
export function ActiveSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-pos" : "bg-grey-3",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

type FieldKey = "product_name" | "color" | "size" | "code" | "launch_date" | "unit_cost";

export function SkuFormModal({
  open,
  onOpenChange,
  sku,
  products,
  codeOwners,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = tambah SKU baru */
  sku: SkuInfo | null;
  products: string[];
  /** Kode SKU (uppercase) → id SKU pemiliknya, untuk cek unik di client */
  codeOwners: Map<string, string>;
  today: string;
}) {
  const router = useRouter();
  const [productName, setProductName] = useState<string | null>(sku?.product_name ?? null);
  const [extraProducts, setExtraProducts] = useState<string[]>([]);
  const [color, setColor] = useState(sku?.color ?? "");
  const [size, setSize] = useState(sku?.size ?? "");
  const [code, setCode] = useState(sku?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(sku !== null);
  const [launchDate, setLaunchDate] = useState(sku?.launch_date ?? today);
  const [unitCost, setUnitCost] = useState(sku?.unit_cost !== null && sku?.unit_cost !== undefined ? String(sku.unit_cost) : "");
  const [active, setActive] = useState(sku?.is_active ?? true);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState(false);

  const suggested = suggestSkuCode(productName ?? "", color, size);
  const effectiveCode = codeTouched ? code : suggested;

  const productOptions = useMemo<ComboOption[]>(() => {
    const list = [...products];
    for (const p of extraProducts) if (!list.some((x) => x.toLowerCase() === p.toLowerCase())) list.push(p);
    return list.map((name) => ({
      value: name,
      label: name,
      sublabel: extraProducts.includes(name) && !products.includes(name) ? "Produk baru" : undefined,
    }));
  }, [products, extraProducts]);

  function clearError(key: FieldKey) {
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  function createProduct(typed: string) {
    const name = typed.trim().replace(/\s+/g, " ");
    if (!name) {
      toast.info("Ketik nama produk baru di kolom Produk, lalu pilih “+ Produk baru”.");
      return;
    }
    const existing = products.find((p) => p.toLowerCase() === name.toLowerCase());
    if (existing) {
      setProductName(existing);
    } else {
      setExtraProducts((list) => [...list, name]);
      setProductName(name);
    }
    clearError("product_name");
  }

  async function submit() {
    const costText = unitCost.trim();
    const cost = costText === "" ? null : Number(costText);
    const input: SkuInput = {
      id: sku?.id ?? null,
      product_name: productName ?? "",
      color: color.trim(),
      size: size.trim(),
      code: effectiveCode.trim().toUpperCase(),
      launch_date: launchDate,
      unit_cost: cost,
      is_active: active,
    };

    const next: Partial<Record<FieldKey, string>> = {};
    if (cost !== null && (Number.isNaN(cost) || cost < 0)) next.unit_cost = "Harga pokok harus angka ≥ 0";
    const parsed = skuSchema.safeParse(cost !== null && Number.isNaN(cost) ? { ...input, unit_cost: null } : input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldKey | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
    }
    const owner = codeOwners.get(input.code);
    if (!next.code && owner && owner !== sku?.id) next.code = "Kode SKU sudah dipakai SKU lain";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    const res = await saveSku(input);
    setSaving(false);
    if (!res.ok) {
      if (/kode sku/i.test(res.error)) setErrors({ code: res.error });
      else toast.error(`Gagal menyimpan SKU: ${res.error}`);
      return;
    }
    toast.success(sku ? `SKU ${input.code} diperbarui` : `SKU ${input.code} ditambahkan`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Master SKU"
      title={sku ? "Edit SKU" : "Tambah SKU"}
      sub={sku ? sku.code : "Satu SKU = satu kombinasi produk × warna × size"}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Batal</Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {sku ? "Simpan Perubahan" : "Simpan SKU"}
          </Button>
        </>
      }
    >
      <div>
        <div className="mb-4">
          <label className="form-label">Produk</label>
          <Combobox
            options={productOptions}
            value={productName}
            onChange={(v) => {
              setProductName(v);
              clearError("product_name");
            }}
            invalid={!!errors.product_name}
            placeholder="Pilih produk atau ketik nama produk baru..."
            emptyText="Belum ada produk dengan nama itu"
            footerAction={{ label: "+ Produk baru dari teks yang diketik", onSelect: createProduct }}
          />
          {errors.product_name ? (
            <div className="form-error">{errors.product_name}</div>
          ) : (
            <div className="form-hint">Belum ada di daftar? Ketik namanya lalu pilih “+ Produk baru”.</div>
          )}
        </div>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Warna</label>
            <input
              className={cn("form-input", errors.color && "error")}
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                clearError("color");
              }}
              placeholder="mis. Broken white"
            />
            {errors.color && <div className="form-error">{errors.color}</div>}
          </div>
          <div>
            <label className="form-label">Size</label>
            <input
              className={cn("form-input", errors.size && "error")}
              value={size}
              onChange={(e) => {
                setSize(e.target.value);
                clearError("size");
              }}
              placeholder="XS/S, S/M, All size"
            />
            {errors.size && <div className="form-error">{errors.size}</div>}
          </div>
        </div>

        <div className="mb-4">
          <label className="form-label">Kode SKU</label>
          <input
            className={cn("form-input font-semibold tracking-[0.02em] uppercase", errors.code && "error")}
            value={effectiveCode}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/\s+/g, ""));
              setCodeTouched(true);
              clearError("code");
            }}
            placeholder="PRODUK-WARNA-SIZE"
          />
          {errors.code ? (
            <div className="form-error">{errors.code}</div>
          ) : codeTouched && suggested && code !== suggested ? (
            <div className="form-hint">
              Saran: <span className="font-semibold text-ink-3">{suggested}</span> ·{" "}
              <button
                type="button"
                className="cursor-pointer font-semibold text-primary-2"
                onClick={() => {
                  setCode(suggested);
                  setCodeTouched(false);
                }}
              >
                Pakai saran
              </button>
            </div>
          ) : (
            <div className="form-hint">Otomatis dari Produk-Warna-Size · huruf besar tanpa spasi · harus unik</div>
          )}
        </div>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Tanggal Launch</label>
            <input
              type="date"
              className={cn("form-input", errors.launch_date && "error")}
              value={launchDate}
              onChange={(e) => {
                setLaunchDate(e.target.value);
                clearError("launch_date");
              }}
            />
            {errors.launch_date ? (
              <div className="form-error">{errors.launch_date}</div>
            ) : (
              <div className="form-hint">Dipakai untuk logic produk baru</div>
            )}
          </div>
          <div>
            <label className="form-label">Harga Pokok (opsional)</label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-grey-1">Rp</span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                className={cn("form-input num !pl-9", errors.unit_cost && "error")}
                value={unitCost}
                onChange={(e) => {
                  setUnitCost(e.target.value);
                  clearError("unit_cost");
                }}
                placeholder="0"
              />
            </div>
            {errors.unit_cost ? (
              <div className="form-error">{errors.unit_cost}</div>
            ) : (
              <div className="form-hint">Untuk menghitung nilai stock</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[10px] border border-line px-4 py-3">
          <div>
            <div className="text-[13px] font-semibold text-ink">Aktif</div>
            <div className="text-[11.5px] text-grey-1">SKU nonaktif tidak muncul di pilihan SKU & PPIC, riwayat tetap tersimpan</div>
          </div>
          <ActiveSwitch checked={active} onChange={setActive} label="Aktif" />
        </div>
      </div>
    </Modal>
  );
}
