/**
 * Data demo supaya semua halaman langsung terisi (Bagian 12.1).
 * Menghasilkan: 7 produk spec + 1 produk baru, riwayat sales harian ±4 bulan per channel, damage/giveaway/retur,
 * batch produksi selesai & 1 batch masih diproduksi (sebagian sudah diterima), stock awal via Adjustment +.
 * Target stock akhir diatur supaya semua status PPIC muncul (HABIS, PRODUKSI, AMAN, OVERSTOCK, SLOW, DEAD, STOP, BARU).
 *
 * Jalankan: npm run seed:demo   (hapus dulu dengan npm run seed:reset kalau mau ulang)
 */
import { randomUUID } from "node:crypto";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { env, insertAll, scriptClient } from "./lib";

// ── Util ──────────────────────────────────────────────
let seed = 20261017;
function rand() {
  // mulberry32 — deterministik supaya hasil seed konsisten
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
function poisson(lambda: number) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}
const d = (date: Date) => format(date, "yyyy-MM-dd");
const shift = (date: string, days: number) => d(addDays(parseISO(date), days));
const at = (date: string, hour: number, minute = randInt(0, 59)) =>
  `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`;

// ── Master data ───────────────────────────────────────
const COLOR_CODE: Record<string, string> = {
  Black: "BLACK",
  "Blue teal": "BLUETEAL",
  "Broken white": "WHITE",
  Brown: "BROWN",
  "Baby blue": "BABYBLUE",
  "Baby pink": "BABYPINK",
  "Butter yellow": "BUTTER",
  Gray: "GRAY",
  Blue: "BLUE",
  Mint: "MINT",
  Pink: "PINK",
  White: "WHITE",
  "Two tone brown": "TWOTONE",
  Denim: "DENIM",
  Fuschia: "FUSCHIA",
  Cream: "CREAM",
  Sage: "SAGE",
};
const SIZE_CODE: Record<string, string> = { "XS/S": "XSS", "S/M": "SM", "All size": "AS" };

interface ProductDef {
  name: string;
  code: string;
  colors: string[];
  sizes: string[];
  /** rata-rata sales per SKU per bulan */
  base: number;
  cost: number;
}

const PRODUCTS: ProductDef[] = [
  { name: "Solea Mini Skort", code: "SOLEASKORT", colors: ["Black", "Blue teal", "Broken white", "Brown"], sizes: ["XS/S", "S/M"], base: 34, cost: 68000 },
  { name: "Coastal Longsleeve Top", code: "COASTALTOP", colors: ["Baby blue", "Baby pink", "Black", "Broken white", "Brown", "Butter yellow", "Gray"], sizes: ["XS/S", "S/M"], base: 15, cost: 59000 },
  { name: "Polly Tanktop", code: "POLLYTOP", colors: ["Black", "Blue", "Butter yellow", "Mint", "Pink", "White"], sizes: ["XS/S", "S/M"], base: 14, cost: 42000 },
  { name: "Eloise Midi Skirt", code: "ELOISESKIRT", colors: ["Black", "Brown", "Two tone brown", "White"], sizes: ["All size"], base: 38, cost: 85000 },
  { name: "Monaco Linen Top", code: "MONACOTOP", colors: ["Black", "Broken white", "Butter yellow"], sizes: ["XS/S", "S/M"], base: 20, cost: 72000 },
  { name: "Lyn Off Shoulder Tee", code: "LYNTOP", colors: ["Black", "Broken white", "Brown", "Butter yellow", "Denim"], sizes: ["All size"], base: 23, cost: 48000 },
  { name: "Claudie Midi Skirt", code: "CLAUDIESKIRT", colors: ["Black", "Broken white", "Fuschia"], sizes: ["XS/S", "S/M"], base: 16, cost: 79000 },
  { name: "Rhea Knit Cardigan", code: "RHEACARDI", colors: ["Black", "Cream", "Sage"], sizes: ["All size"], base: 18, cost: 95000 },
];

type Category = "habis" | "produksi" | "aman" | "over" | "slow" | "dead" | "stop" | "new";

interface SkuPlan {
  id: string;
  product_id: string;
  code: string;
  color: string;
  size: string;
  launch_date: string;
  unit_cost: number;
  monthly: number;
  category: Category;
  /** sales berhenti setelah tanggal ini (untuk DEADSTOCK) */
  salesUntil: string | null;
}

interface Doc {
  id: string;
  doc_no?: string;
  direction: "in" | "out";
  type: string;
  doc_date: string;
  channel: string | null;
  batch_id: string | null;
  note: string | null;
  source: "seed";
  created_at: string;
  created_by_name: string;
  lines: Map<string, number>;
}

const CHANNEL_SHARE: [string, number][] = [
  ["shopee", 0.5],
  ["tiktok", 0.3],
  ["instagram", 0.1],
  ["website", 0.07],
  ["offline", 0.03],
];
const CHANNEL_NOTE: Record<string, string> = {
  shopee: "Rekap sales Shopee",
  tiktok: "Rekap sales TikTok Shop",
  instagram: "Order via DM Instagram",
  website: "Order website",
  offline: "Penjualan offline / bazaar",
};

async function main() {
  const { supabase, mode } = await scriptClient();
  console.log(`→ Seed demo (${mode})`);
  const adminName = env("SEED_ADMIN_NAME", false) || "Admin";

  const { count: existing } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("category", "demo");
  if (existing) {
    console.error("✗ Data demo sudah ada. Jalankan `npm run seed:reset` dulu (butuh ALLOW_RESET=true).");
    process.exit(1);
  }

  const today = formatInTimeZone(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
  const h3Start = format(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 4, 1), "yyyy-MM-dd");
  const start = shift(h3Start, -14);
  const totalDays = differenceInCalendarDays(parseISO(today), parseISO(start));

  // ── Produk & SKU ──
  const products = PRODUCTS.map((p) => ({ id: randomUUID(), name: p.name, category: "demo" }));
  const plans: SkuPlan[] = [];
  const categoryBag: Category[] = [
    ...Array<Category>(5).fill("habis"),
    ...Array<Category>(9).fill("produksi"),
    ...Array<Category>(14).fill("aman"),
    ...Array<Category>(10).fill("over"),
    ...Array<Category>(3).fill("slow"),
    ...Array<Category>(2).fill("dead"),
    ...Array<Category>(2).fill("stop"),
  ];

  PRODUCTS.forEach((p, pi) => {
    for (const color of p.colors) {
      for (const size of p.sizes) {
        const code = `${p.code}-${COLOR_CODE[color]}-${SIZE_CODE[size]}`;
        let category: Category = categoryBag.length ? categoryBag.splice(Math.floor(rand() * categoryBag.length), 1)[0] : pick(["aman", "over", "produksi"] as Category[]);
        let launch = shift(start, -randInt(40, 320));
        let monthly = Math.max(4, Math.round(p.base * (0.45 + rand() * 1.2)));
        let salesUntil: string | null = null;

        if (p.code === "RHEACARDI") {
          category = "new";
          // Black: 5 hari lalu (BARU) · Cream: 2 minggu lalu (prorata mingguan) · Sage: ±2 bulan lalu
          launch = color === "Black" ? shift(today, -5) : color === "Cream" ? shift(today, -14) : shift(today, -60);
        }
        if (category === "slow") monthly = randInt(2, 4);
        if (category === "stop") monthly = randInt(1, 3);
        if (category === "dead") salesUntil = shift(today, -randInt(65, 80));
        // Satu SKU Monaco launch di tengah bulan H-2 (logic 2 bulan + prorata bulan launch)
        if (code === "MONACOTOP-BUTTER-SM") launch = format(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 3, 15), "yyyy-MM-dd");

        plans.push({
          id: randomUUID(),
          product_id: products[pi].id,
          code,
          color,
          size,
          launch_date: launch,
          unit_cost: p.cost,
          monthly,
          category,
          salesUntil,
        });
      }
    }
  });

  // ── Dokumen ──
  const docs: Doc[] = [];
  const newDoc = (direction: "in" | "out", type: string, date: string, created_at: string, extra: Partial<Doc> = {}): Doc => {
    const doc: Doc = {
      id: randomUUID(),
      direction,
      type,
      doc_date: date,
      channel: null,
      batch_id: null,
      note: null,
      source: "seed",
      created_at,
      created_by_name: adminName,
      lines: new Map(),
      ...extra,
    };
    docs.push(doc);
    return doc;
  };
  const addLine = (doc: Doc, skuId: string, qty: number) => {
    if (qty > 0) doc.lines.set(skuId, (doc.lines.get(skuId) ?? 0) + qty);
  };

  // Sales harian per channel
  for (let i = 0; i <= totalDays; i++) {
    const date = shift(start, i);
    const dow = parseISO(date).getDay();
    const weekendBoost = dow === 0 || dow === 6 ? 1.25 : 1;
    const payday = Number(date.slice(8, 10)) >= 25 || Number(date.slice(8, 10)) <= 2 ? 1.3 : 1;
    for (const [channel, share] of CHANNEL_SHARE) {
      const doc = newDoc("out", "sales", date, at(date, channel === "offline" ? 17 : randInt(21, 23)), {
        channel,
        note: CHANNEL_NOTE[channel],
      });
      for (const s of plans) {
        if (date < s.launch_date) continue;
        if (s.salesUntil && date > s.salesUntil) continue;
        // Produk baru: penjualan lumayan cepat sejak launch
        const lambda = (s.monthly / 30) * share * weekendBoost * payday;
        addLine(doc, s.id, poisson(lambda));
      }
      if (doc.lines.size === 0) docs.pop();
    }
  }

  // Damage, giveaway, retur
  const activeOn = (date: string) => plans.filter((s) => s.launch_date <= date && s.category !== "stop");
  for (let i = 3; i <= totalDays; i += randInt(7, 11)) {
    const date = shift(start, i);
    const doc = newDoc("out", "damage", date, at(date, randInt(10, 16)), { note: pick(["Jahitan bolong", "Noda saat QC", "Reject QC gudang", "Kancing lepas"]) });
    for (let k = 0; k < randInt(1, 3); k++) addLine(doc, pick(activeOn(date)).id, randInt(1, 2));
  }
  for (let i = 10; i <= totalDays; i += randInt(18, 24)) {
    const date = shift(start, i);
    const doc = newDoc("out", "giveaway", date, at(date, randInt(10, 15)), { channel: "instagram", note: "Giveaway IG @prettybasic" });
    for (let k = 0; k < randInt(2, 3); k++) addLine(doc, pick(activeOn(date)).id, 1);
  }
  for (let i = 6; i <= totalDays; i += randInt(10, 14)) {
    const date = shift(start, i);
    const doc = newDoc("in", "retur", date, at(date, randInt(11, 17)), { note: pick(["Size tidak cocok", "Customer tukar warna", "Retur marketplace"]) });
    for (let k = 0; k < randInt(1, 2); k++) addLine(doc, pick(activeOn(date)).id, 1);
  }

  // ── Batch produksi ──
  const { data: konveksi, error: kErr } = await supabase.from("konveksi").select("id, name").order("name");
  if (kErr || !konveksi?.length) throw new Error(`Konveksi belum ada: ${kErr?.message ?? "jalankan migration dulu"}`);
  const year = today.slice(0, 4);
  const { data: lastBatch } = await supabase.from("production_batches").select("batch_no").like("batch_no", `BATCH-${year}-%`).order("batch_no", { ascending: false }).limit(1);
  let batchSeq = lastBatch?.[0] ? Number(lastBatch[0].batch_no.split("-")[2]) : 30;

  const batches: object[] = [];
  const batchLines: object[] = [];
  const salesBetween = (skuId: string, from: string, to: string) =>
    docs
      .filter((x) => x.type === "sales" && x.doc_date >= from && x.doc_date <= to)
      .reduce((sum, x) => sum + (x.lines.get(skuId) ?? 0), 0);

  const producible = plans.filter((s) => !["slow", "dead", "stop", "new"].includes(s.category));
  for (const offset of [12, 33, 55, 78, 98]) {
    const sent = shift(start, offset);
    const received = shift(sent, randInt(12, 15));
    if (received >= shift(today, -2)) continue;
    const k = pick(konveksi);
    const batchId = randomUUID();
    batchSeq++;
    const batchNo = `BATCH-${year}-${String(batchSeq).padStart(3, "0")}`;
    const chosen = [...producible].sort(() => rand() - 0.5).slice(0, randInt(5, 9));
    const recvDoc = newDoc("in", "produksi", received, at(received, randInt(9, 15)), { batch_id: batchId, note: `${k.name} selesai` });
    for (const s of chosen) {
      const qty = Math.max(6, Math.round(salesBetween(s.id, received, shift(received, 21)) * 0.6));
      batchLines.push({ batch_id: batchId, sku_id: s.id, qty_suggested: qty, qty_planned: qty });
      addLine(recvDoc, s.id, qty);
    }
    batches.push({
      id: batchId,
      batch_no: batchNo,
      konveksi_id: k.id,
      sent_date: sent,
      est_done_date: shift(sent, 14),
      status: "done",
      note: "seed-demo",
      done_at: at(received, 16),
      created_by_name: adminName,
      created_at: at(sent, 10),
    });
  }

  // Batch yang masih diproduksi — sebagian sudah diterima kemarin
  {
    const sent = shift(today, -6);
    const k = konveksi[0];
    const batchId = randomUUID();
    batchSeq++;
    const chosen = plans.filter((s) => s.category === "habis" || s.category === "produksi").slice(0, 5);
    const partial = newDoc("in", "produksi", shift(today, -1), at(shift(today, -1), 14), { batch_id: batchId, note: `${k.name} kirim sebagian` });
    chosen.forEach((s, idx) => {
      const qty = Math.max(12, Math.round(s.monthly * 1.1));
      batchLines.push({ batch_id: batchId, sku_id: s.id, qty_suggested: qty, qty_planned: qty });
      if (idx < 2) addLine(partial, s.id, Math.floor(qty / 2));
    });
    batches.push({
      id: batchId,
      batch_no: `BATCH-${year}-${String(batchSeq).padStart(3, "0")}`,
      konveksi_id: k.id,
      sent_date: sent,
      est_done_date: shift(sent, 14),
      status: "in_production",
      note: "seed-demo",
      created_by_name: adminName,
      created_at: at(sent, 10),
    });
  }

  // ── Stock awal (Adjustment +) supaya stock akhir sesuai kategori ──
  const opening = newDoc("in", "adjustment_in", start, at(start, 9, 0), { note: "Stock awal (hasil opname)" });
  const chronological = () => [...docs].sort((a, b) => (a.doc_date === b.doc_date ? a.created_at.localeCompare(b.created_at) : a.doc_date.localeCompare(b.doc_date)));

  for (const s of plans) {
    const minS = Math.ceil((s.monthly / 30) * 21);
    const maxS = Math.ceil((s.monthly / 30) * 35);
    const target: Record<Category, number> = {
      habis: 0,
      produksi: randInt(1, Math.max(1, Math.floor(minS * 0.6))),
      aman: randInt(minS + 2, Math.max(minS + 3, Math.floor(maxS * 1.3))),
      over: randInt(Math.ceil(maxS * 1.7), Math.ceil(maxS * 2.6) + 5),
      slow: randInt(6, 15),
      dead: randInt(8, 18),
      stop: 0,
      new: randInt(10, 20),
    };
    // Saldo terendah sepanjang riwayat (tanpa stock awal) — stock awal harus menutupinya
    let balance = 0;
    let lowest = 0;
    for (const doc of chronological()) {
      if (doc === opening) continue;
      const qty = doc.lines.get(s.id) ?? 0;
      if (!qty) continue;
      balance += doc.direction === "in" ? qty : -qty;
      lowest = Math.min(lowest, balance);
    }
    const initial = Math.max(target[s.category] - balance, -lowest);
    if (s.launch_date > start) {
      // SKU yang launch setelah tanggal mulai: stock awal masuk di tanggal launch
      const launchDoc = newDoc("in", "adjustment_in", s.launch_date, at(s.launch_date, 9, 0), { note: "Stock awal produk baru" });
      addLine(launchDoc, s.id, initial);
      if (launchDoc.lines.size === 0) docs.splice(docs.indexOf(launchDoc), 1);
    } else {
      addLine(opening, s.id, initial);
    }
  }

  // ── Nomor dokumen ──
  const counters = new Map<string, number>();
  for (const doc of chronological()) {
    const prefix = `${doc.direction === "in" ? "IN" : "OUT"}-${doc.doc_date.replaceAll("-", "")}`;
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    doc.doc_no = `${prefix}-${String(n).padStart(3, "0")}`;
  }

  // Hindari bentrok dengan dokumen manual yang sudah ada di tanggal yang sama
  const { data: existingDocs } = await supabase.from("stock_documents").select("doc_no").gte("doc_date", start);
  if (existingDocs?.length) {
    const taken = new Set(existingDocs.map((x) => x.doc_no));
    for (const doc of docs) if (taken.has(doc.doc_no!)) doc.doc_no = `${doc.doc_no}-S`;
  }

  // ── Insert ──
  console.log(`  ${products.length} produk · ${plans.length} SKU · ${batches.length} batch · ${docs.length} catatan`);
  await insertAll(supabase, "products", products);
  await insertAll(
    supabase,
    "skus",
    plans.map((s) => ({ id: s.id, product_id: s.product_id, code: s.code, color: s.color, size: s.size, launch_date: s.launch_date, unit_cost: s.unit_cost })),
  );
  await insertAll(supabase, "production_batches", batches);
  await insertAll(supabase, "production_batch_lines", batchLines);
  await insertAll(
    supabase,
    "stock_documents",
    docs.map((doc) => {
      const row: Partial<Doc> = { ...doc };
      delete row.lines;
      return row;
    }),
  );
  await insertAll(
    supabase,
    "stock_document_lines",
    docs.flatMap((doc) => [...doc.lines.entries()].map(([sku_id, qty]) => ({ document_id: doc.id, sku_id, qty }))),
    1000,
  );
  console.log("✓ Data demo selesai dibuat.");
}

main().catch((e) => {
  console.error("✗", e.message ?? e);
  process.exit(1);
});
