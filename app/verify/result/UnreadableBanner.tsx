/**
 * UnreadableBanner — surfaces the FR-26b "Return — unreadable image"
 * recommendation when extraction failed on one or more faces.
 *
 * Renders above the disposition panel so the agent's eye lands on it
 * first. The agent can still override by choosing Approve — the
 * recommendation is the default, not a forced choice. Cites the affected
 * face(s) so the agent knows which artwork to look at.
 */

export function UnreadableBanner({
  flags,
}: {
  flags: ReadonlyArray<string>;
}): React.ReactElement {
  return (
    <section
      role="alert"
      aria-labelledby="unreadable-heading"
      className="rounded-lg border-2 border-amber-500 bg-amber-50 px-5 py-4 text-amber-900"
    >
      <div className="flex items-start gap-3">
        <span
          aria-label="warning"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-current text-lg font-bold"
        >
          !
        </span>
        <div className="flex flex-col gap-2">
          <h2 id="unreadable-heading" className="text-base font-semibold">
            Recommendation: Return — unreadable image
          </h2>
          <p className="text-sm">
            The system could not read one or more label faces clearly enough
            to verify. The default disposition is to return the application
            for a clearer re-upload. You may still approve manually if you
            can verify the label visually.
          </p>
          {flags.length > 0 && (
            <ul className="ml-1 list-disc space-y-1 pl-4 text-sm">
              {flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
