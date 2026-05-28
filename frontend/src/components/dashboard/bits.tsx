"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/* ============================================================
 * Piezas UI reutilizables para todas las páginas del dashboard.
 * Sin backdrop-blur: el shader vive solo en el landing, el
 * dashboard usa fondo negro liso con acentos orange/yellow.
 * ============================================================ */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl tracking-tight md:text-3xl">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-4 flex items-end justify-between gap-4">
          {title && (
            <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({
  children,
  href,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const base =
    "rounded-xl border border-border bg-foreground/[0.03] p-5 transition-colors";
  if (href) {
    // Note: caller decides if Link wraps; we keep <a> for simple cases.
    return (
      <a
        href={href}
        className={cn(base, "hover:border-accent-orange/60", className)}
      >
        {children}
      </a>
    );
  }
  return <div className={cn(base, className)}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-foreground/[0.02] px-5 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-status-wrong/40 bg-status-wrong/10 px-5 py-4 text-sm text-status-wrong">
      {message}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-xl border border-border bg-foreground/[0.03]"
        />
      ))}
    </div>
  );
}

export function MetricCard({
  value,
  label,
  accent = "default",
}: {
  value: string | number;
  label: string;
  accent?: "default" | "orange" | "yellow";
}) {
  const tint = {
    default: "text-foreground",
    orange: "text-accent-orange",
    yellow: "text-accent-yellow",
  }[accent];
  return (
    <div className="rounded-xl border border-border bg-foreground/[0.03] px-5 py-4">
      <div className={cn("text-2xl tabular-nums", tint)}>{value}</div>
      <div className="mt-1 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export function PrimaryButton({
  href,
  onClick,
  children,
  variant = "orange",
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "orange" | "yellow" | "ghost";
}) {
  const cls = cn(
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-transform hover:scale-[1.02]",
    variant === "orange" && "bg-accent-orange text-background",
    variant === "yellow" && "bg-accent-yellow text-background",
    variant === "ghost" &&
      "border border-border bg-background text-foreground hover:border-accent-orange/60",
  );
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function DifficultyChip({
  level,
}: {
  level: "EASY" | "MEDIUM" | "HARD";
}) {
  const tone = {
    EASY: "border-status-accepted/40 text-status-accepted",
    MEDIUM: "border-accent-yellow/40 text-accent-yellow",
    HARD: "border-accent-pink/40 text-accent-pink",
  }[level];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border bg-background px-2 font-mono text-[0.6rem] uppercase tracking-widest",
        tone,
      )}
    >
      {level}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  ACCEPTED: "bg-status-accepted/15 text-status-accepted border-status-accepted/30",
  WRONG_ANSWER: "bg-status-wrong/15 text-status-wrong border-status-wrong/30",
  SYNTAX_ERROR: "bg-status-warning/15 text-status-warning border-status-warning/30",
  OPTIMIZATION_REQUIRED:
    "bg-status-critical/15 text-status-critical border-status-critical/30",
  TIME_LIMIT_EXCEEDED: "bg-status-timeout/15 text-status-timeout border-status-timeout/30",
  RUNTIME_ERROR: "bg-status-wrong/15 text-status-wrong border-status-wrong/30",
  QUEUED: "bg-muted/15 text-muted-foreground border-border",
  RUNNING: "bg-muted/15 text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.QUEUED;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 font-mono text-[0.6rem] uppercase tracking-widest",
        tone,
      )}
    >
      {status}
    </span>
  );
}

export function StateMarker({
  state,
}: {
  state: "solved" | "partial" | "open";
}) {
  const cfg = {
    solved: { dot: "bg-status-accepted", text: "Resuelto" },
    partial: { dot: "bg-accent-yellow", text: "En curso" },
    open: { dot: "bg-muted", text: "Pendiente" },
  }[state];
  return (
    <span className="inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.text}
    </span>
  );
}

export function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function formatIn(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "ya";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `en ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `en ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `en ${h}h`;
  const d = Math.floor(h / 24);
  return `en ${d}d`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function Num({ children }: { children: number }) {
  return (
    <span className="font-mono tabular-nums text-foreground">{children}</span>
  );
}

export function LiveDot() {
  return (
    <span className="relative inline-flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full rounded-full bg-accent-orange/70 motion-safe:animate-ping" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-orange" />
    </span>
  );
}

export function BlockHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="relative pb-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
          {title}
        </h2>
        {right}
      </div>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-accent-orange/0 via-accent-orange/30 to-accent-yellow/0" />
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="space-y-12 pb-16">
      <div className="border-b border-border/60 pb-6">
        <div className="h-7 w-48 animate-pulse rounded bg-foreground/[0.06]" />
        <div className="mt-3 h-4 w-[90%] max-w-[40rem] animate-pulse rounded bg-foreground/[0.04]" />
      </div>
      <div>
        <div className="h-3 w-32 animate-pulse rounded bg-foreground/[0.06]" />
        <div className="mt-4 h-36 animate-pulse rounded-xl border border-border bg-foreground/[0.03]" />
      </div>
      <div>
        <div className="h-3 w-40 animate-pulse rounded bg-foreground/[0.06]" />
        <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse bg-foreground/[0.03]" />
          ))}
        </div>
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-border bg-foreground/[0.03]" />
    </div>
  );
}

export function useCountUp(target: number, durationMs = 600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce || target === 0) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

export function FilterChip({
  active,
  onClick,
  label,
  count,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  tone?: "default" | "orange";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-widest transition-colors",
        active
          ? tone === "orange"
            ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
            : "border-foreground/60 bg-foreground/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-accent-orange/20 px-1.5 text-[0.6rem] tabular-nums text-accent-orange">
          {count}
        </span>
      )}
    </button>
  );
}
