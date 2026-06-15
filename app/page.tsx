export default function Page(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <h1 className="text-3xl font-bold text-slate-900">LabelCheck</h1>
      <p className="mt-3 text-slate-600">
        TTB COLA AI-enabled alcohol label verification — scaffold ready.
      </p>
      <p className="mt-6 inline-block rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900">
        Tailwind smoke test: this banner is styled via utility classes.
      </p>
      <p className="mt-6 text-xs text-slate-500">
        P0-1 scaffold. The verification flow lands in P1.
      </p>
    </main>
  );
}
