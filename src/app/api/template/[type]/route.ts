import { NextResponse } from "next/server";
import { buildTemplate, isTemplateType } from "@/lib/excel/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/template/barang-masuk | barang-keluar | master-sku → file .xlsx template upload. */
export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isTemplateType(type)) {
    return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 404 });
  }
  const buffer = await buildTemplate(type);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-${type}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
