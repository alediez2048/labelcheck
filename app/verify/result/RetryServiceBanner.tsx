/**
 * RetryServiceBanner — surfaces a provider-side slowness recommendation
 * (PROVIDER_TIMEOUT / PROVIDER_RATE_LIMIT / PROVIDER_UNAVAILABLE).
 *
 * Distinct from UnreadableBanner: the artwork is likely fine, the
 * label-reading service was just slow or unavailable. Default action is
 * to re-process the application, not to bounce it back to the applicant.
 */

export function RetryServiceBanner({
  flags,
}: {
  flags: ReadonlyArray<string>;
}): React.ReactElement {
  return (
    <section
      role="alert"
      aria-labelledby="retry-service-heading"
      className="rounded-lg border-2 border-amber-500 bg-amber-50 px-5 py-4 text-amber-900"
    >
      <div className="flex items-start gap-3">
        <span
          aria-label="warning"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-current text-lg font-bold"
        >
          ↻
        </span>
        <div className="flex flex-col gap-2">
          <h2 id="retry-service-heading" className="text-base font-semibold">
            Recommendation: Re-process — label-reading service was slow
          </h2>
          <p className="text-sm">
            The label-reading service did not respond in time. The artwork
            may be perfectly readable — try re-processing the application
            before returning it to the applicant. If re-processing keeps
            timing out, then return for a clearer image.
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
