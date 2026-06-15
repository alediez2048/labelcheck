/**
 * Admin route-group layout (P2-5, D16; FR-29).
 *
 * Wraps every `/operations`, `/applications`, `/analytics`, `/team`,
 * and `/knowledge-base` route in the `AdminShell`. Also acts as the
 * route-layer half of the admin gate: when the active actor is not an
 * admin, redirect them to `/queue` and render nothing in the meantime.
 *
 * Why a client effect, not `next/navigation`'s `redirect`? The
 * `currentAgent` lives in the QueueProvider (React state) and changes
 * with the role switcher. A server-side `redirect` cannot observe the
 * client store, so the gate must run as an effect after hydration.
 * The lib-layer `requireAdmin` (in `lib/auth/scope.ts`) is the
 * defense-in-depth — even if this redirect were bypassed, the
 * admin-only actions still throw.
 */

"use client";

import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

import { AdminShell } from "@/components/shell/AdminShell";
import { useQueue } from "@/lib/queue/QueueProvider";

export default function AdminGroupLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const router = useRouter();
  const { currentAgent } = useQueue();

  const isAdmin = currentAgent?.role === "admin";

  useEffect(() => {
    if (currentAgent !== undefined && !isAdmin) {
      router.replace("/queue");
    }
  }, [router, currentAgent, isAdmin]);

  if (!isAdmin) {
    // Either still hydrating or actively redirecting. Render nothing
    // so an agent never sees an admin-shell flash.
    return null;
  }

  return <AdminShell>{children}</AdminShell>;
}
