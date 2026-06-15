/**
 * /queue — My Queue (Agent shell home, P2-1).
 *
 * The agent's claimed exceptions, sorted problems-first. Clean
 * matches (the bulk-confirm pile) never appear here — they live on
 * the Admin Operations view (D11, D15; mockup.md My Queue).
 *
 * Reads queue state from the `QueueProvider` mounted in the route-
 * group layout. Get-next is wired through the provider's `claimNext`
 * action, which mutates the in-memory store and re-renders.
 */

"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { EmptyQueue } from "@/components/queue/EmptyQueue";
import { QueueClaimBar } from "@/components/queue/QueueClaimBar";
import { QueueRow } from "@/components/queue/QueueRow";
import { useQueue } from "@/lib/queue/QueueProvider";

export default function MyQueuePage(): React.ReactElement {
  const router = useRouter();
  const { myQueue, poolCount, currentAgent, claimNext } = useQueue();
  const [notice, setNotice] = useState<string | null>(null);

  const agentAvailable = currentAgent?.availability === "available";

  function handleGetNext(): void {
    const outcome = claimNext();
    if (outcome.ok) {
      // Auto-open the freshly claimed item — the mockup's "pull
      // and start" rhythm.
      router.push(`/queue/${outcome.claimed.applicationId}`);
      return;
    }
    setNotice(
      outcome.reason === "agent_unavailable"
        ? "You're set to out of office. Update Profile to start pulling work."
        : "No exceptions in the pool right now — try again in a moment.",
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Agent shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">My Queue</h1>
        <p className="mt-1 text-sm text-slate-600">
          {currentAgent
            ? `Signed in as ${currentAgent.name} · ${currentAgent.specializations.join(", ")}`
            : "No agent selected"}
        </p>
      </header>

      <QueueClaimBar
        claimedCount={myQueue.length}
        poolCount={poolCount}
        agentAvailable={agentAvailable}
        onGetNext={handleGetNext}
      />

      {notice !== null && (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {notice}
        </p>
      )}

      {myQueue.length === 0 ? (
        <EmptyQueue
          poolCount={poolCount}
          agentAvailable={agentAvailable}
          onGetNext={handleGetNext}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {myQueue.map((item) => (
            <QueueRow key={item.application.applicationId} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}
