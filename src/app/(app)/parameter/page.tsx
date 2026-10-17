import { PageHeader } from "@/components/layout/page-header";
import { ParameterForm } from "@/components/ppic/parameter-form";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/badge";
import { getParams } from "@/lib/data/ppic";
import { createClient } from "@/lib/supabase/server";
import { STATUS_RULES } from "@/lib/constants";
import { DEFAULT_PARAMS, type PpicParams } from "@/lib/ppic";

export const metadata = { title: "Parameter PPIC · Pretty Basic" };

export default async function ParameterPage() {
  let params: PpicParams = DEFAULT_PARAMS;
  try {
    params = await getParams();
  } catch {
    // Tabel belum siap → tampilkan default
  }
  const supabase = await createClient();
  const { data: meta } = await supabase.from("ppic_parameters").select("updated_at").eq("id", 1).maybeSingle();

  return (
    <div>
      <PageHeader title="Parameter PPIC" sub="Setting yang menentukan perhitungan Min, Max, dan Forecast" />
      <ParameterForm initial={params} updatedAt={(meta?.updated_at as string | undefined) ?? null} />

      <Panel title="Aturan Status PPIC" sub="Referensi arti setiap status · dievaluasi berurutan dari atas">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-[150px]">Status</th>
              <th>Arti</th>
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {STATUS_RULES.map((r) => (
              <tr key={r.status}>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td>{r.meaning}</td>
                <td className="text-ink-3">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
