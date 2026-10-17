export default function Home() {
  const supabaseReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Pretty Basic Ops</h1>
      <p className="text-gray-500">Web operasional Pretty Basic</p>
      <p className={supabaseReady ? "text-green-600" : "text-orange-600"}>
        Supabase: {supabaseReady ? "terhubung" : "belum diatur"}
      </p>
    </main>
  );
}
