"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { displayName, type Session } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  BlockHeader,
  DifficultyChip,
  ErrorBox,
  FilterChip,
  LiveDot,
  Num,
  OverviewSkeleton,
  StateMarker,
  StatusBadge,
  formatAgo,
  formatIn,
  formatMs,
  useCountUp,
} from "./bits";

/* ============================================================
 * Tipos de los endpoints accesibles al estudiante.
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
  tags: string[];
}

interface Submission {
  id: string;
  status: string;
  score: number | null;
  executionTimeMs: number | null;
  createdAt: string;
  challengeId: string;
  challenge?: { id: string; title: string };
}

interface AttemptInfo {
  id: string;
  attemptNumber: number;
  startedAt: string;
  endsAt: string;
  submittedAt: string | null;
}

interface EvaluationItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  durationMinutes: number;
  attempts?: AttemptInfo[];
}

const LIVE_STATUS = new Set(["QUEUED", "RUNNING"]);
const FAILED_STATUS = new Set([
  "WRONG_ANSWER",
  "SYNTAX_ERROR",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "OPTIMIZATION_REQUIRED",
]);
const DIFFICULTY_ORDER: Record<"EASY" | "MEDIUM" | "HARD", number> = {
  EASY: 0,
  MEDIUM: 1,
  HARD: 2,
};

type ActivityFilter = "all" | "live" | "accepted" | "failed";

/* ============================================================
 * OverviewStudent: entrada al dashboard del estudiante.
 * 6 bloques: hero, intento activo, por resolver, mi progreso,
 * actividad reciente, atajos.
 * ============================================================ */

export function OverviewStudent({ session }: { session: Session }) {
  const token = session.accessToken;

  const [bundle, setBundle] = useState<{
    courses: Course[];
    challenges: Challenge[];
    submissions: Submission[];
    evaluations: EvaluationItem[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");

  useEffect(() => {
    Promise.all([
      apiFetch<Course[]>("/courses", { token }),
      apiFetch<Challenge[]>("/challenges", { token }),
      apiFetch<Submission[]>("/submissions/my", { token }),
      apiFetch<EvaluationItem[]>("/evaluations", { token }).catch(
        () => [] as EvaluationItem[],
      ),
    ])
      .then(([courses, challenges, submissions, evaluations]) => {
        setBundle({ courses, challenges, submissions, evaluations });
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  // Polling cada 5s solo si hay submission propia en vuelo.
  const hasLiveActivity =
    bundle?.submissions.some((s) => LIVE_STATUS.has(s.status)) ?? false;

  useEffect(() => {
    if (!hasLiveActivity) return;
    const id = setInterval(() => {
      apiFetch<Submission[]>("/submissions/my", { token })
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

  const solved = new Set(
    bundle.submissions
      .filter((s) => s.status === "ACCEPTED")
      .map((s) => s.challengeId),
  );
  const partial = new Set(
    bundle.submissions
      .filter((s) => FAILED_STATUS.has(s.status))
      .map((s) => s.challengeId),
  );
  const liveSubs = bundle.submissions.filter((s) => LIVE_STATUS.has(s.status));
  const submissionsToday = bundle.submissions.filter(
    (s) => new Date(s.createdAt).getTime() >= startOfToday.getTime(),
  ).length;

  const availableChallenges = bundle.challenges.filter(
    (c) => c.status === "published",
  );

  const activeEval = bundle.evaluations.find((e) => {
    const start = new Date(e.startDate).getTime();
    const end = new Date(e.endDate).getTime();
    if (now < start || now > end) return false;
    return (e.attempts ?? []).some(
      (a) => !a.submittedAt && new Date(a.endsAt).getTime() > now,
    );
  });
  const activeAttempt = activeEval
    ? (activeEval.attempts ?? []).find(
        (a) => !a.submittedAt && new Date(a.endsAt).getTime() > now,
      )
    : null;

  const unsolved = availableChallenges
    .filter((c) => !solved.has(c.id))
    .sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty])
    .slice(0, 6);

  const filteredSubs = bundle.submissions.filter((s) => {
    if (filter === "all") return true;
    if (filter === "live") return LIVE_STATUS.has(s.status);
    if (filter === "accepted") return s.status === "ACCEPTED";
    if (filter === "failed") return FAILED_STATUS.has(s.status);
    return true;
  });

  return (
    <div className="space-y-12 pb-16">
      <HeroNarrative
        name={displayName(session.user)}
        courses={bundle.courses.length}
        available={availableChallenges.length}
        solvedCount={solved.size}
        submissionsToday={submissionsToday}
        hasActiveAttempt={!!activeAttempt}
      />

      {activeEval && activeAttempt && (
        <ActiveAttemptBlock
          evaluation={activeEval}
          attempt={activeAttempt}
        />
      )}

      {liveSubs.length > 0 && (
        <LiveSubmissionsBlock submissions={liveSubs} />
      )}

      <UnsolvedBlock
        unsolved={unsolved}
        courses={bundle.courses}
        partial={partial}
        totalAvailable={availableChallenges.length}
        totalSolved={solved.size}
      />

      <CourseProgressBlock
        courses={bundle.courses}
        challenges={availableChallenges}
        submissions={bundle.submissions}
      />

      <ActivityBlock
        submissions={filteredSubs}
        challenges={bundle.challenges}
        courses={bundle.courses}
        filter={filter}
        setFilter={setFilter}
        liveCount={liveSubs.length}
      />

      <FooterShortcuts />
    </div>
  );
}

/* ============================================================
 * Bloque 1: Hero narrativo.
 * ============================================================ */

function HeroNarrative({
  name,
  courses,
  available,
  solvedCount,
  submissionsToday,
  hasActiveAttempt,
}: {
  name: string;
  courses: number;
  available: number;
  solvedCount: number;
  submissionsToday: number;
  hasActiveAttempt: boolean;
}) {
  const solvedAnim = useCountUp(solvedCount);
  const todayAnim = useCountUp(submissionsToday);

  return (
    <div className="flex flex-col gap-4 border-b border-border/60 pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl tracking-tight md:text-[1.85rem]">
          Hola, {name}.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:max-w-[62ch]">
          Estás inscrito en{" "}
          <Num>{courses}</Num>{" "}
          cursos ·{" "}
          <Num>{available}</Num>{" "}
          retos disponibles ·{" "}
          <Num>{solvedAnim}</Num>{" "}
          resueltos.{" "}
          <Num>{todayAnim}</Num>{" "}
          envíos hoy.
        </p>
      </div>
      {hasActiveAttempt && (
        <span className="inline-flex h-8 items-center gap-2 self-start rounded-full border border-accent-orange/40 bg-accent-orange/10 px-3 text-[0.7rem] uppercase tracking-[0.18em] text-accent-orange md:self-end">
          <LiveDot />
          intento activo
        </span>
      )}
    </div>
  );
}

/* ============================================================
 * Bloque 2a: Intento activo de evaluación.
 * Solo renderiza si hay un attempt abierto.
 * ============================================================ */

function ActiveAttemptBlock({
  evaluation,
  attempt,
}: {
  evaluation: EvaluationItem;
  attempt: AttemptInfo;
}) {
  return (
    <Link
      href={`/dashboard/evaluations/${evaluation.id}`}
      className="block rounded-xl border border-accent-orange/50 bg-accent-orange/[0.08] px-6 py-5 transition-colors hover:bg-accent-orange/[0.12]"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-accent-orange">
            <LiveDot />
            intento abierto
          </div>
          <h3 className="mt-2 text-lg tracking-tight">{evaluation.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            intento{" "}
            <span className="font-mono tabular-nums text-foreground">
              #{attempt.attemptNumber}
            </span>
            {" · "}
            cierra{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatIn(attempt.endsAt)}
            </span>
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-accent-orange px-5 py-2 text-sm font-medium text-background">
          Continuar →
        </span>
      </div>
    </Link>
  );
}

/* ============================================================
 * Bloque 2b: Submissions propias en vuelo.
 * ============================================================ */

function LiveSubmissionsBlock({ submissions }: { submissions: Submission[] }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <LiveDot />
        <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-accent-orange">
          Tus envíos en curso
        </h2>
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">
          actualiza cada 5s
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
        {submissions.slice(0, 4).map((s, i) => (
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
              <span className="truncate">
                {s.challenge?.title ?? s.challengeId.slice(0, 8)}
              </span>
            </div>
            <StatusBadge status={s.status} />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
 * Bloque 3: Por resolver.
 * Retos publicados que aún no aceptaste, ordenados por dificultad.
 * ============================================================ */

function UnsolvedBlock({
  unsolved,
  courses,
  partial,
  totalAvailable,
  totalSolved,
}: {
  unsolved: Challenge[];
  courses: Course[];
  partial: Set<string>;
  totalAvailable: number;
  totalSolved: number;
}) {
  if (unsolved.length === 0 && totalAvailable === 0) {
    return (
      <section>
        <h2 className="text-base tracking-tight">Por resolver</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tus cursos todavía no tienen retos publicados.
        </p>
      </section>
    );
  }

  if (unsolved.length === 0) {
    return (
      <section>
        <h2 className="text-base tracking-tight">Por resolver</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Resolviste{" "}
          <span className="font-mono tabular-nums text-status-accepted">
            {totalSolved}
          </span>{" "}
          de{" "}
          <span className="font-mono tabular-nums text-foreground">
            {totalAvailable}
          </span>
          . No hay nada nuevo esperándote.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base tracking-tight">Por resolver</h2>
        <span className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
          <span className="text-accent-orange">{unsolved.length}</span> reto
          {unsolved.length === 1 ? "" : "s"} sin resolver
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
        {unsolved.map((ch, i) => {
          const code = courses.find((c) => c.id === ch.courseId)?.code;
          const state = partial.has(ch.id) ? "partial" : "open";
          return (
            <Link
              key={ch.id}
              href={`/dashboard/challenges/${ch.id}`}
              className={cn(
                "flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-foreground/[0.05]",
                i > 0 && "border-t border-border/40",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <DifficultyChip level={ch.difficulty} />
                <div className="min-w-0">
                  <div className="truncate text-sm">{ch.title}</div>
                  {code && (
                    <div className="mt-0.5 truncate font-mono text-[0.65rem] uppercase tracking-widest text-muted">
                      {code}
                    </div>
                  )}
                </div>
              </div>
              <StateMarker state={state} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================
 * Bloque 4: Mi progreso por curso.
 * Tres mini-stats por curso: solved/total, score promedio,
 * accepted rate.
 * ============================================================ */

function CourseProgressBlock({
  courses,
  challenges,
  submissions,
}: {
  courses: Course[];
  challenges: Challenge[];
  submissions: Submission[];
}) {
  if (courses.length === 0) return null;

  return (
    <section>
      <BlockHeader
        title="Mi progreso por curso"
        right={
          <Link
            href="/dashboard/courses"
            className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ver cursos →
          </Link>
        }
      />
      <div className="mt-4 space-y-3">
        {courses.slice(0, 4).map((c) => {
          const courseChallenges = challenges.filter(
            (ch) => ch.courseId === c.id,
          );
          const challengeIds = new Set(courseChallenges.map((ch) => ch.id));
          const courseSubs = submissions.filter((s) =>
            challengeIds.has(s.challengeId),
          );
          const solvedInCourse = new Set(
            courseSubs
              .filter((s) => s.status === "ACCEPTED")
              .map((s) => s.challengeId),
          );
          const scoredSubs = courseSubs.filter((s) => typeof s.score === "number");
          const avgScore =
            scoredSubs.length > 0
              ? scoredSubs.reduce((acc, s) => acc + (s.score ?? 0), 0) /
                scoredSubs.length
              : null;
          const acceptedRate =
            courseSubs.length > 0
              ? (courseSubs.filter((s) => s.status === "ACCEPTED").length /
                  courseSubs.length) *
                100
              : null;
          const completion =
            courseChallenges.length > 0
              ? (solvedInCourse.size / courseChallenges.length) * 100
              : 0;

          return (
            <div
              key={c.id}
              className="rounded-xl border border-border bg-foreground/[0.03]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border/40 px-5 py-3">
                <div className="min-w-0 truncate">
                  <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">
                    {c.code}
                  </span>
                  <span className="ml-2 text-sm">{c.name}</span>
                </div>
                <Link
                  href={`/dashboard/courses/${c.id}`}
                  className="shrink-0 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  ver curso →
                </Link>
              </div>
              <div className="grid gap-px bg-border/40 md:grid-cols-3">
                <ProgressCell label="Avance">
                  <div className="text-3xl font-mono tabular-nums text-foreground">
                    {solvedInCourse.size}
                    <span className="text-muted">
                      /{courseChallenges.length}
                    </span>
                  </div>
                  <ProgressBar percent={completion} />
                </ProgressCell>

                <ProgressCell label="Score promedio">
                  {avgScore === null ? (
                    <p className="text-xs text-muted-foreground">
                      Sin envíos calificados aún.
                    </p>
                  ) : (
                    <div className="text-3xl font-mono tabular-nums text-accent-orange">
                      {avgScore.toFixed(1)}
                      <span className="ml-1 text-base text-muted">/100</span>
                    </div>
                  )}
                </ProgressCell>

                <ProgressCell label="Tasa accepted">
                  {acceptedRate === null ? (
                    <p className="text-xs text-muted-foreground">
                      Aún no enviaste nada.
                    </p>
                  ) : (
                    <div
                      className={cn(
                        "text-3xl font-mono tabular-nums",
                        acceptedRate >= 70
                          ? "text-status-accepted"
                          : acceptedRate >= 40
                            ? "text-accent-yellow"
                            : "text-status-wrong",
                      )}
                    >
                      {Math.round(acceptedRate)}
                      <span className="ml-1 text-base text-muted">%</span>
                    </div>
                  )}
                  {courseSubs.length > 0 && (
                    <div className="mt-2 font-mono text-[0.65rem] uppercase tracking-widest text-muted">
                      sobre {courseSubs.length} envío
                      {courseSubs.length === 1 ? "" : "s"}
                    </div>
                  )}
                </ProgressCell>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProgressCell({
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

function ProgressBar({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
      <div
        className="h-full rounded-full bg-accent-orange/70"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

/* ============================================================
 * Bloque 5: Actividad reciente.
 * Tabla densa con filter chips: todos / en vivo / accepted / con error.
 * ============================================================ */

function ActivityBlock({
  submissions,
  challenges,
  courses,
  filter,
  setFilter,
  liveCount,
}: {
  submissions: Submission[];
  challenges: Challenge[];
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
          Aún no enviaste ninguna solución. Probá un reto cuando estés listo.
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
          <div className="hidden border-b border-border/40 px-5 py-2 md:grid md:grid-cols-[8rem_4.5rem_5rem_1fr_3rem] md:gap-4 md:text-[0.6rem] md:uppercase md:tracking-[0.18em] md:text-muted">
            <span>estado</span>
            <span className="text-right">score</span>
            <span className="text-right">tiempo</span>
            <span>reto</span>
            <span className="text-right">hace</span>
          </div>
          {rows.map((s, i) => {
            const ch = challenges.find((c) => c.id === s.challengeId);
            const code = ch
              ? courses.find((c) => c.id === ch.courseId)?.code
              : undefined;
            return (
              <Link
                key={s.id}
                href={`/dashboard/submissions/${s.id}`}
                className={cn(
                  "block px-5 py-3 text-sm transition-colors hover:bg-foreground/[0.05]",
                  i > 0 && "border-t border-border/40",
                )}
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-[8rem_4.5rem_5rem_1fr_3rem] md:items-center">
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
                    {s.challenge?.title ?? s.challengeId.slice(0, 8)}
                    {code && (
                      <span className="ml-2 font-mono text-[0.65rem] uppercase tracking-widest text-muted">
                        {code}
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
 * Bloque 6: Atajos.
 * ============================================================ */

function FooterShortcuts() {
  return (
    <section className="flex flex-wrap gap-2">
      <ShortcutLink href="/dashboard/courses" variant="orange">
        Mis cursos
      </ShortcutLink>
      <ShortcutLink href="/dashboard/challenges" variant="yellow">
        Explorar retos
      </ShortcutLink>
      <ShortcutLink href="/dashboard/evaluations" variant="ghost">
        Evaluaciones
      </ShortcutLink>
    </section>
  );
}

function ShortcutLink({
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
