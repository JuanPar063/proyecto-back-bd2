"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import { Empty, ErrorBox, PageHeader } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface AiAnalysis {
  explanation: string;
  warnings: Array<{ ruleId: string; severity: string; message: string }>;
  suggestedIndexes: string[];
  rewriteSql: string | null;
  impact: string;
  qualityScore?: {
    goodPractices?: number;
    clarity?: number;
    improvement?: number;
  };
}

interface PersistedRecommendation extends AiAnalysis {
  id: string;
  submissionId: string;
  highestSeverity: string;
  createdAt: string;
}

interface SubmissionSummary {
  id: string;
  status: string;
  executionTimeMs: number | null;
  query: string;
  challengeId: string;
  challenge?: { id: string; title: string };
  student?: { fullName: string; email: string };
  createdAt: string;
}

interface ChallengeRef {
  id: string;
  title: string;
  difficulty: string;
  courseId: string;
  status: string;
}

interface Schema { ddl: string }

const STATUSES = [
  "ACCEPTED",
  "WRONG_ANSWER",
  "SYNTAX_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "OPTIMIZATION_REQUIRED",
] as const;

type Mode = "historic" | "live";

const darkSelect = "[&>option]:bg-background [&>option]:text-foreground";

export default function AiPlaygroundPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("historic");

  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [challenges, setChallenges] = useState<ChallengeRef[]>([]);

  // Modo histórico
  const [historicSubmissionId, setHistoricSubmissionId] = useState("");
  const [historicData, setHistoricData] = useState<{
    submission: SubmissionSummary;
    recommendation: PersistedRecommendation | null;
    notFound: boolean;
  } | null>(null);
  const [historicLoading, setHistoricLoading] = useState(false);
  const [historicError, setHistoricError] = useState<string | null>(null);

  // Modo en vivo
  const [liveSource, setLiveSource] = useState<"manual" | "challenge" | "submission">("manual");
  const [chosenChallenge, setChosenChallenge] = useState("");
  const [chosenSubmission, setChosenSubmission] = useState("");
  const [query, setQuery] = useState(
    "SELECT * FROM customers WHERE UPPER(name) = 'ANA LÓPEZ' ORDER BY name",
  );
  const [schemaDdl, setSchemaDdl] = useState(
    "CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100), city VARCHAR(80));",
  );
  const [executionTimeMs, setExecutionTimeMs] = useState(100);
  const [status, setStatus] = useState<string>("ACCEPTED");
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    if (s.user.role !== "PROFESSOR" && s.user.role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
    setSession(s);
    apiFetch<ChallengeRef[]>("/challenges", { token: s.accessToken })
      .then(setChallenges)
      .catch(() => undefined);
    apiFetch<SubmissionSummary[]>("/submissions?limit=50", { token: s.accessToken })
      .then(setSubmissions)
      .catch(() => undefined);
  }, [router]);

  if (!session) return null;

  const loadHistoric = async (id: string) => {
    setHistoricSubmissionId(id);
    setHistoricData(null);
    setHistoricError(null);
    if (!id) return;
    setHistoricLoading(true);
    try {
      const submission = await apiFetch<SubmissionSummary>(`/submissions/${id}`, {
        token: session.accessToken,
      });
      try {
        const rec = await apiFetch<PersistedRecommendation>(
          `/submissions/${id}/recommendation`,
          { token: session.accessToken },
        );
        setHistoricData({ submission, recommendation: rec, notFound: false });
      } catch {
        setHistoricData({ submission, recommendation: null, notFound: true });
      }
    } catch (e) {
      setHistoricError(e instanceof Error ? e.message : "Error");
    } finally {
      setHistoricLoading(false);
    }
  };

  const loadFromChallenge = async (id: string) => {
    setChosenChallenge(id);
    setAnalysis(null);
    if (!id) return;
    try {
      const sch = await apiFetch<Schema>(`/challenges/${id}/schema`, {
        token: session.accessToken,
      });
      setSchemaDdl(sch.ddl);
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : "Error cargando schema");
    }
  };

  const loadFromSubmission = async (id: string) => {
    setChosenSubmission(id);
    setAnalysis(null);
    if (!id) return;
    try {
      const sub = await apiFetch<SubmissionSummary>(`/submissions/${id}`, {
        token: session.accessToken,
      });
      setQuery(sub.query);
      setExecutionTimeMs(sub.executionTimeMs ?? 0);
      setStatus(sub.status);
      try {
        const sch = await apiFetch<Schema>(
          `/challenges/${sub.challengeId}/schema`,
          { token: session.accessToken },
        );
        setSchemaDdl(sch.ddl);
      } catch {
        /* schema opcional */
      }
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : "Error cargando submission");
    }
  };

  const onAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setLiveError(null);
    setLiveLoading(true);
    setAnalysis(null);
    try {
      const r = await apiFetch<AiAnalysis>("/ai-assistant/analyze", {
        method: "POST",
        token: session.accessToken,
        body: JSON.stringify({ query, schemaDdl, executionTimeMs, status }),
      });
      setAnalysis(r);
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : "Error");
    } finally {
      setLiveLoading(false);
    }
  };

  return (
    <div className="px-6 py-8 md:px-10">
      <PageHeader
        title="Asistente IA"
        subtitle="Dos modos: histórico (lo que el IA dijo cuando se procesó la submission) o en vivo (genera un nuevo análisis)."
      />

      <div className="mt-6 inline-flex gap-1 rounded-full border border-border bg-background p-1">
        <ToggleBtn
          active={mode === "historic"}
          activeClass="bg-accent-yellow/10 text-accent-yellow"
          onClick={() => setMode("historic")}
        >
          Histórico de submission
        </ToggleBtn>
        <ToggleBtn
          active={mode === "live"}
          activeClass="bg-accent-orange/10 text-accent-orange"
          onClick={() => setMode("live")}
        >
          Análisis en vivo
        </ToggleBtn>
      </div>

      {mode === "historic" ? (
        <HistoricView
          submissions={submissions}
          chosenId={historicSubmissionId}
          onPick={loadHistoric}
          data={historicData}
          loading={historicLoading}
          error={historicError}
          onJumpToLive={(s) => {
            setMode("live");
            setLiveSource("submission");
            loadFromSubmission(s.id);
          }}
        />
      ) : (
        <LiveView
          source={liveSource}
          setSource={setLiveSource}
          submissions={submissions}
          challenges={challenges}
          chosenChallenge={chosenChallenge}
          chosenSubmission={chosenSubmission}
          loadFromChallenge={loadFromChallenge}
          loadFromSubmission={loadFromSubmission}
          query={query} setQuery={setQuery}
          schemaDdl={schemaDdl} setSchemaDdl={setSchemaDdl}
          executionTimeMs={executionTimeMs} setExecutionTimeMs={setExecutionTimeMs}
          status={status} setStatus={setStatus}
          loading={liveLoading}
          error={liveError}
          analysis={analysis}
          onAnalyze={onAnalyze}
        />
      )}
    </div>
  );
}

function HistoricView({
  submissions, chosenId, onPick, data, loading, error, onJumpToLive,
}: {
  submissions: SubmissionSummary[];
  chosenId: string;
  onPick: (id: string) => void;
  data: { submission: SubmissionSummary; recommendation: PersistedRecommendation | null; notFound: boolean } | null;
  loading: boolean;
  error: string | null;
  onJumpToLive: (s: SubmissionSummary) => void;
}) {
  return (
    <>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-accent-yellow/40 bg-accent-yellow/[0.05] px-4 py-3 text-xs text-foreground/80">
        <span className="rounded-full border border-accent-yellow/40 bg-accent-yellow/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-widest text-accent-yellow">
          Verídico
        </span>
        <p className="leading-relaxed">
          Muestra la <code className="font-mono">Recommendation</code> que el worker guardó cuando procesó la submission. Solo lectura.
          Si la submission no tiene análisis persistido, saltá a "Análisis en vivo" para generar uno.
        </p>
      </div>

      <div className="mt-4 max-w-3xl rounded-xl border border-border bg-foreground/[0.03] p-5">
        <label className="block text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Submission
        </label>
        <select
          value={chosenId}
          onChange={(e) => onPick(e.target.value)}
          disabled={loading}
          className={cn(
            "mt-3 w-full rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm outline-none focus:border-accent-yellow/60 disabled:opacity-50",
            darkSelect,
          )}
        >
          <option value="">- elegí una submission -</option>
          {submissions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.status} · {s.challenge?.title ?? s.challengeId.slice(0, 8)} ·{" "}
              {s.student?.fullName ?? s.student?.email ?? s.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="mt-6"><ErrorBox message={error} /></div>}

      {data && (
        <div className="mt-6">
          <div className="rounded-xl border border-border bg-foreground/[0.03] p-5">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-mono uppercase tracking-widest text-accent-yellow">
                {data.submission.status}
              </span>
              <span className="text-muted-foreground">
                {data.submission.challenge?.title ?? data.submission.challengeId.slice(0, 8)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {data.submission.student?.fullName ?? data.submission.student?.email ?? data.submission.id.slice(0, 8)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">
                {data.submission.executionTimeMs != null ? `${data.submission.executionTimeMs} ms` : "-"}
              </span>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-border/60 bg-background p-3 font-mono text-xs">
              {data.submission.query}
            </pre>
          </div>

          {data.recommendation ? (
            <ResultDisplay
              analysis={data.recommendation}
              badge={{ text: "Verídico", tone: "yellow" }}
              note="Análisis generado por el worker al procesar la submission."
            />
          ) : data.notFound ? (
            <div className="mt-6">
              <Empty>
                <p>Esta submission no tiene análisis IA persistido en la BD.</p>
                <p className="mt-2 text-xs">
                  Puede ser una submission anterior al cableado de persistencia.
                </p>
                <button
                  type="button"
                  onClick={() => onJumpToLive(data.submission)}
                  className="mt-4 rounded-full bg-accent-orange px-4 py-2 text-xs font-medium text-background hover:scale-[1.02]"
                >
                  Generar análisis en vivo →
                </button>
              </Empty>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

function LiveView(props: {
  source: "manual" | "challenge" | "submission";
  setSource: (s: "manual" | "challenge" | "submission") => void;
  submissions: SubmissionSummary[];
  challenges: ChallengeRef[];
  chosenChallenge: string;
  chosenSubmission: string;
  loadFromChallenge: (id: string) => Promise<void>;
  loadFromSubmission: (id: string) => Promise<void>;
  query: string; setQuery: (s: string) => void;
  schemaDdl: string; setSchemaDdl: (s: string) => void;
  executionTimeMs: number; setExecutionTimeMs: (n: number) => void;
  status: string; setStatus: (s: string) => void;
  loading: boolean;
  error: string | null;
  analysis: AiAnalysis | null;
  onAnalyze: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-accent-orange/40 bg-accent-orange/[0.05] px-4 py-3 text-xs text-foreground/80">
        <span className="rounded-full border border-accent-orange/40 bg-accent-orange/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-widest text-accent-orange">
          En vivo
        </span>
        <p className="leading-relaxed">
          Ejecuta el motor de reglas + LLM stub contra los datos del form. Útil para
          generar un análisis nuevo o re-evaluar una submission. No modifica la submission original.
        </p>
      </div>

      <div className="mt-4 inline-flex gap-1 rounded-full border border-border bg-background p-1">
        <SubToggle active={props.source === "manual"} onClick={() => props.setSource("manual")}>Manual</SubToggle>
        <SubToggle active={props.source === "challenge"} onClick={() => props.setSource("challenge")}>Sobre un reto</SubToggle>
        <SubToggle active={props.source === "submission"} onClick={() => props.setSource("submission")}>De una submission</SubToggle>
      </div>

      {props.source === "challenge" && (
        <div className="mt-4 max-w-3xl rounded-xl border border-border bg-foreground/[0.03] p-5">
          <label className="block text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            Reto (autocompleta solo el schema)
          </label>
          <select
            value={props.chosenChallenge}
            onChange={(e) => props.loadFromChallenge(e.target.value)}
            disabled={props.loading}
            className={cn(
              "mt-3 w-full rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm outline-none focus:border-accent-orange/60 disabled:opacity-50",
              darkSelect,
            )}
          >
            <option value="">- elegí un reto -</option>
            {props.challenges.map((c) => (
              <option key={c.id} value={c.id}>{c.difficulty} · {c.title}</option>
            ))}
          </select>
        </div>
      )}

      {props.source === "submission" && (
        <div className="mt-4 max-w-3xl rounded-xl border border-border bg-foreground/[0.03] p-5">
          <label className="block text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            Submission (autocompleta todo)
          </label>
          <select
            value={props.chosenSubmission}
            onChange={(e) => props.loadFromSubmission(e.target.value)}
            disabled={props.loading}
            className={cn(
              "mt-3 w-full rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm outline-none focus:border-accent-orange/60 disabled:opacity-50",
              darkSelect,
            )}
          >
            <option value="">- elegí una submission -</option>
            {props.submissions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.status} · {s.challenge?.title ?? s.challengeId.slice(0, 8)} ·{" "}
                {s.student?.fullName ?? s.student?.email ?? s.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      )}

      <form onSubmit={props.onAnalyze} className="mt-6 grid gap-4 lg:grid-cols-2">
        <Field label="Query SQL">
          <textarea
            required value={props.query}
            onChange={(e) => props.setQuery(e.target.value)}
            disabled={props.loading} spellCheck={false}
            className="min-h-32 w-full rounded-lg border border-border bg-foreground/[0.03] p-3 font-mono text-sm outline-none focus:border-accent-orange/60 disabled:opacity-50"
          />
        </Field>

        <Field label="Schema DDL">
          <textarea
            required value={props.schemaDdl}
            onChange={(e) => props.setSchemaDdl(e.target.value)}
            disabled={props.loading} spellCheck={false}
            className="min-h-32 w-full rounded-lg border border-border bg-foreground/[0.03] p-3 font-mono text-sm outline-none focus:border-accent-orange/60 disabled:opacity-50"
          />
        </Field>

        <Field label="Execution time (ms)">
          <input
            type="number" min={0} value={props.executionTimeMs}
            onChange={(e) => props.setExecutionTimeMs(Number(e.target.value))}
            disabled={props.loading}
            className="w-full rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm outline-none focus:border-accent-orange/60 disabled:opacity-50"
          />
        </Field>

        <Field label="Submission status simulado" hint="Modula el feedback. ACCEPTED activa todas las sub-métricas.">
          <select
            value={props.status} onChange={(e) => props.setStatus(e.target.value)}
            disabled={props.loading}
            className={cn(
              "w-full rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm outline-none focus:border-accent-orange/60 disabled:opacity-50",
              darkSelect,
            )}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <div className="lg:col-span-2">
          <button
            type="submit" disabled={props.loading}
            className={cn(
              "rounded-full bg-accent-orange px-5 py-2.5 text-sm font-medium text-background transition-transform",
              props.loading ? "opacity-60" : "hover:scale-[1.02]",
            )}
          >
            {props.loading ? "Analizando..." : "Analizar query"}
          </button>
        </div>
      </form>

      {props.error && <div className="mt-6"><ErrorBox message={props.error} /></div>}

      {props.analysis && (
        <ResultDisplay
          analysis={props.analysis}
          badge={{ text: "En vivo", tone: "orange" }}
          note="Resultado del motor de reglas con los datos del form de arriba."
        />
      )}
    </>
  );
}

function ResultDisplay({
  analysis, badge, note,
}: {
  analysis: AiAnalysis | PersistedRecommendation;
  badge: { text: string; tone: "yellow" | "orange" };
  note: string;
}) {
  const gp = analysis.qualityScore?.goodPractices ?? 0;
  const cl = analysis.qualityScore?.clarity ?? 0;
  const im = analysis.qualityScore?.improvement ?? 0;
  const total = gp + cl + im;
  const max = 25;
  const pct = Math.round((total / max) * 100);
  const badgeTone =
    badge.tone === "yellow"
      ? "border-accent-yellow/40 bg-accent-yellow/10 text-accent-yellow"
      : "border-accent-orange/40 bg-accent-orange/10 text-accent-orange";

  return (
    <section className="mt-8 space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-[0.65rem] uppercase tracking-[0.22em] text-accent-orange">
          Análisis del IA
        </h2>
        <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-widest", badgeTone)}>
          {badge.text}
        </span>
        <span className="text-xs text-muted">{note}</span>
      </div>

      <div className="rounded-xl border border-border bg-foreground/[0.03] p-5">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              Score IA (qualityScore total)
            </div>
            <div className="mt-1 text-4xl tabular-nums">
              <span className="text-accent-orange">{total}</span>
              <span className="text-base text-muted-foreground">/{max}</span>
              <span className="ml-3 align-middle text-base text-muted-foreground">({pct}%)</span>
            </div>
            <p className="mt-2 max-w-md text-xs text-muted">
              Suma de las 3 sub-métricas que alimentan el scorer del worker
              (dimensiones 3-5 de la rúbrica del Entregable 2).
            </p>
          </div>
          <div className="flex gap-2">
            <ScoreChip label="Practices" value={gp} max={10} accent="orange" />
            <ScoreChip label="Clarity" value={cl} max={5} accent="yellow" />
            <ScoreChip label="Improvement" value={im} max={10} accent="orange" />
          </div>
        </div>
      </div>

      {analysis.explanation && (
        <div className="rounded-xl border border-border bg-foreground/[0.03] p-5 text-sm leading-relaxed">
          {analysis.explanation}
        </div>
      )}

      {analysis.warnings.length > 0 && (
        <div className="grid gap-2">
          {analysis.warnings.map((w, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg border px-4 py-3 text-sm",
                w.severity === "critical" && "border-status-critical/40 bg-status-critical/10 text-status-critical",
                w.severity === "warning" && "border-status-warning/40 bg-status-warning/10 text-status-warning",
                w.severity === "info" && "border-border bg-foreground/[0.03] text-foreground/80",
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

      {analysis.suggestedIndexes.length > 0 && (
        <div>
          <div className="mb-2 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
            Índices sugeridos ({analysis.suggestedIndexes.length})
          </div>
          <pre className="overflow-x-auto rounded-xl border border-border bg-foreground/[0.03] p-4 font-mono text-xs text-accent-yellow">
            {analysis.suggestedIndexes.join("\n")}
          </pre>
        </div>
      )}

      {analysis.rewriteSql && (
        <div>
          <div className="mb-2 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
            Reescritura sugerida
          </div>
          <pre className="overflow-x-auto rounded-xl border border-border bg-foreground/[0.03] p-4 font-mono text-xs">
            {analysis.rewriteSql}
          </pre>
        </div>
      )}

      {analysis.impact && (
        <p className="text-sm text-muted-foreground">{analysis.impact}</p>
      )}
    </section>
  );
}

function ScoreChip({ label, value, max, accent }: { label: string; value: number; max: number; accent: "orange" | "yellow" }) {
  const tint = accent === "orange" ? "text-accent-orange" : "text-accent-yellow";
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
      <div className={cn("text-lg tabular-nums", tint)}>
        {value}
        <span className="text-xs text-muted-foreground">/{max}</span>
      </div>
      <div className="mt-0.5 text-[0.55rem] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function ToggleBtn({ active, activeClass, onClick, children }: { active: boolean; activeClass: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs transition-colors",
        active ? activeClass : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SubToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-[0.7rem] transition-colors",
        active ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      <div className="mt-2">{children}</div>
    </label>
  );
}
