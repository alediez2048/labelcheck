/**
 * Agent shell layout — wraps the queue routes with the in-memory
 * `QueueProvider` so the list page and the per-application review
 * detail share state (P2-1).
 *
 * The (agent) route group exists so Phase 2's role split (P2-5) can
 * land the role switcher here without disturbing the URLs — `/queue`
 * stays `/queue`.
 */

import React from "react";

import { QueueProvider } from "@/lib/queue/QueueProvider";

export default function AgentQueueLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <QueueProvider>{children}</QueueProvider>;
}
