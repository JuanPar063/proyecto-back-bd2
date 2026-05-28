"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import {
  DashboardSkeleton,
  DifficultyChip,
  Empty,
  ErrorBox,
  PageHeader,
  PrimaryButton,
  Section,
} from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface Course {
  id: string;
  code: string;
  name: string;
  period: string;
  groupName?: string;
  professor?: { id: string; fullName: string; email: string };
}

interface Challenge {
  id: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  status: string;
  courseId: string;
}

interface EnrollmentItem {
  id: string;
  enrolledAt: string;
  student: { id: string; fullName: string; email: string; role: string };
}

interface LeaderboardEntry {
  studentId: string;
  fullName: string;
  totalScore: number;
  solvedChallenges: number;
}

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const courseId = params?.id;
  const [session, setSession] = useState<Session | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [lb, setLb] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Inscribir estudiante (solo PROFESSOR/ADMIN)
  const [studentEmail, setStudentEmail] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s || !courseId) return;
    setSession(s);
    const t = s.accessToken;

    apiFetch<Course>(`/courses/${courseId}`, { token: t })
      .then(setCourse)
      .catch((e: Error) => setError(e.message));

    apiFetch<Challenge[]>(`/challenges?courseId=${courseId}`, { token: t })
      .then(setChallenges)
      .catch(() => {});

    apiFetch<EnrollmentItem[]>(`/courses/${courseId}/students`, { token: t })
      .then(setEnrollments)
      .catch(() => {});

    apiFetch<{ entries: LeaderboardEntry[] }>(
      `/reports/leaderboard?courseId=${courseId}`,
      { token: t },
    )
      .then((r) => setLb(r.entries))
      .catch(() => {});
  }, [courseId]);

  if (!session || !courseId) return null;
  if (error)
    return (
      <div className="px-6 py-8 md:px-10">
        <ErrorBox message={error} />
      </div>
    );
  if (!course)
    return (
      <div className="px-6 py-8 md:px-10">
        <DashboardSkeleton />
      </div>
    );

  const isProfessor = session.user.role === "PROFESSOR" || session.user.role === "ADMIN";

  const onEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnrollError(null);
    setEnrolling(true);
    try {
      const enr = await apiFetch<EnrollmentItem>(
        `/courses/${courseId}/enrollments`,
        {
          method: "POST",
          token: session.accessToken,
          body: JSON.stringify({ studentEmail }),
        },
      );
      setEnrollments((prev) => [enr, ...prev]);
      setStudentEmail("");
    } catch (e) {
      setEnrollError(e instanceof Error ? e.message : "Error");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="px-6 py-8 md:px-10">
      <Link
        href="/dashboard/courses"
        className="mb-4 inline-flex text-xs text-muted-foreground hover:text-foreground"
      >
        ← Cursos
      </Link>

      <PageHeader
        title={course.name}
        subtitle={
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
            {course.code} · período {course.period}
            {course.groupName ? ` · grupo ${course.groupName}` : ""}
          </span>
        }
      />

      {/* Métricas resumen */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric value={challenges.length} label="Retos" />
        <Metric value={enrollments.length} label="Estudiantes" />
        <Metric
          value={challenges.filter((c) => c.status === "published").length}
          label="Publicados"
          accent="orange"
        />
        <Metric value={lb.length} label="En leaderboard" accent="yellow" />
      </section>

      {/* Retos del curso */}
      <Section
        title="Retos del curso"
        className="mt-10"
        action={
          isProfessor ? (
            <PrimaryButton href="/dashboard/challenges/new" variant="yellow">
              + Crear reto
            </PrimaryButton>
          ) : null
        }
      >
        {challenges.length === 0 ? (
          <Empty>Aún no hay retos en este curso.</Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
            {challenges.map((ch, i) => (
              <Link
                key={ch.id}
                href={`/dashboard/challenges/${ch.id}`}
                className={cn(
                  "flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-foreground/[0.05]",
                  i > 0 && "border-t border-border/60",
                )}
              >
                <div className="flex items-center gap-3">
                  <DifficultyChip level={ch.difficulty} />
                  <span className="text-sm">{ch.title}</span>
                </div>
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
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Inscribir + lista de estudiantes (PROFESSOR) */}
      {isProfessor && (
        <Section title={`Estudiantes inscritos (${enrollments.length})`} className="mt-10">
          <form
            onSubmit={onEnroll}
            className="mb-4 flex flex-wrap items-center gap-2"
          >
            <input
              type="email"
              required
              placeholder="estudiante@univ.edu"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              disabled={enrolling}
              className="flex-1 min-w-64 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2 text-sm outline-none focus:border-accent-orange/60 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={enrolling}
              className={cn(
                "rounded-full bg-accent-orange px-4 py-2 text-sm font-medium text-background transition-transform",
                enrolling ? "opacity-60" : "hover:scale-[1.02]",
              )}
            >
              {enrolling ? "Inscribiendo..." : "Inscribir"}
            </button>
          </form>
          {enrollError && <ErrorBox message={enrollError} />}

          {enrollments.length === 0 ? (
            <Empty>Aún no inscribiste estudiantes.</Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
              {enrollments.map((e, i) => (
                <div
                  key={e.id}
                  className={cn(
                    "flex items-center justify-between px-5 py-3 text-sm",
                    i > 0 && "border-t border-border/60",
                  )}
                >
                  <span>{e.student.fullName || e.student.email}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.student.email}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Leaderboard inline */}
      <Section
        title="Leaderboard del curso"
        className="mb-12 mt-10"
        action={
          <Link
            href={`/dashboard/reports/leaderboard?courseId=${course.id}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Ver completo →
          </Link>
        }
      >
        {lb.length === 0 ? (
          <Empty>Aún no hay submissions registradas.</Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
            {lb.slice(0, 10).map((entry, i) => (
              <div
                key={entry.studentId}
                className={cn(
                  "flex items-center justify-between px-5 py-3 text-sm",
                  i > 0 && "border-t border-border/60",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background font-mono text-[0.65rem] text-muted-foreground">
                    {i + 1}
                  </span>
                  <span>{entry.fullName || `student ${entry.studentId.slice(0, 8)}`}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
                  <span className="tabular-nums text-foreground/90">
                    {entry.totalScore}
                  </span>
                  <span>·</span>
                  <span>{entry.solvedChallenges} reto(s)</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Metric({
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
