"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import {
  DashboardSkeleton,
  Empty,
  ErrorBox,
  PageHeader,
} from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  studentId: string;
  fullName: string;
  totalScore: number;
  solvedChallenges: number;
  totalSubmissions: number;
  bestExecutionTimeMs: number | null;
}

interface Course { id: string; code: string; name: string }

function LeaderboardInner() {
  const search = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>(search?.get("courseId") ?? "");
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    setSession(s);
    apiFetch<Course[]>("/courses", { token: s.accessToken })
      .then((cs) => {
        setCourses(cs);
        if (!courseId && cs.length > 0) setCourseId(cs[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!session || !courseId) return;
    setEntries(null);
    apiFetch<{ entries: LeaderboardEntry[] }>(
      `/reports/leaderboard?courseId=${courseId}`,
      { token: session.accessToken },
    )
      .then((r) => setEntries(r.entries))
      .catch((e: Error) => setError(e.message));
  }, [session, courseId]);

  if (!session) return null;

  return (
    <div className="px-6 py-8 md:px-10">
      <PageHeader
        title="Leaderboard"
        subtitle="Ranking de estudiantes por puntaje total dentro del curso."
      />

      {courses.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
            Curso:
          </span>
          {courses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCourseId(c.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                courseId === c.id
                  ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {c.code}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {error ? (
          <ErrorBox message={error} />
        ) : entries === null ? (
          <DashboardSkeleton />
        ) : entries.length === 0 ? (
          <Empty>Aún no hay submissions en este curso.</Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
            <div className="grid grid-cols-[3rem_1fr_repeat(3,_minmax(0,_5rem))] gap-4 border-b border-border/60 bg-foreground/[0.05] px-5 py-2 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
              <span>#</span>
              <span>Estudiante</span>
              <span className="text-right">Score</span>
              <span className="text-right">Retos</span>
              <span className="text-right">Mejor ms</span>
            </div>
            {entries.map((e, i) => (
              <div
                key={e.studentId}
                className={cn(
                  "grid grid-cols-[3rem_1fr_repeat(3,_minmax(0,_5rem))] items-center gap-4 px-5 py-3 text-sm",
                  i > 0 && "border-t border-border/40",
                  i === 0 && "bg-accent-orange/5",
                )}
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {i + 1}
                </span>
                <span className="truncate">
                  {e.fullName || `student ${e.studentId.slice(0, 8)}`}
                </span>
                <span className="text-right font-mono tabular-nums text-accent-orange">
                  {e.totalScore}
                </span>
                <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {e.solvedChallenges}
                </span>
                <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {e.bestExecutionTimeMs ?? "-"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div className="px-6 py-8 md:px-10"><DashboardSkeleton /></div>}>
      <LeaderboardInner />
    </Suspense>
  );
}
