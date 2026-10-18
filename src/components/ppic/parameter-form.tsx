"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { InfoBanner } from "@/components/ui/info-banner";
import { updatePpicParams } from "@/app/actions/parameter";
import { DEFAULT_PARAMS, type PpicParams, type Rounding } from "@/lib/ppic";
import { fmtDate, fmtDec, fmtMonthYear, fmtTime } from "@/lib/format";
import { cn } from "@/lib/cn";

type NumKey = Exclude<keyof PpicParams, "rounding">;
type Values = Record<NumKey, string>;

const NUM_KEYS = (Object.keys(DEFAULT_PARAMS) as (keyof PpicParams)[]).filter((k): k is NumKey => k !== "rounding");

const INT_KEYS = new Set<NumKey>(["min_cover_days", "max_cover_days", "lead_time_days", "moq", "deadstock_days", "new_product_min_days"]);

const ROUNDING_LABEL: Record<Rounding, string> = {
  ceil: "Bulatkan ke atas (CEILING) — default",
  floor: "Bulatkan ke bawah (FLOOR)",
  round: "Bulatkan normal (ROUND)",
};

const ROUNDING_SUB: Record<Rounding, string> = {
  ceil: "Hasil selalu dibulatkan ke atas",
  floor: "Hasil selalu dibulatkan ke bawah",
  round: "Hasil dibulatkan ke angka terdekat",
};

function toValues(p: PpicParams): Values {
  const v = {} as Values;
  for (const k of NUM_KEYS) v[k] = String(p[k]).replace(".", ",");
  return v;
}

function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "" || !/^-?\d*(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Bungkus ekspresi dengan simbol pembulatan sesuai parameter. */
function wrap(rounding: Rounding, inner: React.ReactNode) {
  if (rounding === "ceil") return <>⌈ {inner} ⌉</>;
  if (rounding === "floor") return <>⌊ {inner} ⌋</>;
  return <>round( {inner} )</>;
}

function Field({
  label,
  value,
  onChange,
  hint,
  error,
  step,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: React.ReactNode;
  error?: string;
  step?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <div className="relative">
        <input
          inputMode={step ? "decimal" : "numeric"}
          className={cn("form-input num", suffix && "pr-12", error && "error")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] font-medium text-grey-1">
            {suffix}
          </span>
        )}
      </div>
      {error ? <div className="form-error">{error}</div> : hint ? <div className="form-hint">{hint}</div> : null}
    </div>
  );
}

function SumLine({ total, label }: { total: number | null; label: string }) {
  const ok = total !== null && Math.abs(total - 100) < 0.001;
  return (
    <div className={cn("mt-2 mb-4 text-[11.5px] font-semibold", ok ? "text-pos-text" : "text-neg")}>
      {label}: {total === null ? "—" : `${fmtDec(total)}%`}
      {!ok && " · harus 100%"}
    </div>
  );
}

export function ParameterForm({ initial, updatedAt }: { initial: PpicParams; updatedAt: string | null }) {
  const router = useRouter();
  const { months } = useAppData();
  const [values, setValues] = useState<Values>(() => toValues(initial));
  const [rounding, setRounding] = useState<Rounding>(initial.rounding);
  const [baseline, setBaseline] = useState<PpicParams>(initial);
  const [saving, setSaving] = useState(false);

  const set = (k: NumKey) => (v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const { parsed, errors, formError } = useMemo(() => {
    const nums = {} as Record<NumKey, number | null>;
    const errs: Partial<Record<NumKey, string>> = {};
    for (const k of NUM_KEYS) {
      const n = parseNum(values[k]);
      nums[k] = n;
      if (n === null) errs[k] = "Wajib diisi angka";
      else if (INT_KEYS.has(k) && !Number.isInteger(n)) errs[k] = "Harus bilangan bulat";
    }
    const positive: NumKey[] = ["min_cover_days", "max_cover_days", "lead_time_days", "moq", "deadstock_days", "new_product_min_days", "rank_a_pct"];
    for (const k of positive) if (!errs[k] && (nums[k] as number) <= 0) errs[k] = "Harus lebih dari 0";
    const nonNeg: NumKey[] = ["weight_h3", "weight_h2", "weight_h1", "weight2_h2", "weight2_h1", "min_forecast_to_produce", "rank_b_pct"];
    for (const k of nonNeg) if (!errs[k] && (nums[k] as number) < 0) errs[k] = "Tidak boleh negatif";
    if (!errs.overstock_multiplier && (nums.overstock_multiplier as number) < 1) errs.overstock_multiplier = "Minimal 1 (× Max)";
    if (!errs.min_cover_days && !errs.max_cover_days && (nums.max_cover_days as number) <= (nums.min_cover_days as number))
      errs.max_cover_days = "Harus lebih besar dari Min Stock";

    const w3 = nums.weight_h3 !== null && nums.weight_h2 !== null && nums.weight_h1 !== null ? nums.weight_h3 + nums.weight_h2 + nums.weight_h1 : null;
    const w2 = nums.weight2_h2 !== null && nums.weight2_h1 !== null ? nums.weight2_h2 + nums.weight2_h1 : null;
    let fe: string | null = null;
    if (w3 === null || Math.abs(w3 - 100) > 0.001) fe = "Total bobot H-3 + H-2 + H-1 harus 100%";
    else if (w2 === null || Math.abs(w2 - 100) > 0.001) fe = "Total bobot produk umur 2 bulan harus 100%";
    else if (!errs.rank_a_pct && !errs.rank_b_pct && (nums.rank_a_pct as number) + (nums.rank_b_pct as number) > 100)
      fe = "Batas Ranking A + B maksimal 100%";

    const valid = Object.keys(errs).length === 0 && fe === null;
    const p = valid ? ({ ...(nums as Record<NumKey, number>), rounding } as PpicParams) : null;
    return { parsed: { params: p, w3, w2, nums }, errors: errs, formError: fe };
  }, [values, rounding]);

  const dirty = useMemo(() => {
    if (rounding !== baseline.rounding) return true;
    return NUM_KEYS.some((k) => parseNum(values[k]) !== baseline[k]);
  }, [values, rounding, baseline]);

  const n = parsed.nums;
  const show = (x: number | null, fallback = "…") => (x === null ? fallback : fmtDec(x));
  const minDays = n.new_product_min_days;
  const minDaysText = minDays === 7 ? "1 minggu" : `${show(minDays)} hari`;

  function reset() {
    setValues(toValues(DEFAULT_PARAMS));
    setRounding(DEFAULT_PARAMS.rounding);
    toast.info("Nilai default diisi — klik Simpan Parameter untuk menerapkan");
  }

  async function save() {
    if (!parsed.params) {
      toast.error(formError ?? "Periksa kembali isian yang ditandai merah");
      return;
    }
    setSaving(true);
    const res = await updatePpicParams(parsed.params);
    setSaving(false);
    if (!res.ok) {
      toast.error(`Gagal menyimpan parameter: ${res.error}`);
      return;
    }
    setBaseline(parsed.params);
    toast.success("Parameter tersimpan · angka PPIC sudah dihitung ulang");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 items-start gap-4">
      <Panel title="Rumus Min & Max Stock" sub={`Ubah angka → semua Min/Max otomatis update · ${ROUNDING_SUB[rounding]}`}>
        <InfoBanner head="Rumus Aktif">
          <div>
            <strong>Min Stock</strong> = {wrap(rounding, <>Forecast/hari × <span className="font-semibold text-primary-2">{show(n.min_cover_days)} hari</span></>)}
          </div>
          <div>
            <strong>Max Stock</strong> = {wrap(rounding, <>Forecast/hari × <span className="font-semibold text-primary-2">{show(n.max_cover_days)} hari</span></>)}
          </div>
          <div className="mt-1 text-grey-1">
            Saran = kelipatan MOQ {show(n.moq)} pcs dari (Max − Stock − Sedang produksi)
          </div>
        </InfoBanner>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Min Stock = cover berapa hari?"
            value={values.min_cover_days}
            onChange={set("min_cover_days")}
            error={errors.min_cover_days}
            suffix="hari"
            hint="Biasanya = Lead Time + Safety (14 + 7)"
          />
          <Field
            label="Max Stock = cover berapa hari?"
            value={values.max_cover_days}
            onChange={set("max_cover_days")}
            error={errors.max_cover_days}
            suffix="hari"
            hint="Biasanya = Lead Time + Siklus + Safety"
          />
        </div>
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Lead Time Produksi"
            value={values.lead_time_days}
            onChange={set("lead_time_days")}
            error={errors.lead_time_days}
            suffix="hari"
            hint="Untuk estimasi tanggal selesai batch"
          />
          <Field
            label="MOQ per Varian"
            value={values.moq}
            onChange={set("moq")}
            error={errors.moq}
            suffix="pcs"
            hint="Saran dibulatkan ke kelipatan MOQ"
          />
        </div>
        <div>
          <label className="form-label">Pembulatan Hasil</label>
          <select className="select-input w-full" value={rounding} onChange={(e) => setRounding(e.target.value as Rounding)}>
            {(Object.keys(ROUNDING_LABEL) as Rounding[]).map((r) => (
              <option key={r} value={r}>
                {ROUNDING_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      <Panel title="Bobot Forecast" sub="Total harus 100% · Bulan terakhir = bobot paling besar (paling akurat)">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            label="Bobot H-3 Bulan"
            value={values.weight_h3}
            onChange={set("weight_h3")}
            error={errors.weight_h3}
            step="any"
            suffix="%"
            hint={fmtMonthYear(months.h3)}
          />
          <Field
            label="Bobot H-2 Bulan"
            value={values.weight_h2}
            onChange={set("weight_h2")}
            error={errors.weight_h2}
            step="any"
            suffix="%"
            hint={fmtMonthYear(months.h2)}
          />
          <Field
            label="Bobot H-1 Bulan"
            value={values.weight_h1}
            onChange={set("weight_h1")}
            error={errors.weight_h1}
            step="any"
            suffix="%"
            hint={fmtMonthYear(months.h1)}
          />
        </div>
        <SumLine total={parsed.w3} label="Total bobot 3 bulan" />

        <div className="mb-1.5 text-[12px] font-bold text-ink-3">Produk umur 2 bulan</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Bobot H-2 Bulan"
            value={values.weight2_h2}
            onChange={set("weight2_h2")}
            error={errors.weight2_h2}
            step="any"
            suffix="%"
            hint={fmtMonthYear(months.h2)}
          />
          <Field
            label="Bobot H-1 Bulan"
            value={values.weight2_h1}
            onChange={set("weight2_h1")}
            error={errors.weight2_h1}
            step="any"
            suffix="%"
            hint={fmtMonthYear(months.h1)}
          />
        </div>
        <SumLine total={parsed.w2} label="Total bobot 2 bulan" />

        <InfoBanner head="Logic Produk Baru" variant="green">
          <strong>Umur ≥ 3 bulan:</strong> Pakai bobot normal {show(n.weight_h3)}% + {show(n.weight_h2)}% + {show(n.weight_h1)}%
          <br />
          <strong>Umur 2 bulan:</strong> Pakai H-2 ({show(n.weight2_h2)}%) + H-1 ({show(n.weight2_h1)}%)
          <br />
          <strong>Umur 1 bulan:</strong> Pakai H-1 saja (100%)
          <br />
          <strong>Umur 1–4 minggu di bulan berjalan:</strong> Prorata (rata-rata sales per minggu × 4)
          <br />
          <strong>Umur &lt; {minDaysText}:</strong> Belum ada forecast, tunggu {minDaysText} dulu
        </InfoBanner>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Batas Overstock (× Max)"
            value={values.overstock_multiplier}
            onChange={set("overstock_multiplier")}
            error={errors.overstock_multiplier}
            step="any"
            suffix="×"
            hint={`OVERSTOCK jika stock > Max × ${show(n.overstock_multiplier)}`}
          />
          <Field
            label="Min Forecast agar Layak Produksi"
            value={values.min_forecast_to_produce}
            onChange={set("min_forecast_to_produce")}
            error={errors.min_forecast_to_produce}
            step="any"
            suffix="pcs"
            hint="pcs/bulan · di bawah ini = OVERSTOCK / STOP"
          />
        </div>
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Hari tanpa Penjualan → DEADSTOCK"
            value={values.deadstock_days}
            onChange={set("deadstock_days")}
            error={errors.deadstock_days}
            suffix="hari"
          />
          <Field
            label="Umur Minimal sebelum Ada Forecast"
            value={values.new_product_min_days}
            onChange={set("new_product_min_days")}
            error={errors.new_product_min_days}
            suffix="hari"
            hint="Di bawah ini status BARU"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Batas Ranking A"
            value={values.rank_a_pct}
            onChange={set("rank_a_pct")}
            error={errors.rank_a_pct}
            step="any"
            suffix="%"
            hint="Top penjualan kumulatif"
          />
          <Field
            label="Batas Ranking B"
            value={values.rank_b_pct}
            onChange={set("rank_b_pct")}
            error={errors.rank_b_pct}
            step="any"
            suffix="%"
            hint={n.rank_a_pct !== null && n.rank_b_pct !== null ? `Sisanya ${fmtDec(Math.max(0, 100 - n.rank_a_pct - n.rank_b_pct))}% = Ranking C` : undefined}
          />
        </div>

        {formError && <div className="form-error mt-4">{formError}</div>}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5">
          <div className="text-[11.5px] text-grey-1">
            {dirty ? (
              <span className="font-semibold text-warn-text">Ada perubahan yang belum disimpan</span>
            ) : updatedAt ? (
              `Terakhir disimpan ${fmtDate(updatedAt)} ${fmtTime(updatedAt)}`
            ) : null}
          </div>
          <div className="flex gap-2.5">
            <Button onClick={reset} disabled={saving}>
              Reset ke Default
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || !parsed.params}>
              Simpan Parameter
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
