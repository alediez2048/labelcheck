import Link from "next/link";

export default function Page(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <h1 className="text-3xl font-bold text-slate-900">LabelCheck</h1>
      <p className="mt-3 text-slate-600">
        TTB COLA AI-enabled alcohol label verification.
      </p>
      <Link
        href="/verify"
        className="mt-6 inline-block rounded-md bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
      >
        Verify an application →
      </Link>
      <p className="mt-6 text-xs text-slate-500">
        Phase 1 — single-application verification. Matching engine lands in P1-3; the result API in P1-7.
      </p>
    </main>
  );
}
