/**
 * AdminShell — sidebar + main area for the Admin route group (P2-5,
 * D16; FR-29; mockup.md).
 *
 * The supervisor's home: Operations, All Applications, Analytics,
 * Team, Knowledge Base. Each nav row carries the lane-language triple
 * (color + icon + text) so the active row never depends on color
 * alone (NFR-2, AC-9). Rows are 46px+ to meet the same target rule as
 * queue rows.
 *
 * The role switcher pinned at the bottom is the prototype's stand-in
 * for PIV/CAC + SSO (NFR-8); a small slate banner under it states so
 * plainly so the take-home reviewer never mistakes the switcher for a
 * real auth control. The route-group layout above this component
 * handles the cross-shell redirect; this file is presentational only.
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
  { href: "/operations", label: "Operations", icon: "◧" },
  { href: "/applications", label: "All Applications", icon: "▤" },
  { href: "/analytics", label: "Analytics", icon: "◔" },
  { href: "/team", label: "Team", icon: "◍" },
  { href: "/knowledge-base", label: "Knowledge Base", icon: "❑" },
];

export function AdminShell({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside
        aria-label="Admin navigation"
        className="flex shrink-0 flex-col gap-4 border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-b-0 lg:border-r"
      >
        <div className="flex items-baseline justify-between gap-2 lg:block">
          <Link
            href="/operations"
            className="text-lg font-bold tracking-tight text-slate-900 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            LabelCheck
          </Link>
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 lg:mt-1">
            Admin shell
          </p>
        </div>

        <nav aria-label="Admin sections" className="lg:flex-1">
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
                    className={`flex min-h-[46px] items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                      isActive
                        ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                        : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={
                        isActive ? "text-indigo-700" : "text-slate-500"
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
