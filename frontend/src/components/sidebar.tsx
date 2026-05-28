"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
}

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const isProfessor = role === "PROFESSOR" || role === "ADMIN";

  const items: NavItem[] = [
    { href: "/dashboard", label: "Resumen" },
    { href: "/dashboard/courses", label: "Cursos" },
    { href: "/dashboard/challenges", label: "Retos" },
    { href: "/dashboard/submissions", label: "Submissions" },
    { href: "/dashboard/evaluations", label: "Evaluaciones" },
    ...(isProfessor
      ? [
          { href: "/dashboard/reports", label: "Reportes" },
          { href: "/dashboard/ai", label: "Asistente IA" },
        ]
      : []),
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 border-r border-border/60 bg-background px-3 py-6 md:block">
      <p className="px-3 pb-3 text-[0.6rem] uppercase tracking-[0.22em] text-muted">
        Menú
      </p>
      <nav className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent-orange/10 text-accent-orange"
                  : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "h-1 w-1 rounded-full",
                  active ? "bg-accent-orange" : "bg-muted",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
