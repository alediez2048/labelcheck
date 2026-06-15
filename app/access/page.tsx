/**
 * Access gate entry page.
 *
 * SPEND SHIELD, not authentication. The page itself says so out loud.
 * Production identity is P6-3 (PIV/CAC + SSO inside the FedRAMP boundary).
 */

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; next?: string };

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const hasError = params.error === "1";
  const safeNext =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold text-slate-900">LabelCheck</h1>
      <p className="mt-2 text-sm text-slate-600">Access required.</p>

      <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        This is a <strong>spend shield</strong>, not security. Production identity is PIV/CAC + SSO within the agency&apos;s FedRAMP boundary (NFR-8 / P6-3).
      </div>

      <form action="/api/access" method="POST" className="mt-6 flex flex-col gap-3">
        <input type="hidden" name="next" value={safeNext} />
        <label htmlFor="passcode" className="text-sm font-medium text-slate-700">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          required
          autoComplete="off"
          autoFocus
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
        >
          Enter
        </button>
      </form>

      {hasError && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          Incorrect passcode.
        </p>
      )}
    </main>
  );
}
