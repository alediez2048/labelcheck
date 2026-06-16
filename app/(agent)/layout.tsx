/**
 * Agent route-group layout (P2-5, D16; FR-29).
 *
 * Wraps every `/queue`, `/queue/[id]`, `/stats`, and `/profile` route
 * in the `AgentShell`. Also acts as the route-layer half of the agent
 * gate: when the active actor is an admin (i.e. they switched to the
 * supervisor in the role switcher), redirect them to `/operations` and
 * render nothing in the meantime.
 *
 * The agent layout's redirect is based on the ACTIVE actor (from the
 * switcher), not the underlying user's role — when an admin switches
 * to "view as agent", the active actor becomes the agent and `/queue`
 * must not redirect them away. The QueueProvider's `currentAgentId`
 * drives that distinction.
 */

"use client";

import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

import { ChatPanel } from "@/components/assistant/ChatPanel";
import { AgentShell } from "@/components/shell/AgentShell";
import { useQueue } from "@/lib/queue/QueueProvider";

export default function AgentGroupLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const router = useRouter();
  const { currentAgent } = useQueue();

  const isAgent = currentAgent?.role === "agent";

  useEffect(() => {
    if (currentAgent !== undefined && !isAgent) {
      router.replace("/operations");
    }
  }, [router, currentAgent, isAgent]);

  if (!isAgent) {
    return null;
  }

  return (
    <AgentShell>
      {children}
      <ChatPanel />
    </AgentShell>
  );
}
