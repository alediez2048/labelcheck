/**
 * AdminShell — sidebar + main area for the Admin route group.
 *
 * Three top-level nav groups, each collapsible to its sub-items.
 * The group containing the current path is open on first render; the
 * operator can collapse/expand other groups by clicking the header.
 * Styled against `docs/03-ui/mockup.html`.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useMemo, useState } from "react";

import { RoleSwitcher } from "./RoleSwitcher";

type NavItem = {
  href: string;
  label: string;
};

type NavGroup = {
  id: string;
  label: string;
  icon: string;
  items: ReadonlyArray<NavItem>;
};

const GROUPS: ReadonlyArray<NavGroup> = [
  {
    id: "workspace",
    label: "Workspace",
    icon: "◧",
    items: [
      { href: "/operations", label: "Operations" },
      { href: "/match-review", label: "Match review" },
      { href: "/disagreement-queue", label: "Disagreement queue" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    icon: "◔",
    items: [
      { href: "/applications", label: "All Applications" },
      { href: "/analytics", label: "Analytics" },
      { href: "/team", label: "Team" },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: "◈",
    items: [
      { href: "/model-health", label: "Model health" },
      { href: "/knowledge-base", label: "Knowledge Base" },
      { href: "/presentation", label: "Presentation" },
    ],
  },
];

function isItemActive(itemHref: string, pathname: string | null): boolean {
  if (pathname === null) return false;
  if (pathname === itemHref) return true;
  return pathname.startsWith(`${itemHref}/`);
}

export function AdminShell({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();

  const activeGroupId = useMemo(() => {
    for (const g of GROUPS) {
      if (g.items.some((it) => isItemActive(it.href, pathname))) return g.id;
    }
    return GROUPS[0]?.id;
  }, [pathname]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activeGroupId) initial.add(activeGroupId);
    return initial;
  });

  function toggleGroup(id: string): void {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
          <ul className="flex flex-col gap-1">
            {GROUPS.map((group) => {
              const open = openGroups.has(group.id);
              const groupHasActive = group.items.some((it) =>
                isItemActive(it.href, pathname),
              );
              return (
                <li key={group.id} className="flex flex-col">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleGroup(group.id)}
                    className={`flex min-h-[44px] items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[15px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 ${
                      groupHasActive
                        ? "bg-brand-soft text-brand-ink"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span aria-hidden="true" className="w-[18px] text-center">
                      {group.icon}
                    </span>
                    <span className="flex-1">{group.label}</span>
                    <span
                      aria-hidden="true"
                      className={`text-[10px] text-muted transition-transform ${open ? "rotate-180" : ""}`}
                    >
                      ▾
                    </span>
                  </button>
                  {open && (
                    <ul className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-line pl-3">
                      {group.items.map((item) => {
                        const isActive = isItemActive(item.href, pathname);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              aria-current={isActive ? "page" : undefined}
                              className={`flex min-h-[36px] items-center rounded-[8px] px-3 py-1.5 text-[13.5px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 ${
                                isActive
                                  ? "bg-brand-soft text-brand-ink"
                                  : "text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
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
