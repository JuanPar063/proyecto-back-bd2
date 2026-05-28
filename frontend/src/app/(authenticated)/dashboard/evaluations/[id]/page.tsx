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
} from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface ChallengeRef {
  id: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  timeLimit: number;
}

interface AttemptInfo {
  id: string;
  attemptNumber: number;
  startedAt: string;
  endsAt: string;
  submittedAt: string | null;
}

interface EvaluationState {
  id: string;
  name: string;
  description: string | null;
  course: { id: string; name: string };
  startDate: string;
  endDate: string;
  durationMinutes: number;
  maxAttempts: number;
  resultsVisibility: string;
  canStart: boolean;
  attemptsUsed: number;
  attemptsRemaining: number;
  activeAttempt: AttemptInfo | null;
  challenges: ChallengeRef[];
  attempts: Array<AttemptInfo & {
    submissions: Array<{
      id: string;
      challengeId: string;
      status: string;
      score?: number | null;
    }>;
  }>;
  resultsVisible: boolean;
}

export default function EvaluationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<EvaluationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const s = loadSession();
    if (!s || !id) return;
    setSession(s);

    const url =
      s.user.role === "STUDENT"
        ? `/evaluations/${id}/state`
        : `/evaluations/${id}`;
    apiFetch<EvaluationState>(url, { token: s.accessToken })
      .then(setState)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (!session || !id) return null;

  const onStart = async () => {
    if (!session) return;
    setStarting(true);
    setError(null);
    try {
      await apiFetch(`/evaluations/${id}/start`, {
        method: "POST",
        token: session.accessToken,
      });
      router.refresh();
      // Recargar
      const next = await apiFetch<EvaluationState>(
        `/evaluations/${id}/state`,
        { token: session.accessToken },
      );
      setState(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setStarting(false);
    }
  };

  if (error)
    return (
      <div className="px-6 py-8 md:px-10">
        <ErrorBox message={error} />
      </div>
    );
  if (!state)
    return (
      <div className="px-6 py-8 md:px-10">
        <DashboardSkeleton />
      </div>
    );

  const isStudent = session.user.role === "STUDENT";

  return (
    <div className="px-6 py-8 md:px-10">
      <Link
        href="/dashboard/evaluations"
        className="mb-4 inline-flex text-xs text-muted-foreground hover:text-foreground"
      >
        ← Evaluaciones
      </Link>

      <PageHeader
        title={state.name}
        subtitle={
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
            {state.course?.name} · {state.durationMinutes} min ·{" "}
            {state.maxAttempts} intento(s)
          </span>
        }
      />

      {state.description && (
        <p className="mt-4 max-w-3xl text-sm text-foreground/90">
          {state.description}
        </p>
      )}

      {isStudent && (
        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric value={state.attemptsUsed} label="Intentos usados" />
          <Metric
            value={state.attemptsRemaining}
            label="Restantes"
            accent="orange"
          />
          <Metric
            value={state.canStart ? "Sí" : "No"}
            label="Podés iniciar"
            accent={state.canStart ? "orange" : "default"}
          />
          <Metric
            value={state.resultsVisible ? "Sí" : "No"}
            label="Resultados visibles"
          />
        </section>
      )}

      {isStudent && (
        <section className="mt-8">
          {state.activeAttempt ? (
            <div className="rounded-xl border border-accent-orange/40 bg-accent-orange/10 px-5 py-4">
              <p className="text-sm text-accent-orange">
                Tenés un intento activo (#{state.activeAttempt.attemptNumber}).
                Vence{" "}
                <span className="font-mono">
                  {new Date(state.activeAttempt.endsAt).toLocaleString()}
                </span>
                . Enviá submissions desde los retos asignados.
              </p>
            </div>
          ) : state.canStart && state.attemptsRemaining > 0 ? (
            <button
              type="button"
              onClick={onStart}
              disabled={starting}
              className={cn(
                "rounded-full bg-accent-orange px-5 py-2.5 text-sm font-medium text-background transition-transform",
                starting ? "opacity-60" : "hover:scale-[1.02]",
              )}
            >
              {starting ? "Iniciando..." : "Iniciar intento"}
            </button>
          ) : (
            <Empty>
              {state.canStart
                ? "Ya usaste todos los intentos."
                : "Esta evaluación está fuera de su ventana activa."}
            </Empty>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
          Retos asignados ({state.challenges.length})
        </h2>
        {state.challenges.length === 0 ? (
          <div className="mt-4">
            <Empty>Esta evaluación todavía no tiene retos asignados.</Empty>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
            {state.challenges.map((c, i) => (
              <Link
                key={c.id}
                href={`/dashboard/challenges/${c.id}`}
                className={cn(
                  "flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-foreground/[0.05]",
                  i > 0 && "border-t border-border/60",
                )}
              >
                <div className="flex items-center gap-3">
                  <DifficultyChip level={c.difficulty} />
                  <span className="text-sm">{c.title}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {c.timeLimit}ms
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
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
