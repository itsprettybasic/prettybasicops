"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { subDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { useAppData } from "@/components/providers/app-data";
import { getSkuMovements, setRankOverride, type SkuMovement } from "@/app/actions/stock";
import { CHANNEL_LABEL, TYPE_LABEL } from "@/lib/constants";
import { FORECAST_METHOD_LABEL } from "@/lib/ppic";
import { fmtDateShort, fmtInt } from "@/lib/format";
import { cn } from "@/lib/cn";

function Kv({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "neg" | "warn" | "blue" }) {
  return (
    <div className="rounded-[10px] bg-bg px-4 py-3.5">
      <div className="mb-2 text-[10.5px] font-bold tracking-[0.08em] text-grey-1 uppercase">{label}</div>
      <div
        className={cn(
          "num text-[22px] leading-none font-extrabold tracking-[-0.02em] text-ink",
          tone === "neg" && "text-neg",
          tone === "warn" && "text-warn",
          tone === "blue" && "text-primary-2",
        )}
      >
        {value}
        {unit && value !== "—" && <span className="ml-0.5 text-xs font-semibold tracking-normal text-grey-1">{unit}</span>}
      </div>
    </div>
  );
}

export function movementTitle(m: Pick<SkuMovement, "type" | "channel" | "batch_no">) {
  if (m.type === "produksi" && m.batch_no) return m.batch_no;
  if (m.type === "sales" && m.channel) return `Sales ${CHANNEL_LABEL[m.channel]}`;
  return TYPE_LABEL[m.type];
}

export function SkuDetailModal({
  skuId,
  open,
  onOpenChange,
}: {
  skuId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { rowById, today, openStockModal } = useAppData();
  const row = rowById.get(skuId);
  const [movements, setMovements] = useState<SkuMovement[] | null>(null);
  const [savingRank, setSavingRank] = useState(false);

  useEffect(() => {
    let alive = true;
    setMovements(null);
    getSkuMovements(skuId, format(subDays(parseISO(today), 30), "yyyy-MM-dd")).then((res) => {
      if (!alive) return;
      if (res.ok) setMovements(res.data);
      else {
        toast.error(`Gagal memuat riwayat: ${res.error}`);
        setMovements([]);
      }
    });
    return () => {
      alive = false;
    };
  }, [skuId, today]);

  if (!row) return null;

  async function changeRank(value: string) {
    setSavingRank(true);
    const res = await setRankOverride(skuId, value === "auto" ? null : (value as "A" | "B" | "C"));
    setSavingRank(false);
    if (!res.ok) {
      toast.error(`Gagal menyimpan ranking: ${res.error}`);
      return;
    }
    toast.success(value === "auto" ? "Ranking kembali otomatis" : `Ranking diubah ke ${value}`);
    router.refresh();
  }

  const stockTone = row.stock <= 0 ? "neg" : row.minStock !== null && row.stock <= row.minStock ? "warn" : undefined;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="PPIC Detail"
      title={row.label}
      sub={
        <span className="inline-flex items-center gap-2">
          SKU: {row.code} · Ranking {row.rank}
          {row.rankOverridden && <span className="text-grey-2">(override)</span>}
          <StatusBadge status={row.status} />
        </span>
      }
    >
      <div className="my-[18px] grid grid-cols-3 gap-3">
        <Kv label="Stock Sekarang" value={fmtInt(row.stock)} unit="pcs" tone={stockTone} />
        <Kv label="Min Stock" value={fmtInt(row.minStock)} unit="pcs" />
        <Kv label="Max Stock" value={fmtInt(row.maxStock)} unit="pcs" />
        <Kv label="Forecast/Bulan" value={fmtInt(row.forecastMonth)} unit="pcs" />
        <Kv label="Hari Cover" value={fmtInt(row.daysCover)} unit="hari" tone={row.daysCover !== null && row.daysCover <= 7 ? "neg" : undefined} />
        <Kv label="Saran Qty" value={fmtInt(row.suggestion)} unit="pcs" tone="blue" />
      </div>

      <div className="mb-4 flex items-center justify-between gap-4 rounded-[10px] border border-line px-4 py-3 text-[12.5px] text-ink-3">
        <div className="leading-relaxed">
          <div>
            Penjualan H-3 / H-2 / H-1 / Bulan berjalan:{" "}
            <span className="num font-semibold text-ink">
              {fmtInt(row.sales.h3)} · {fmtInt(row.sales.h2)} · {fmtInt(row.sales.h1)} · {fmtInt(row.sales.current)}
            </span>
          </div>
          <div className="text-grey-1">
            Rumus forecast: {FORECAST_METHOD_LABEL[row.method]}
            {row.inProduction > 0 && <> · Sedang diproduksi {fmtInt(row.inProduction)} pcs</>}
          </div>
        </div>
        <div className="shrink-0">
          <label className="form-label !mb-1">Override Ranking</label>
          <select
            className="select-input"
            disabled={savingRank}
            value={row.rank_override ?? "auto"}
            onChange={(e) => changeRank(e.target.value)}
          >
            <option value="auto">Otomatis ({row.rankAuto})</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
      </div>

      <div className="mb-3.5 flex gap-2">
        <Button variant="pos" className="flex-1" onClick={() => openStockModal({ direction: "in", skuId })}>
          + Barang Masuk
        </Button>
        <Button variant="neg" className="flex-1" onClick={() => openStockModal({ direction: "out", skuId })}>
          − Barang Keluar
        </Button>
      </div>

      <div className="mb-1 text-[13px] font-bold text-ink">Riwayat Mutasi 30 Hari</div>
      <div>
        {movements === null &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mut-entry">
              <div className="skeleton h-3 w-10" />
              <div className="skeleton h-3 w-40" />
              <div className="skeleton h-3 w-10" />
            </div>
          ))}
        {movements?.length === 0 && (
          <div className="py-6 text-center text-[12.5px] text-grey-1">Belum ada mutasi dalam 30 hari terakhir.</div>
        )}
        {movements?.map((m) => (
          <div key={`${m.document_id}`} className="mut-entry">
            <div className="text-[11.5px] font-medium text-grey-1">{fmtDateShort(m.doc_date)}</div>
            <div className="text-[13px] font-semibold text-ink">
              {movementTitle(m)}
              <span className="mt-0.5 block text-[11.5px] font-medium text-grey-1">
                {m.note || m.doc_no} · {fmtInt(m.qty)} pcs
              </span>
            </div>
            <div className="num text-right">
              <div className={cn("text-sm font-extrabold", m.direction === "in" ? "text-pos" : "text-neg")}>
                {m.direction === "in" ? "+" : "−"}
                {fmtInt(m.qty)}
              </div>
              <div className="mt-px text-[10.5px] font-medium text-grey-1">saldo {fmtInt(m.balance)}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
