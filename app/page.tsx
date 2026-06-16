"use client";

import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

import { useQueue } from "@/lib/queue/QueueProvider";

const ADMIN_DEMO_ID = "admin-sasha";

/**
 * Landing page — auto-redirects to the Admin Operations dashboard
 * as the demo default. Sets the active actor to the supervisor
 * (admin-sasha) first so the (admin) route group doesn't bounce the
 * visit back to the agent queue.
 *
 * Switch to the agent view via the role switcher in the sidebar.
 */
export default function Page(): React.ReactElement {
  const router = useRouter();
  const { setCurrentAgentId } = useQueue();

  useEffect(() => {
    setCurrentAgentId(ADMIN_DEMO_ID);
    router.replace("/operations");
  }, [router, setCurrentAgentId]);

  return (
    <main
      className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-10 text-center"
      aria-live="polite"
    >
      <h1 className="text-3xl font-bold text-slate-900">LabelCheck</h1>
      <p className="mt-3 text-sm text-slate-600">Loading Operations…</p>
    </main>
  );
}
