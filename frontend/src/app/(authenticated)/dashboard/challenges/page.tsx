"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import {
  DashboardSkeleton,
  DifficultyChip,
  Empty,
  ErrorBox,
  PageHeader,
  PrimaryButton,
  StateMarker,
} from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  courseId: string;
  status: string;
}

interface Course {
  id: string;
  code: string;
  name: string;
}

interface Submission {
  id: string;
  status: string;
  challengeId: string;
}

export default function ChallengesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [courseFilter, setCourseFilter] = useState<string>("all");

  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    setSession(s);
    const t = s.accessToken;
    Promise.all([
      apiFetch<Challenge[]>("/challenges", { token: t }),
      apiFetch<Course[]>("/courses", { token: t }),
      s.user.role === "STUDENT"
        ? apiFetch<Submission[]>("/submissions/my", { token: t })
        : Promise.resolve<Submission[]>([]),
    ])
      .then(([ch, co, sub]) => {
        setChallenges(ch);
        setCourses(co);
        setSubmissions(sub);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!challenges) return null;
    return courseFilter === "all"
      ? challenges
      : challenges.filter((c) => c.courseId === courseFilter);
  }, [challenges, courseFilter]);

  if (!session) return null;

  const canCreate = session.user.role === "PROFESSOR" || session.user.role === "ADMIN";
  const subtitle =
    session.user.role === "STUDENT"
      ? "Retos publicados en tus cursos."
      : "Retos que creaste.";

  const solved = new Set(
    submissions.filter((s) => s.status === "ACCEPTED").map((s) => s.challengeId),
  );
  const partial = new Set(
    submissions
      .filter((s) => ["WRONG_ANSWER", "OPTIMIZATION_REQUIRED"].includes(s.status))
      .map((s) => s.challengeId),
  );

  return (
    <div className="px-6 py-8 md:px-10">
      <PageHeader
        title="Retos"
        subtitle={subtitle}
        action={
          canCreate ? (
            <PrimaryButton href="/dashboard/challenges/new" variant="yellow">
              + Crear reto
            </PrimaryButton>
          ) : null
        }
      />

      {courses.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
            Filtrar por curso:
          </span>
          <FilterChip
            label="Todos"
            active={courseFilter === "all"}
            onClick={() => setCourseFilter("all")}
          />
          {courses.map((c) => (
            <FilterChip
              key={c.id}
              label={c.code}
              active={courseFilter === c.id}
              onClick={() => setCourseFilter(c.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-6">
        {error ? (
          <ErrorBox message={error} />
        ) : filtered === null ? (
          <DashboardSkeleton />
        ) : filtered.length === 0 ? (
          <Empty>
            {canCreate
              ? "No hay retos en esta vista. Creá el primero con el botón de arriba."
              : "Aún no hay retos publicados."}
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
            {filtered.map((ch, i) => {
              const state = solved.has(ch.id)
                ? "solved"
                : partial.has(ch.id)
                  ? "partial"
                  : "open";
              return (
                <Link
                  key={ch.id}
                  href={`/dashboard/challenges/${ch.id}`}
                  className={cn(
                    "flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-foreground/[0.05]",
                    i > 0 && "border-t border-border/60",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <DifficultyChip level={ch.difficulty} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{ch.title}</div>
                      <div className="mt-0.5 truncate text-[0.7rem] text-muted-foreground">
                        {courses.find((c) => c.id === ch.courseId)?.code ?? ch.courseId.slice(0, 8)}
                        {ch.tags.length > 0 && ` · ${ch.tags.slice(0, 3).join(" · ")}`}
                      </div>
                    </div>
                  </div>
                  {session.user.role === "STUDENT" ? (
                    <StateMarker state={state} />
                  ) : (
                    <span
                      className={cn(
                        "font-mono text-[0.65rem] uppercase tracking-widest",
                        ch.status === "published"
                          ? "text-status-accepted"
                          : "text-muted-foreground",
                      )}
                    >
                      {ch.status}
                    </span>
                  )}
                </Link>
              );
            })}
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
