const PAGE_SIZE = 1000;

interface RangeQuery {
  range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Ambil semua baris melewati batas 1000 baris PostgREST. `build` harus membuat query baru setiap dipanggil. */
export async function fetchAll<T>(build: () => RangeQuery): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
