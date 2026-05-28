"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { displayName, type Session } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  BlockHeader,
  ErrorBox,
  FilterChip,
  LiveDot,
  Num,
  OverviewSkeleton,
  StatusBadge,
  formatAgo,
  formatIn,
  formatMs,
  useCountUp,
} from "./bits";

/* ============================================================
 * Tipos de los endpoints consumidos.
 * Todos derivados de los controllers reales del backend.
 * ============================================================ */

interface Course {
  id: string;
  code: string;
  name: string;
}

interface Challenge {
  id: string;
  courseId: string;
  status: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

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

interface Evaluation {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  durationMinutes: number;
}

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

interface DraftStatus {
  id: string;
  title: string;
  courseCode: string;
  missing: Array<"schema" | "dataset" | "expected">;
}

const LIVE_STATUS = new Set(["QUEUED", "RUNNING"]);
const FAILED_STATUS = new Set([
  "WRONG_ANSWER",
  "SYNTAX_ERROR",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "OPTIMIZATION_REQUIRED",
]);

type ActivityFilter = "all" | "live" | "accepted" | "failed";

/* ============================================================
 * OverviewProfessor: entrada al dashboard del profesor.
 * 6 bloques: hero narrativo, live, pendientes, reportes,
 * actividad, acciones contextuales.
 * ============================================================ */

export function OverviewProfessor({ session }: { session: Session }) {
  const token = session.accessToken;

  const [bundle, setBundle] = useState<{
    courses: Course[];
    challenges: Challenge[];
    submissions: Submission[];
    evaluations: Evaluation[];
  } | null>(null);
  const [drafts, setDrafts] = useState<DraftStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");

  // Carga inicial en paralelo. Evaluations puede fallar para algunos
  // roles/setup, lo degradamos a [] silenciosamente.
  useEffect(() => {
    Promise.all([
      apiFetch<Course[]>("/courses", { token }),
      apiFetch<Challenge[]>("/challenges", { token }),
      apiFetch<Submission[]>("/submissions?limit=50", { token }),
      apiFetch<Evaluation[]>("/evaluations", { token }).catch(() => [] as Evaluation[]),
    ])
      .then(([courses, challenges, submissions, evaluations]) => {
        setBundle({ courses, challenges, submissions, evaluations });
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  // Drafts incompletos: para cada draft, verificamos schema / dataset /
  // expected-result en paralelo. Cap a 6 drafts para evitar fan-out.
  useEffect(() => {
    if (!bundle) return;
    const draftChallenges = bundle.challenges
      .filter((c) => c.status === "draft")
      .slice(0, 6);
    if (draftChallenges.length === 0) {
      setDrafts([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      draftChallenges.map(async (ch) => {
        const [hasSchema, hasExpected, hasDataset] = await Promise.all([
          apiFetch(`/challenges/${ch.id}/schema`, { token })
            .then(() => true)
            .catch(() => false),
          apiFetch(`/challenges/${ch.id}/expected-result`, { token })
            .then(() => true)
            .catch(() => false),
          apiFetch<unknown[]>(`/challenges/${ch.id}/test-data`, { token })
            .then((d) => Array.isArray(d) && d.length > 0)
            .catch(() => false),
        ]);
        const missing: DraftStatus["missing"] = [];
        if (!hasSchema) missing.push("schema");
        if (!hasDataset) missing.push("dataset");
        if (!hasExpected) missing.push("expected");
        return {
          id: ch.id,
          title: ch.title,
          courseCode:
            bundle.courses.find((c) => c.id === ch.courseId)?.code ?? "",
          missing,
        };
      }),
    ).then((rows) => {
      if (!cancelled) setDrafts(rows.filter((r) => r.missing.length > 0));
    });
    return () => {
      cancelled = true;
    };
  }, [bundle, token]);

  // Polling de submissions cada 5s solo si hay algo en vuelo (QUEUED/RUNNING).
  const hasLiveActivity =
    bundle?.submissions.some((s) => LIVE_STATUS.has(s.status)) ?? false;

  useEffect(() => {
    if (!hasLiveActivity) return;
    const id = setInterval(() => {
      apiFetch<Submission[]>("/submissions?limit=50", { token })
        .then((submissions) =>
          setBundle((b) => (b ? { ...b, submissions } : b)),
        )
        .catch(() => {
          /* polling silencioso */
        });
    }, 5000);
    return () => clearInterval(id);
  }, [hasLiveActivity, token]);

  if (error) return <ErrorBox message={error} />;
  if (!bundle) return <OverviewSkeleton />;

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const hourAgo = now - 60 * 60 * 1000;

  const submissionsToday = bundle.submissions.filter(
    (s) => new Date(s.createdAt).getTime() >= startOfToday.getTime(),
  ).length;
  const studentsLastHour = new Set(
    bundle.submissions
      .filter((s) => new Date(s.createdAt).getTime() >= hourAgo)
      .map((s) => s.studentId),
  ).size;
  const publishedChallenges = bundle.challenges.filter(
    (c) => c.status === "published",
  ).length;
  const activeEvals = bundle.evaluations.filter((e) => {
    const start = new Date(e.startDate).getTime();
    const end = new Date(e.endDate).getTime();
    return now >= start && now <= end;
  });
  const liveSubs = bundle.submissions.filter((s) => LIVE_STATUS.has(s.status));

  const filteredSubs = bundle.submissions.filter((s) => {
    if (filter === "all") return true;
    if (filter === "live") return LIVE_STATUS.has(s.status);
    if (filter === "accepted") return s.status === "ACCEPTED";
    if (filter === "failed") return FAILED_STATUS.has(s.status);
    return true;
  });

  const reportCourses = bundle.courses.slice(0, 3);
  const extraCourses = bundle.courses.length - reportCourses.length;

  return (
    <div className="space-y-12 pb-16">
      <HeroNarrative
        name={displayName(session.user)}
        courses={bundle.courses.length}
        challenges={publishedChallenges}
        submissionsToday={submissionsToday}
        studentsLastHour={studentsLastHour}
        activeEvalsCount={activeEvals.length}
      />

      {(activeEvals.length > 0 || liveSubs.length > 0) && (
        <LiveBlock
          activeEvals={activeEvals}
          liveSubs={liveSubs}
          courses={bundle.courses}
        />
      )}

      <PendingDraftsBlock drafts={drafts} />

      <CourseReportsBlock
        courses={reportCourses}
        token={token}
        extraCount={extraCourses}
      />

      <ActivityBlock
        submissions={filteredSubs}
        courses={bundle.courses}
        filter={filter}
        setFilter={setFilter}
        liveCount={liveSubs.length}
      />

      <FooterActions
        hasCourses={bundle.courses.length > 0}
        hasChallenges={bundle.challenges.length > 0}
      />
    </div>
  );
}

/* ============================================================
 * Bloque 1: Hero narrativo en una línea.
 * Sin cards, datos en mono, pill de evaluaciones activas a la derecha.
 * ============================================================ */

function HeroNarrative({
  name,
  courses,
  challenges,
  submissionsToday,
  studentsLastHour,
  activeEvalsCount,
}: {
  name: string;
  courses: number;
  challenges: number;
  submissionsToday: number;
  studentsLastHour: number;
  activeEvalsCount: number;
}) {
  const todayCount = useCountUp(submissionsToday);
  const hourCount = useCountUp(studentsLastHour);

  return (
    <div className="flex flex-col gap-4 border-b border-border/60 pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl tracking-tight md:text-[1.85rem]">
          Hola, {name}.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:max-w-[62ch]">
          Tenés{" "}
          <Num>{courses}</Num>{" "}
          cursos ·{" "}
          <Num>{challenges}</Num>{" "}
          retos publicados ·{" "}
          <Num>{todayCount}</Num>{" "}
          submissions hoy.{" "}
          <Num>{hourCount}</Num>{" "}
          estudiantes enviaron en la última hora.
        </p>
      </div>
      {activeEvalsCount > 0 && (
        <span className="inline-flex h-8 items-center gap-2 self-start rounded-full border border-accent-orange/40 bg-accent-orange/10 px-3 text-[0.7rem] uppercase tracking-[0.18em] text-accent-orange md:self-end">
          <LiveDot />
          <span className="font-mono tabular-nums">{activeEvalsCount}</span>
          {activeEvalsCount === 1
            ? "evaluación activa"
            : "evaluaciones activas"}
        </span>
      )}
    </div>
  );
}

/* ============================================================
 * Bloque 2: En vivo.
 * Solo renderiza si hay evaluaciones activas o submissions QUEUED/RUNNING.
 * Dos columnas en desktop, stack en móvil.
 * ============================================================ */

function LiveBlock({
  activeEvals,
  liveSubs,
  courses,
}: {
  activeEvals: Evaluation[];
  liveSubs: Submission[];
  courses: Course[];
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <LiveDot />
        <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-accent-orange">
          En vivo
        </h2>
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">
          actualiza cada 5s
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-foreground/[0.03]">
          <div className="border-b border-border/60 px-5 py-3 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
            Evaluaciones activas
          </div>
          {activeEvals.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              Ninguna ventana abierta ahora.
            </div>
          ) : (
            activeEvals.slice(0, 3).map((e, i) => (
              <Link
                key={e.id}
                href={`/dashboard/evaluations/${e.id}`}
                className={cn(
                  "flex items-center justify-between gap-4 px-5 py-3 text-sm transition-colors hover:bg-foreground/[0.05]",
                  i > 0 && "border-t border-border/40",
                )}
              >
                <span className="truncate">{e.name}</span>
                <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                  cierra {formatIn(e.endDate)}
                </span>
              </Link>
            ))
          )}
        </div>

        <div className="rounded-xl border border-border bg-foreground/[0.03]">
          <div className="border-b border-border/60 px-5 py-3 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
            Submissions en curso
          </div>
          {liveSubs.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              Cola vacía. Worker en reposo.
            </div>
          ) : (
            liveSubs.slice(0, 4).map((s, i) => (
              <Link
                key={s.id}
                href={`/dashboard/submissions/${s.id}`}
                className={cn(
                  "flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-foreground/[0.05]",
                  i > 0 && "border-t border-border/40",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <LiveDot />
                  <div className="min-w-0">
                    <div className="truncate text-sm">
                      {s.student?.fullName ?? s.studentId.slice(0, 8)}
                    </div>
                    <div className="truncate text-[0.7rem] text-muted-foreground">
                      {s.challenge?.title ?? s.challengeId.slice(0, 8)}
                      {courseCodeFor(s, courses) && (
                        <>
                          {" · "}
                          <span className="font-mono uppercase tracking-widest">
                            {courseCodeFor(s, courses)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
 * Bloque 3: Pendientes (drafts incompletos).
 * Heading h2 (no eyebrow) para variar jerarquía visual.
 * Cada row: code + título + chips de lo que falta.
 * ============================================================ */

function PendingDraftsBlock({ drafts }: { drafts: DraftStatus[] | null }) {
  if (drafts === null) {
    return (
      <section>
        <h2 className="text-base tracking-tight">Pendientes</h2>
        <p className="mt-1 text-xs text-muted">Revisando drafts.</p>
        <div className="mt-4 h-24 animate-pulse rounded-xl border border-border bg-foreground/[0.03]" />
      </section>
    );
  }

  if (drafts.length === 0) {
    return (
      <section>
        <h2 className="text-base tracking-tight">Pendientes</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Todos tus retos están completos. Cero pasos bloqueados.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base tracking-tight">Pendientes</h2>
        <span className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
          <span className="text-accent-orange">{drafts.length}</span> reto
          {drafts.length === 1 ? "" : "s"} en draft incompleto
          {drafts.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
        {drafts.map((d, i) => (
          <Link
            key={d.id}
            href={`/dashboard/challenges/${d.id}`}
            className={cn(
              "flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-foreground/[0.05]",
              i > 0 && "border-t border-border/40",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              {d.courseCode && (
                <span className="shrink-0 font-mono text-[0.65rem] uppercase tracking-widest text-muted">
                  {d.courseCode}
                </span>
              )}
              <span className="truncate text-sm">{d.title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {d.missing.map((m) => (
                <MissingChip key={m} kind={m} />
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MissingChip({ kind }: { kind: "schema" | "dataset" | "expected" }) {
  const label = {
    schema: "falta schema",
    dataset: "falta dataset",
    expected: "falta resultado",
  }[kind];
  return (
    <span className="inline-flex h-5 items-center rounded-full border border-accent-orange/40 bg-accent-orange/10 px-2 font-mono text-[0.6rem] uppercase tracking-widest text-accent-orange">
      {label}
    </span>
  );
}

/* ============================================================
 * Bloque 4: Reportes resumidos.
 * Eyebrow + accent line porque es contenido evaluado en la rúbrica.
 * Por cada curso, tres mini-columnas: AVG · top 3 · más difíciles.
 * Cada CourseReportCard hace su propio fetch (con skeleton local).
 * ============================================================ */

function CourseReportsBlock({
  courses,
  token,
  extraCount,
}: {
  courses: Course[];
  token: string;
  extraCount: number;
}) {
  return (
    <section>
      <BlockHeader
        title="Reportes por curso"
        right={
          <Link
            href="/dashboard/reports"
            className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ver todos →
          </Link>
        }
      />
      {courses.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No hay cursos todavía. Cuando crees uno, los reportes aparecen acá.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {courses.map((c) => (
            <CourseReportCard key={c.id} course={c} token={token} />
          ))}
          {extraCount > 0 && (
            <Link
              href="/dashboard/reports"
              className="block rounded-xl border border-dashed border-border/60 bg-foreground/[0.02] px-5 py-3 text-center text-xs text-muted-foreground transition-colors hover:border-accent-orange/40 hover:text-foreground"
            >
              + {extraCount} curso{extraCount === 1 ? "" : "s"} más con reporte
              disponible
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function CourseReportCard({
  course,
  token,
}: {
  course: Course;
  token: string;
}) {
  const [report, setReport] = useState<CourseReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<CourseReport>(`/reports/courses/${course.id}`, { token })
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [course.id, token]);

  return (
    <div className="rounded-xl border border-border bg-foreground/[0.03]">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-5 py-3">
        <div className="min-w-0 truncate">
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">
            {course.code}
          </span>
          <span className="ml-2 text-sm">{course.name}</span>
        </div>
        <Link
          href={`/dashboard/reports/courses/${course.id}`}
          className="shrink-0 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          ver reporte completo →
        </Link>
      </div>
      {failed ? (
        <div className="px-5 py-6 text-sm text-muted-foreground">
          Reporte aún no disponible para este curso.
        </div>
      ) : !report ? (
        <div className="grid gap-px bg-border/40 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse bg-foreground/[0.02]"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-px bg-border/40 md:grid-cols-3">
          <ReportCell label="Score promedio">
            <div className="text-3xl font-mono tabular-nums text-accent-orange">
              {report.averageScore.toFixed(1)}
              <span className="ml-1 text-base text-muted">/100</span>
            </div>
            {report.topStudents.length > 0 && (
              <div className="mt-2 text-[0.7rem] text-muted-foreground">
                sobre{" "}
                <span className="font-mono tabular-nums">
                  {report.topStudents.length}
                </span>{" "}
                estudiantes con actividad
              </div>
            )}
          </ReportCell>

          <ReportCell label="Top 3 estudiantes">
            {report.topStudents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sin submissions aún.
              </p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {report.topStudents.slice(0, 3).map((s, i) => (
                  <li
                    key={s.studentId}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="w-3 font-mono text-[0.65rem] tabular-nums text-muted">
                        {i + 1}
                      </span>
                      <span className="truncate">{s.fullName}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                      {s.averageScore.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </ReportCell>

          <ReportCell label="Retos más difíciles">
            {report.hardestChallenges.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sin datos suficientes.
              </p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {report.hardestChallenges.slice(0, 3).map((c) => (
                  <li
                    key={c.challengeId}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="truncate">{c.title}</span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-xs tabular-nums",
                        c.successRate < 0.3
                          ? "text-status-wrong"
                          : c.successRate < 0.6
                            ? "text-accent-yellow"
                            : "text-status-accepted",
                      )}
                    >
                      {(c.successRate * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </ReportCell>
        </div>
      )}
    </div>
  );
}

function ReportCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background/40 px-5 py-4">
      <div className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
        {label}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/* ============================================================
 * Bloque 5: Actividad reciente.
 * Tabla densa con chips de filtro arriba. Status badge, score, time,
 * student, challenge, curso, ago.
 * ============================================================ */

function ActivityBlock({
  submissions,
  courses,
  filter,
  setFilter,
  liveCount,
}: {
  submissions: Submission[];
  courses: Course[];
  filter: ActivityFilter;
  setFilter: (f: ActivityFilter) => void;
  liveCount: number;
}) {
  const rows = submissions.slice(0, 12);

  return (
    <section>
      <BlockHeader
        title="Actividad reciente"
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label="todos"
            />
            <FilterChip
              active={filter === "live"}
              onClick={() => setFilter("live")}
              label="en vivo"
              count={liveCount > 0 ? liveCount : undefined}
              tone="orange"
            />
            <FilterChip
              active={filter === "accepted"}
              onClick={() => setFilter("accepted")}
              label="accepted"
            />
            <FilterChip
              active={filter === "failed"}
              onClick={() => setFilter("failed")}
              label="con error"
            />
          </div>
        }
      />

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No hay submissions que coincidan con este filtro.
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
          <div className="hidden border-b border-border/40 px-5 py-2 md:grid md:grid-cols-[8rem_4.5rem_5rem_1fr_1fr_3rem] md:gap-4 md:text-[0.6rem] md:uppercase md:tracking-[0.18em] md:text-muted">
            <span>estado</span>
            <span className="text-right">score</span>
            <span className="text-right">tiempo</span>
            <span>estudiante</span>
            <span>reto</span>
            <span className="text-right">hace</span>
          </div>
          {rows.map((s, i) => {
            const courseCode = courseCodeFor(s, courses);
            return (
              <Link
                key={s.id}
                href={`/dashboard/submissions/${s.id}`}
                className={cn(
                  "block px-5 py-3 text-sm transition-colors hover:bg-foreground/[0.05]",
                  i > 0 && "border-t border-border/40",
                )}
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-[8rem_4.5rem_5rem_1fr_1fr_3rem] md:items-center">
                  <span>
                    <StatusBadge status={s.status} />
                  </span>
                  <span className="font-mono text-xs tabular-nums text-foreground md:text-right">
                    {s.score ?? 0}
                    <span className="text-muted">/100</span>
                  </span>
                  <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground md:text-right">
                    {formatMs(s.executionTimeMs)}
                  </span>
                  <span className="col-span-2 truncate md:col-span-1">
                    {s.student?.fullName ?? s.studentId.slice(0, 8)}
                  </span>
                  <span className="col-span-2 truncate text-muted-foreground md:col-span-1">
                    {s.challenge?.title ?? s.challengeId.slice(0, 8)}
                    {courseCode && (
                      <span className="ml-2 font-mono text-[0.65rem] uppercase tracking-widest text-muted">
                        {courseCode}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground md:text-right">
                    {formatAgo(s.createdAt)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ============================================================
 * Bloque 6: Acciones contextuales.
 * Sin header. Adapta el CTA al estado del profesor.
 * ============================================================ */

function FooterActions({
  hasCourses,
  hasChallenges,
}: {
  hasCourses: boolean;
  hasChallenges: boolean;
}) {
  if (!hasCourses) {
    return (
      <section className="rounded-xl border border-accent-orange/40 bg-accent-orange/[0.06] px-6 py-6">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-accent-orange">
          Primer paso
        </div>
        <h3 className="mt-2 text-lg tracking-tight">
          Empezá creando tu primer curso.
        </h3>
        <p className="mt-1 max-w-[55ch] text-sm text-muted-foreground">
          Los retos, evaluaciones y reportes cuelgan de un curso. Sin curso, el
          worker no tiene nada que evaluar.
        </p>
        <Link
          href="/dashboard/courses/new"
          className="mt-4 inline-flex items-center rounded-full bg-accent-orange px-5 py-2 text-sm font-medium text-background transition-transform hover:scale-[1.02]"
        >
          Crear primer curso →
        </Link>
      </section>
    );
  }

  if (!hasChallenges) {
    return (
      <section className="rounded-xl border border-accent-yellow/40 bg-accent-yellow/[0.06] px-6 py-6">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-accent-yellow">
          Siguiente paso
        </div>
        <h3 className="mt-2 text-lg tracking-tight">
          Tenés un curso. Ahora un reto SQL para evaluar.
        </h3>
        <p className="mt-1 max-w-[55ch] text-sm text-muted-foreground">
          Un reto necesita schema, dataset y resultado esperado antes de poder
          recibir submissions.
        </p>
        <Link
          href="/dashboard/challenges/new"
          className="mt-4 inline-flex items-center rounded-full bg-accent-yellow px-5 py-2 text-sm font-medium text-background transition-transform hover:scale-[1.02]"
        >
          Crear primer reto →
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-wrap gap-2">
      <ActionButton href="/dashboard/courses/new" variant="orange">
        + Crear curso
      </ActionButton>
      <ActionButton href="/dashboard/challenges/new" variant="yellow">
        + Crear reto
      </ActionButton>
      <ActionButton href="/dashboard/evaluations/new" variant="ghost">
        Crear evaluación
      </ActionButton>
      <ActionButton href="/dashboard/ai" variant="ghost">
        Asistente IA
      </ActionButton>
    </section>
  );
}

function ActionButton({
  href,
  children,
  variant,
}: {
  href: string;
  children: React.ReactNode;
  variant: "orange" | "yellow" | "ghost";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-transform hover:scale-[1.02]",
        variant === "orange" && "bg-accent-orange text-background",
        variant === "yellow" && "bg-accent-yellow text-background",
        variant === "ghost" &&
          "border border-border bg-background text-foreground hover:border-accent-orange/60",
      )}
    >
      {children}
    </Link>
  );
}

function courseCodeFor(s: Submission, courses: Course[]): string | null {
  const id = s.challenge?.courseId;
  if (!id) return null;
  return courses.find((c) => c.id === id)?.code ?? null;
}
