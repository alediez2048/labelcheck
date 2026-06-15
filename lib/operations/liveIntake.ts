/**
 * Live intake feed (P2-2, mockup.md Operations).
 *
 * Most-recent N applications with a destination string derived from
 * the current store state:
 *
 *   - lane === "match"               → "Auto-cleared → approval pool"
 *   - exception, unclaimed           → "→ review pool"
 *   - exception, assigned to agent X → "→ <agent name>"
 *
 * The destination is a STRING — UI rendering doesn't care which case
 * landed it there, so the selector flattens the branch.
 */

import type { QueueAgent, QueueStoreState } from "@/lib/queue/types";
import type { Lane } from "@/types";

export type LiveIntakeEntry = {
  applicationId: string;
  brand: string;
  lane: Lane;
  destination: string;
  receivedAt: string;
};

export function selectLiveIntake(
  state: QueueStoreState,
  limit = 10,
): ReadonlyArray<LiveIntakeEntry> {
  const sorted = [...state.applications].sort((a, b) =>
    a.receivedAt > b.receivedAt ? -1 : a.receivedAt < b.receivedAt ? 1 : 0,
  );
  return sorted.slice(0, limit).map((app) => ({
    applicationId: app.applicationId,
    brand: app.brand,
    lane: app.verification.lane,
    destination: destinationFor(app, state.agents),
    receivedAt: app.receivedAt,
  }));
}

function destinationFor(
  app: { verification: { lane: Lane }; assignedAgentId: string | null },
  agents: ReadonlyArray<QueueAgent>,
): string {
  if (app.verification.lane === "match") {
    return "Auto-cleared → approval pool";
  }
  if (app.assignedAgentId === null) {
    return "→ review pool";
  }
  const agent = agents.find((a) => a.id === app.assignedAgentId);
  return agent ? `→ ${agent.name}` : "→ unknown agent";
}
