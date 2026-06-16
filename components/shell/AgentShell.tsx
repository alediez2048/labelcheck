/**
 * AgentShell — sidebar + main area for the Agent route group.
 * Same shell shape as AdminShell, scoped to agent-only sections.
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
        className="flex shrink-0 flex-col gap-4 border-b border-line bg-surface p-4 lg:sticky lg:top-0 lg:h-screen lg:w-[236px] lg:border-b-0 lg:border-r"
      >
        <Link
          href="/queue"
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

        <nav aria-label="Agent sections" className="lg:flex-1">
          <p className="hidden px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 lg:block">
            My Work
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
