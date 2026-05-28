"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import {
  DashboardSkeleton,
  Empty,
  ErrorBox,
  PageHeader,
} from "@/components/dashboard/bits";

interface Course { id: string; code: string; name: string }

export default function ReportsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    setSession(s);
    apiFetch<Course[]>("/courses", { token: s.accessToken })
      .then(setCourses)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!session) return null;

  return (
    <div className="px-6 py-8 md:px-10">
      <PageHeader
        title="Reportes"
        subtitle="Métricas, leaderboards y dificultad real por curso."
      />

      <div className="mt-8">
        {error ? (
          <ErrorBox message={error} />
        ) : courses === null ? (
          <DashboardSkeleton />
        ) : courses.length === 0 ? (
          <Empty>No tenés cursos donde mostrar reportes.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border bg-foreground/[0.03] p-5"
              >
                <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {c.code}
                </div>
                <h3 className="mt-1 text-lg tracking-tight">{c.name}</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/dashboard/reports/courses/${c.id}`}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent-orange/60 hover:text-foreground"
                  >
                    Resumen del curso
                  </Link>
                  <Link
                    href={`/dashboard/reports/leaderboard?courseId=${c.id}`}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent-yellow/60 hover:text-foreground"
                  >
                    Leaderboard
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
