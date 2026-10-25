/** Tampil instan saat membuka menu Rekam Packing, sebelum data dari server selesai. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[480px]">
      <h1 className="mb-3 text-xl font-bold tracking-[-0.02em] text-ink sm:text-2xl">Rekam Packing</h1>
      <div className="flex aspect-square w-full items-center justify-center rounded-[14px] bg-ink text-sm font-medium text-white/80">
        Membuka kamera…
      </div>
      <div className="skeleton mt-4 h-14 w-full" />
      <div className="skeleton mt-3 h-20 w-full" />
    </div>
  );
}
