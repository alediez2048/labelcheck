/**
 * AgentShell — sidebar + main area for the Agent route group (P2-5,
 * D16; FR-29; mockup.md).
 *
 * The agent sees only their own work: My Queue, My Stats, Profile.
 * The shell deliberately omits the admin nav items so a non-admin
 * actor cannot reach `/operations` etc. by clicking. Defense in depth
 * lives on the route-group layout (redirect) and the lib layer
 * (`requireAdmin` throws); the missing nav items are the third line.
 *
 * Nav rows pair color + icon + text (NFR-2, AC-9) and meet the 46px
 * target rule. The role switcher pinned to the bottom is the
 * prototype's identity simulation — the banner under it spells out
 * that production uses PIV/CAC + SSO (NFR-8).
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

import { RoleSwitcher } from "./RoleSwitcher";

type NavItem = {
  href: string;
  label: string;
  /** Glyph that pairs with the active treatment — never color alone. */
  icon: string;
};

const NAV: ReadonlyArray<NavItem> = [
  { href: "/queue", label: "My Queue", icon: "▤" },
  { href: "/stats", label: "My Stats", icon: "◔" },
  { href: "/profile", label: "Profile", icon: "◉" },
];

export function AgentShell({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside
        aria-label="Agent navigation"
        className="flex shrink-0 flex-col gap-4 border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-b-0 lg:border-r"
      >
        <div className="flex items-baseline justify-between gap-2 lg:block">
          <Link
            href="/queue"
            className="text-lg font-bold tracking-tight text-slate-900 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            LabelCheck
          </Link>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 lg:mt-1">
            Agent shell
          </p>
        </div>

        <nav aria-label="Agent sections" className="lg:flex-1">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {NAV.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname?.startsWith(`${item.href}/`) === true;
              return (
                <li key={item.href} className="shrink-0 lg:shrink">
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-[46px] items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300 ${
                      isActive
                        ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                        : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={
                        isActive ? "text-emerald-700" : "text-slate-500"
                      }
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          <RoleSwitcher />
          <p className="text-xs leading-snug text-slate-500">
            Prototype: role is simulated. Production uses PIV/CAC and SSO.
          </p>
        </div>
      </aside>

      <div className="flex-1">{children}</div>
    </div>
  );
}
