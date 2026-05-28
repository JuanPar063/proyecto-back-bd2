"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import {
  DashboardSkeleton,
  Empty,
  ErrorBox,
  PageHeader,
  StatusBadge,
  formatAgo,
} from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface Submission {
  id: string;
  status: string;
  score: number | null;
  executionTimeMs: number | null;
  createdAt: string;
  challengeId: string;
  studentId: string;
  challenge?: { id: string; title: string; courseId: string };
  student?: { id: string; fullName: string; email: string };
}

const ALL_STATUSES = [
  "ACCEPTED",
  "WRONG_ANSWER",
  "OPTIMIZATION_REQUIRED",
  "SYNTAX_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "QUEUED",
  "RUNNING",
];

export default function SubmissionsListPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    setSession(s);

    const url = s.user.role === "STUDENT" ? "/submissions/my" : "/submissions?limit=100";
    apiFetch<Submission[]>(url, { token: s.accessToken })
      .then(setSubmissions)
      .catch((e: Error) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!submissions) return null;
    if (filter === "all") return submissions;
    return submissions.filter((s) => s.status === filter);
  }, [submissions, filter]);

  if (!session) return null;

  return (
    <div className="px-6 py-8 md:px-10">
      <PageHeader
        title="Submissions"
        subtitle={
          session.user.role === "STUDENT"
            ? "Todas tus submissions enviadas."
            : "Todas las submissions visibles en tus retos."
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
          Filtrar:
        </span>
        <FilterChip label="Todas" active={filter === "all"} onClick={() => setFilter("all")} />
        {ALL_STATUSES.map((st) => (
          <FilterChip
            key={st}
            label={st}
            active={filter === st}
            onClick={() => setFilter(st)}
          />
        ))}
      </div>

      <div className="mt-6">
        {error ? (
          <ErrorBox message={error} />
        ) : filtered === null ? (
          <DashboardSkeleton />
        ) : filtered.length === 0 ? (
          <Empty>
            {filter === "all"
              ? "No hay submissions todavía."
              : `Ninguna con status ${filter}.`}
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
            {filtered.map((s, i) => (
              <Link
                key={s.id}
                href={`/dashboard/submissions/${s.id}`}
                className={cn(
                  "flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-foreground/[0.05]",
                  i > 0 && "border-t border-border/60",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={s.status} />
                    <span className="text-sm font-medium tabular-nums">
                      {s.score ?? 0}/100
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {s.executionTimeMs != null ? `${s.executionTimeMs}ms` : "-"}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {session.user.role === "STUDENT"
                      ? s.challenge?.title ?? s.challengeId
                      : `${s.student?.fullName ?? s.studentId.slice(0, 8)} · ${s.challenge?.title ?? s.challengeId}`}
                  </div>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatAgo(s.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
