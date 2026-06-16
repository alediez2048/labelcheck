/**
 * AdminShell — sidebar + main area for the Admin route group.
 *
 * Styled against `docs/03-ui/mockup.html`: 236px sidebar with a
 * gradient brand block, grouped nav with uppercase group labels, and
 * a signed-in identity block pinned at the bottom (RoleSwitcher).
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

import { RoleSwitcher } from "./RoleSwitcher";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const NAV: ReadonlyArray<NavItem> = [
  { href: "/operations", label: "Operations", icon: "◧" },
  { href: "/applications", label: "All Applications", icon: "▤" },
  { href: "/analytics", label: "Analytics", icon: "◔" },
  { href: "/team", label: "Team", icon: "◍" },
  { href: "/match-review", label: "Match review", icon: "✓" },
  { href: "/disagreement-queue", label: "Disagreement queue", icon: "⇄" },
  { href: "/model-health", label: "Model health", icon: "◈" },
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
        className="flex shrink-0 flex-col gap-4 border-b border-line bg-surface p-4 lg:sticky lg:top-0 lg:h-screen lg:w-[236px] lg:border-b-0 lg:border-r"
      >
        <Link
          href="/operations"
          className="flex items-center gap-2.5 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          <span
            aria-hidden="true"
            className="grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-brand-gradient text-base font-extrabold text-white"
          >
            L
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[17px] font-bold text-ink">LabelCheck</span>
            <span className="text-[12px] text-muted">TTB Label Compliance</span>
          </span>
        </Link>

        <nav aria-label="Admin sections" className="lg:flex-1">
          <p className="hidden px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 lg:block">
            Oversight
          </p>
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
                    className={`flex min-h-[44px] items-center gap-3 whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[15px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 ${
                      isActive
                        ? "bg-brand-soft text-brand-ink"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span aria-hidden="true" className="w-[18px] text-center">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 hidden px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 lg:block">
            Resources
          </p>
          <ul className="flex flex-col gap-1">
            <li>
              <Link
                href="/presentation"
                aria-current={
                  pathname === "/presentation" ? "page" : undefined
                }
                className={`flex min-h-[44px] items-center gap-3 whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[15px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 ${
                  pathname === "/presentation"
                    ? "bg-brand-soft text-brand-ink"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span aria-hidden="true" className="w-[18px] text-center">
                  ⧉
                </span>
                <span>Presentation</span>
              </Link>
            </li>
            <li>
              <a
                href="/mockup.html"
                target="_blank"
                rel="noreferrer"
                className="flex min-h-[44px] items-center gap-3 whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[15px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand/40"
              >
                <span aria-hidden="true" className="w-[18px] text-center">
                  ◫
                </span>
                <span>Original mockup</span>
                <span
                  aria-label="opens in new tab"
                  className="ml-auto text-[11px] font-medium text-muted"
                >
                  ↗
                </span>
              </a>
            </li>
          </ul>
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
          <RoleSwitcher />
          <p className="px-2 text-[11px] leading-snug text-muted">
            Prototype: role is simulated. Production uses PIV/CAC and SSO.
          </p>
        </div>
      </aside>

      <div className="flex-1">{children}</div>
    </div>
  );
}
