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
  StatusBadge,
  formatAgo,
} from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface Submission {
  id: string;
  status: string;
  score: number | null;
  scoreBreakdown: Record<string, number> | null;
  executionTimeMs: number | null;
  errorMessage: string | null;
  feedback: string | null;
  runnerMetadata: Record<string, unknown> | null;
  resultData: unknown[] | null;
  query: string;
  createdAt: string;
  updatedAt: string;
  challenge?: { id: string; title: string; courseId: string; timeLimit: number };
  student?: { id: string; fullName: string; email: string };
}

interface Recommendation {
  id: string;
  submissionId: string;
  explanation: string;
  suggestedIndexes: string[];
  rewriteSql: string | null;
  warnings: Array<{ ruleId: string; severity: string; message: string }>;
  impact: string;
  highestSeverity: string;
  qualityScore: { goodPractices?: number; clarity?: number; improvement?: number } | null;
  createdAt: string;
}

export default function SubmissionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [session, setSession] = useState<Session | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s || !id) return;
    setSession(s);

    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const data = await apiFetch<Submission>(`/submissions/${id}`, {
          token: s.accessToken,
        });
        if (!cancelled) setSubmission(data);
        return data;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
        return null;
      }
    };

    const fetchRecommendation = async () => {
      try {
        const rec = await apiFetch<Recommendation>(
          `/submissions/${id}/recommendation`,
          { token: s.accessToken },
        );
        if (!cancelled) setRecommendation(rec);
      } catch {
        // 404 esperado para submissions sin Recommendation persistida
        if (!cancelled) setRecommendation(null);
      }
    };

    fetchOnce().then((first) => {
      // Si ya está en estado terminal, fetch de recommendation de una vez.
      if (
        first &&
        first.status !== "QUEUED" &&
        first.status !== "RUNNING" &&
        !cancelled
      ) {
        fetchRecommendation();
        return;
      }
      // Si está en QUEUED/RUNNING, polling de submission + recommendation al final.
      if (first && !cancelled) {
        const interval = setInterval(async () => {
          const next = await fetchOnce();
          if (next && next.status !== "QUEUED" && next.status !== "RUNNING") {
            clearInterval(interval);
            // Pequeño delay para que el worker termine de persistir la Recommendation.
            setTimeout(fetchRecommendation, 600);
          }
        }, 1500);
        return () => clearInterval(interval);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!session || !id) return null;
  if (error) return <div className="px-6 py-8 md:px-10"><ErrorBox message={error} /></div>;
  if (!submission)
    return (
      <div className="px-6 py-8 md:px-10">
        <DashboardSkeleton />
      </div>
    );

  const breakdown = submission.scoreBreakdown ?? {};
  const breakdownEntries = Object.entries(breakdown).filter(
    ([k]) => !["final", "total"].includes(k),
  );

  // Recomendación IA persistida - se lee del endpoint dedicado.
  const ai = recommendation;
  const isTerminal =
    submission.status !== "QUEUED" && submission.status !== "RUNNING";

  return (
    <div className="px-6 py-8 md:px-10">
      <Link
        href="/dashboard/submissions"
        className="mb-4 inline-flex text-xs text-muted-foreground hover:text-foreground"
      >
        ← Submissions
      </Link>

      <PageHeader
        title={submission.challenge?.title ?? "Submission"}
        subtitle={`${submission.student?.fullName ?? submission.student?.email ?? "-"} · ${formatAgo(submission.createdAt)} atrás`}
        action={<StatusBadge status={submission.status} />}
      />

      {/* Hero asimétrico: score como display masivo a la izquierda + 3 métricas
          pequeñas en stack a la derecha. Aplica DESIGN_VARIANCE 7-8 del SKILL. */}
      <section className="mt-8 grid gap-3 lg:grid-cols-[2fr_3fr]">
        <div className="flex flex-col justify-between rounded-xl border border-border bg-foreground/[0.03] p-6 sm:p-8">
          <div className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
            Score final
          </div>
          <div className="mt-4 flex items-baseline gap-2 leading-none tracking-tighter text-accent-orange">
            <span className="text-7xl tabular-nums md:text-8xl">
              {submission.score ?? 0}
            </span>
            <span className="text-2xl tracking-normal text-muted-foreground">
              /100
            </span>
          </div>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Suma de las 5 dimensiones de la rúbrica: correctness, performance,
            prácticas, claridad y mejora propuesta.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <HeroMetric
            value={submission.executionTimeMs != null ? `${submission.executionTimeMs}` : "-"}
            unit="ms"
            label="Tiempo runner"
          />
          <HeroMetric
            value={submission.challenge?.timeLimit ?? "-"}
            unit="ms"
            label="Time limit"
          />
          <HeroMetric
            value={Array.isArray(submission.resultData) ? submission.resultData.length : 0}
            label="Filas devueltas"
          />
        </div>
      </section>

      {/* Breakdown */}
      {breakdownEntries.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
            Desglose del score
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {breakdownEntries.map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl border border-border bg-foreground/[0.03] px-4 py-3"
              >
                <div className="text-xl tabular-nums">{v}</div>
                <div className="mt-1 text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                  {k}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Feedback / errores */}
      {(submission.feedback || submission.errorMessage) && (
        <section className="mt-10">
          <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
            Feedback
          </h2>
          <div
            className={cn(
              "mt-4 rounded-xl border px-5 py-4 text-sm",
              submission.status === "ACCEPTED"
                ? "border-status-accepted/40 bg-status-accepted/10 text-status-accepted"
                : "border-border bg-foreground/[0.03] text-foreground/90",
            )}
          >
            {submission.feedback ?? submission.errorMessage}
          </div>
        </section>
      )}

      {/* Query enviada */}
      <section className="mt-10">
        <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
          Query enviada
        </h2>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-foreground/[0.03] p-5 font-mono text-xs leading-relaxed">
          {submission.query}
        </pre>
      </section>

      {/* Recomendación IA - si está persistida la mostramos; si la submission ya
          terminó pero no hay Recommendation, mostramos placeholder honesto. */}
      {ai ? (
        <section className="mt-10">
          <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-accent-orange">
            Recomendación del asistente IA
          </h2>

          {ai.qualityScore && (
            <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
              <QualityChip label="Practices" value={ai.qualityScore.goodPractices ?? 0} max={10} accent="orange" />
              <QualityChip label="Clarity"   value={ai.qualityScore.clarity ?? 0}       max={5}  accent="yellow" />
              <QualityChip label="Improvement" value={ai.qualityScore.improvement ?? 0} max={10} accent="orange" />
            </div>
          )}

          {ai.explanation && (
            <div className="mt-4 rounded-xl border border-border bg-foreground/[0.03] p-5 text-sm leading-relaxed text-foreground/90">
              {ai.explanation}
            </div>
          )}

          {ai.warnings && ai.warnings.length > 0 && (
            <div className="mt-4 grid gap-2">
              {ai.warnings.map((w, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-sm",
                    w.severity === "critical" &&
                      "border-status-critical/40 bg-status-critical/10 text-status-critical",
                    w.severity === "warning" &&
                      "border-status-warning/40 bg-status-warning/10 text-status-warning",
                    w.severity === "info" &&
                      "border-border bg-foreground/[0.03] text-foreground/80",
                  )}
                >
                  <div className="font-mono text-[0.65rem] uppercase tracking-widest">
                    {w.ruleId} · {w.severity}
                  </div>
                  <p className="mt-1">{w.message}</p>
                </div>
              ))}
            </div>
          )}

          {ai.suggestedIndexes && ai.suggestedIndexes.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                Índices sugeridos
              </div>
              <pre className="overflow-x-auto rounded-xl border border-border bg-foreground/[0.03] p-4 font-mono text-xs text-accent-yellow">
                {ai.suggestedIndexes.join("\n")}
              </pre>
            </div>
          )}

          {ai.rewriteSql && (
            <div className="mt-4">
              <div className="mb-2 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                Reescritura sugerida
              </div>
              <pre className="overflow-x-auto rounded-xl border border-border bg-foreground/[0.03] p-4 font-mono text-xs">
                {ai.rewriteSql}
              </pre>
            </div>
          )}

          {ai.impact && (
            <p className="mt-4 text-sm text-muted-foreground">{ai.impact}</p>
          )}
        </section>
      ) : isTerminal ? (
        <section className="mt-10">
          <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
            Recomendación del asistente IA
          </h2>
          <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-foreground/[0.02] px-5 py-4 text-sm text-muted-foreground">
            Esta submission no tiene análisis IA persistido. Probablemente fue
            procesada antes de cablear la persistencia, o el worker no la guardó.
          </div>
        </section>
      ) : null}

      {/* Resultado tabular */}
      {Array.isArray(submission.resultData) && submission.resultData.length > 0 && (
        <section className="mt-10 mb-12">
          <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
            Resultado devuelto ({submission.resultData.length} fila/s)
          </h2>
          <ResultTable rows={submission.resultData} />
        </section>
      )}

      {(submission.status === "QUEUED" || submission.status === "RUNNING") && (
        <Empty>
          Esperando al worker… esta página se actualiza sola cada 1.5 s.
        </Empty>
      )}
    </div>
  );
}

function HeroMetric({
  value,
  unit,
  label,
}: {
  value: string | number;
  unit?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-foreground/[0.03] p-5">
      <div className="flex items-baseline gap-1.5 leading-none tracking-tight">
        <span className="text-3xl tabular-nums">{value}</span>
        {unit && (
          <span className="text-sm text-muted-foreground">{unit}</span>
        )}
      </div>
      <div className="mt-3 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function QualityChip({
  label,
  value,
  max,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  accent: "orange" | "yellow";
}) {
  const tint = accent === "orange" ? "text-accent-orange" : "text-accent-yellow";
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
      <div className={cn("text-lg tabular-nums", tint)}>
        {value}
        <span className="text-xs text-muted-foreground">/{max}</span>
      </div>
      <div className="mt-0.5 text-[0.55rem] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ResultTable({ rows }: { rows: unknown[] }) {
  if (rows.length === 0) return null;
  const first = rows[0];
  // Caso A: array de objetos {col: val}
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const cols = Object.keys(first as Record<string, unknown>);
    return (
      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-foreground/[0.05] text-left">
            <tr>
              {cols.map((c) => (
                <th key={c} className="px-4 py-2 font-mono uppercase tracking-widest text-muted-foreground">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/40">
                {cols.map((c) => (
                  <td key={c} className="px-4 py-2 font-mono">
                    {String((r as Record<string, unknown>)[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // Caso B: array de arrays
  if (Array.isArray(first)) {
    return (
      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i > 0 ? "border-t border-border/40" : ""}>
                {(r as unknown[]).map((cell, j) => (
                  <td key={j} className="px-4 py-2 font-mono">
                    {String(cell ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}
