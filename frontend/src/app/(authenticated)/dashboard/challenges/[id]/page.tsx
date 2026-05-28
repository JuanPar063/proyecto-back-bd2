"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import {
  DashboardSkeleton,
  DifficultyChip,
  Empty,
  ErrorBox,
  PageHeader,
  StatusBadge,
  formatAgo,
} from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  databaseEngine: string;
  timeLimit: number;
  courseId: string;
  status: string;
}

interface Schema { id: string; ddl: string; version: number }

interface Submission {
  id: string;
  status: string;
  score: number | null;
  executionTimeMs: number | null;
  createdAt: string;
  studentId: string;
  student?: { id: string; fullName: string; email: string };
}

interface CreatedSubmission { id: string; status: string }

export default function ChallengeDetailPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params?.id;
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("SELECT ");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const s = loadSession();
    if (!s || !challengeId) return;
    setSession(s);

    apiFetch<Challenge>(`/challenges/${challengeId}`, { token: s.accessToken })
      .then(setChallenge)
      .catch((e: Error) => setError(e.message));

    apiFetch<Schema>(`/challenges/${challengeId}/schema`, { token: s.accessToken })
      .then(setSchema)
      .catch(() => {
        /* schema puede no estar cargado, ignoramos */
      });

    if (s.user.role === "PROFESSOR" || s.user.role === "ADMIN") {
      apiFetch<Submission[]>(`/submissions/challenge/${challengeId}`, {
        token: s.accessToken,
      })
        .then(setSubmissions)
        .catch(() => {
          /* puede no haber endpoint */
        });
    } else {
      // STUDENT: cargo solo sus propias submissions de este reto para mostrar el último intento
      apiFetch<Submission[]>(`/submissions/my`, { token: s.accessToken })
        .then((all) =>
          setSubmissions(
            all.filter((sub: any) => sub.challengeId === challengeId),
          ),
        )
        .catch(() => undefined);
    }
  }, [challengeId]);

  if (!session || !challengeId) return null;
  if (error) return <div className="px-6 py-8 md:px-10"><ErrorBox message={error} /></div>;
  if (!challenge)
    return (
      <div className="px-6 py-8 md:px-10">
        <DashboardSkeleton />
      </div>
    );

  const isStudent = session.user.role === "STUDENT";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setError(null);
    setSubmitting(true);
    try {
      const sub = await apiFetch<CreatedSubmission>(
        `/challenges/${challengeId}/submissions`,
        {
          method: "POST",
          token: session.accessToken,
          body: JSON.stringify({ query }),
        },
      );
      router.push(`/dashboard/submissions/${sub.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-6 py-8 md:px-10">
      <Link
        href="/dashboard/challenges"
        className="mb-4 inline-flex text-xs text-muted-foreground hover:text-foreground"
      >
        ← Retos
      </Link>

      <PageHeader
        title={challenge.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <DifficultyChip level={challenge.difficulty} />
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
              {challenge.status} · {challenge.databaseEngine} · {challenge.timeLimit}ms
            </span>
            <span className="text-xs text-muted-foreground">
              {challenge.tags.join(" · ")}
            </span>
          </span>
        }
      />

      <section className="mt-8 grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div>
          <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
            Enunciado
          </h2>
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {challenge.description}
          </p>

          {schema && (
            <div className="mt-8">
              <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
                Schema disponible
              </h2>
              <pre className="mt-4 max-h-72 overflow-auto rounded-xl border border-border bg-foreground/[0.03] p-4 font-mono text-xs leading-relaxed">
                {schema.ddl}
              </pre>
            </div>
          )}
        </div>

        {isStudent ? (
          <div>
            {submissions.length > 0 && (
              <StudentChallengeStatus
                submissions={submissions}
                challengeId={challengeId}
              />
            )}
            <form onSubmit={onSubmit}>
              <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
                Tu consulta SQL
              </h2>
            <textarea
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={submitting}
              spellCheck={false}
              placeholder="SELECT ..."
              className="mt-4 min-h-72 w-full rounded-xl border border-border bg-foreground/[0.03] p-4 font-mono text-sm leading-relaxed outline-none transition-colors focus:border-accent-orange/60 disabled:opacity-50"
            />
            <p className="mt-2 text-xs text-muted">
              Solo SELECT (o WITH … SELECT). El backend rechaza DROP, DELETE, UPDATE, etc.
            </p>

            {error && <div className="mt-4"><ErrorBox message={error} /></div>}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting || query.trim().length < 5}
                className={cn(
                  "rounded-full bg-accent-orange px-5 py-2.5 text-sm font-medium text-background transition-transform",
                  submitting || query.trim().length < 5
                    ? "opacity-60"
                    : "hover:scale-[1.02]",
                )}
              >
                {submitting ? "Enviando..." : "Enviar submission"}
              </button>
              <span className="text-xs text-muted-foreground">
                Después del envío vas al detalle de la submission con polling cada 1.5 s.
              </span>
            </div>
            </form>
          </div>
        ) : (
          <ProfessorChallengeView submissions={submissions} />
        )}
      </section>
    </div>
  );
}

function StudentChallengeStatus({
  submissions,
  challengeId,
}: {
  submissions: Submission[];
  challengeId: string;
}) {
  const ordered = [...submissions].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const last = ordered[0];
  const best =
    ordered.find((s) => s.status === "ACCEPTED") ??
    ordered.reduce((acc, s) => ((s.score ?? 0) > (acc?.score ?? -1) ? s : acc), undefined as Submission | undefined);

  const stateTone =
    best?.status === "ACCEPTED"
      ? "border-status-accepted/40 bg-status-accepted/10 text-status-accepted"
      : last?.status === "OPTIMIZATION_REQUIRED"
        ? "border-status-critical/40 bg-status-critical/10 text-status-critical"
        : "border-accent-yellow/40 bg-accent-yellow/10 text-accent-yellow";

  const headline =
    best?.status === "ACCEPTED"
      ? "Ya resolviste este reto"
      : last?.status === "OPTIMIZATION_REQUIRED"
        ? "Correcto pero con margen de optimización"
        : `Intentos previos: ${submissions.length}`;

  return (
    <div className={cn("mb-5 rounded-xl border px-4 py-3 text-sm", stateTone)}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-medium">{headline}</span>
        <Link
          href={`/dashboard/submissions/${last.id}`}
          className="text-xs underline-offset-4 hover:underline"
        >
          Ver último intento →
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <StatusBadge status={last.status} />
        <span className="font-mono tabular-nums">
          {last.score ?? 0}/100
        </span>
        <span className="font-mono text-muted-foreground">
          {last.executionTimeMs != null ? `${last.executionTimeMs}ms` : "-"}
        </span>
        <span className="text-muted-foreground">
          hace {formatAgo(last.createdAt)}
        </span>
      </div>
    </div>
  );
}

function ProfessorChallengeView({ submissions }: { submissions: Submission[] }) {
  return (
    <div>
      <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
        Submissions del reto ({submissions.length})
      </h2>
      {submissions.length === 0 ? (
        <div className="mt-4">
          <Empty>Todavía no hay submissions de tus estudiantes.</Empty>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
          {submissions.map((s, i) => (
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
                  {s.student?.fullName ?? s.studentId.slice(0, 8)}
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
  );
}
