/**
 * Agent shell layout — the QueueProvider is mounted in the root layout
 * (`app/layout.tsx`) so the Admin shell at `/operations` and the
 * Agent shell at `/queue` share session state. This layout exists as
 * the seam where P2-5's role-gate redirect will land.
 */

import React from "react";

export default function AgentQueueLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
