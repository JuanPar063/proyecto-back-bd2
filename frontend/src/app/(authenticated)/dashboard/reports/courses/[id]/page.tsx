"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import {
  DashboardSkeleton,
  Empty,
  ErrorBox,
  PageHeader,
} from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface CourseReport {
  courseId: string;
  averageScore: number;
  topStudents: Array<{
    studentId: string;
    fullName: string;
    averageScore: number;
    solvedChallenges: number;
  }>;
  hardestChallenges: Array<{
    challengeId: string;
    title: string;
    successRate: number;
  }>;
}

export default function CourseReportPage() {
  const params = useParams<{ id: string }>();
  const courseId = params?.id;
  const [session, setSession] = useState<Session | null>(null);
  const [report, setReport] = useState<CourseReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s || !courseId) return;
    setSession(s);
    apiFetch<CourseReport>(`/reports/courses/${courseId}`, {
      token: s.accessToken,
    })
      .then(setReport)
      .catch((e: Error) => setError(e.message));
  }, [courseId]);

  if (!session || !courseId) return null;

  return (
    <div className="px-6 py-8 md:px-10">
      <Link
        href="/dashboard/reports"
        className="mb-4 inline-flex text-xs text-muted-foreground hover:text-foreground"
      >
        ← Reportes
      </Link>

      <PageHeader
        title="Reporte del curso"
        subtitle="Promedio, top 5 estudiantes y retos con mayor dificultad real."
      />

      {error ? (
        <div className="mt-8"><ErrorBox message={error} /></div>
      ) : !report ? (
        <div className="mt-8"><DashboardSkeleton /></div>
      ) : (
        <>
          <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-foreground/[0.03] px-5 py-4">
              <div className="text-2xl tabular-nums text-accent-orange">
                {report.averageScore.toFixed(1)}
              </div>
              <div className="mt-1 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                Score promedio
              </div>
            </div>
            <div className="rounded-xl border border-border bg-foreground/[0.03] px-5 py-4">
              <div className="text-2xl tabular-nums">
                {report.topStudents.length}
              </div>
              <div className="mt-1 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                Estudiantes activos
              </div>
            </div>
            <div className="rounded-xl border border-border bg-foreground/[0.03] px-5 py-4">
              <div className="text-2xl tabular-nums">
                {report.hardestChallenges.length}
              </div>
              <div className="mt-1 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                Retos rankeados
              </div>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
              Top 5 estudiantes
            </h2>
            {report.topStudents.length === 0 ? (
              <div className="mt-4"><Empty>Aún no hay submissions.</Empty></div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
                {report.topStudents.map((s, i) => (
                  <div
                    key={s.studentId}
                    className={cn(
                      "grid grid-cols-[3rem_1fr_5rem_5rem] items-center gap-4 px-5 py-3 text-sm",
                      i > 0 && "border-t border-border/40",
                    )}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="truncate">
                      {s.fullName || s.studentId.slice(0, 8)}
                    </span>
                    <span className="text-right font-mono tabular-nums text-accent-orange">
                      {s.averageScore.toFixed(1)}
                    </span>
                    <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {s.solvedChallenges} retos
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mb-12 mt-10">
            <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
              Retos por dificultad real (tasa de éxito ascendente)
            </h2>
            {report.hardestChallenges.length === 0 ? (
              <div className="mt-4"><Empty>Sin datos suficientes.</Empty></div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
                {report.hardestChallenges.map((c, i) => (
                  <Link
                    key={c.challengeId}
                    href={`/dashboard/challenges/${c.challengeId}`}
                    className={cn(
                      "flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-foreground/[0.05]",
                      i > 0 && "border-t border-border/40",
                    )}
                  >
                    <span>{c.title}</span>
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums",
                        c.successRate < 0.3
                          ? "text-status-wrong"
                          : c.successRate < 0.6
                            ? "text-accent-yellow"
                            : "text-status-accepted",
                      )}
                    >
                      {(c.successRate * 100).toFixed(0)}%
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
