"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import {
  DifficultyChip,
  ErrorBox,
  PageHeader,
} from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

type Difficulty = "EASY" | "MEDIUM" | "HARD";
type Engine = "postgresql" | "mysql" | "sqlite";
type TestDataKind = "manual" | "generate";

interface Course {
  id: string;
  code: string;
  name: string;
}

interface CreatedChallenge {
  id: string;
  title: string;
  status: string;
}

const STEPS = [
  { n: 1, label: "Info" },
  { n: 2, label: "Schema" },
  { n: 3, label: "Datos" },
  { n: 4, label: "Esperado" },
  { n: 5, label: "Publicar" },
] as const;

export default function NewChallengeWizardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  // Step 1: info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [tagsInput, setTagsInput] = useState("SELECT, WHERE");
  const [engine, setEngine] = useState<Engine>("postgresql");
  const [timeLimit, setTimeLimit] = useState(3000);
  const [courseId, setCourseId] = useState("");

  // Step 2: schema
  const [schemaDdl, setSchemaDdl] = useState(SAMPLE_SCHEMA);

  // Step 3: test data
  const [testDataKind] = useState<TestDataKind>("manual");
  const [testDataName, setTestDataName] = useState("dataset-base");
  const [testDataSql, setTestDataSql] = useState(SAMPLE_SEED);

  // Step 4: expected
  const [expectedColumns, setExpectedColumns] = useState("name");
  const [expectedRows, setExpectedRows] = useState(
    '[["Ana López"], ["Diego Vargas"]]',
  );
  const [expectedOrderSensitive, setExpectedOrderSensitive] = useState(false);
  const [expectedFloatTolerance, setExpectedFloatTolerance] = useState(0);

  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    if (s.user.role !== "PROFESSOR" && s.user.role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
    setSession(s);
    apiFetch<Course[]>("/courses", { token: s.accessToken })
      .then((cs) => {
        setCourses(cs);
        if (cs.length > 0) setCourseId(cs[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, [router]);

  if (!session) return null;

  const tags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // ============================
  // Acciones de paso
  // ============================
  const advance = async () => {
    setError(null);
    setLoading(true);
    try {
      if (step === 1) {
        // POST /challenges
        const created = await apiFetch<CreatedChallenge>("/challenges", {
          method: "POST",
          token: session.accessToken,
          body: JSON.stringify({
            title,
            description,
            difficulty,
            tags,
            databaseEngine: engine,
            timeLimit,
            courseId,
          }),
        });
        setChallengeId(created.id);
      } else if (step === 2 && challengeId) {
        // PUT /challenges/:id/schema
        await apiFetch(`/challenges/${challengeId}/schema`, {
          method: "PUT",
          token: session.accessToken,
          body: JSON.stringify({ ddl: schemaDdl }),
        });
      } else if (step === 3 && challengeId) {
        // POST /challenges/:id/test-data/manual
        await apiFetch(
          `/challenges/${challengeId}/test-data/${testDataKind}`,
          {
            method: "POST",
            token: session.accessToken,
            body: JSON.stringify({ name: testDataName, sql: testDataSql }),
          },
        );
      } else if (step === 4 && challengeId) {
        // PUT /challenges/:id/expected-result
        let rows: unknown;
        try {
          rows = JSON.parse(expectedRows);
        } catch {
          throw new Error("El JSON de filas no es válido.");
        }
        if (!Array.isArray(rows)) {
          throw new Error("rows debe ser un array de arrays.");
        }
        await apiFetch(`/challenges/${challengeId}/expected-result`, {
          method: "PUT",
          token: session.accessToken,
          body: JSON.stringify({
            columns: expectedColumns.split(",").map((c) => c.trim()).filter(Boolean),
            rows,
            orderSensitive: expectedOrderSensitive,
            floatTolerance: expectedFloatTolerance,
          }),
        });
      } else if (step === 5 && challengeId) {
        // PATCH /challenges/:id/status
        await apiFetch(`/challenges/${challengeId}/status`, {
          method: "PATCH",
          token: session.accessToken,
          body: JSON.stringify({ status: "published" }),
        });
        router.push(`/dashboard/challenges?created=${challengeId}`);
        return;
      }
      setStep((s) => Math.min(s + 1, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const back = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
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
        title="Nuevo reto"
        subtitle="Wizard de 5 pasos: info → schema → datos → esperado → publicar."
      />

      <Stepper current={step} />

      {error && (
        <div className="mt-6">
          <ErrorBox message={error} />
        </div>
      )}

      <div className="mt-6 max-w-3xl">
        {step === 1 && (
          <StepInfo
            courses={courses}
            title={title} setTitle={setTitle}
            description={description} setDescription={setDescription}
            difficulty={difficulty} setDifficulty={setDifficulty}
            tagsInput={tagsInput} setTagsInput={setTagsInput}
            engine={engine} setEngine={setEngine}
            timeLimit={timeLimit} setTimeLimit={setTimeLimit}
            courseId={courseId} setCourseId={setCourseId}
            disabled={loading}
          />
        )}

        {step === 2 && (
          <StepSchema
            value={schemaDdl}
            onChange={setSchemaDdl}
            disabled={loading}
          />
        )}

        {step === 3 && (
          <StepTestData
            name={testDataName} setName={setTestDataName}
            sql={testDataSql} setSql={setTestDataSql}
            disabled={loading}
          />
        )}

        {step === 4 && (
          <StepExpected
            columns={expectedColumns} setColumns={setExpectedColumns}
            rows={expectedRows} setRows={setExpectedRows}
            orderSensitive={expectedOrderSensitive} setOrderSensitive={setExpectedOrderSensitive}
            floatTolerance={expectedFloatTolerance} setFloatTolerance={setExpectedFloatTolerance}
            disabled={loading}
          />
        )}

        {step === 5 && (
          <StepPublish
            title={title}
            description={description}
            difficulty={difficulty}
            tags={tags}
            timeLimit={timeLimit}
            courseCode={courses.find((c) => c.id === courseId)?.code ?? courseId}
          />
        )}
      </div>

      <div className="mt-8 flex max-w-3xl items-center justify-between gap-3">
        {step > 1 ? (
          <button
            type="button"
            onClick={back}
            disabled={loading}
            className="rounded-full border border-border bg-background px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:border-accent-orange/60 hover:text-foreground disabled:opacity-50"
          >
            ← Atrás
          </button>
        ) : (
          <Link
            href="/dashboard/challenges"
            className="rounded-full border border-border bg-background px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:border-accent-orange/60 hover:text-foreground"
          >
            Cancelar
          </Link>
        )}

        <button
          type="button"
          onClick={advance}
          disabled={loading || !canAdvance({ step, title, description, courseId, schemaDdl, testDataSql, expectedColumns, expectedRows })}
          className={cn(
            "rounded-full px-5 py-2.5 text-sm font-medium text-background transition-transform",
            step === 5 ? "bg-accent-yellow" : "bg-accent-orange",
            loading || !canAdvance({ step, title, description, courseId, schemaDdl, testDataSql, expectedColumns, expectedRows })
              ? "opacity-60"
              : "hover:scale-[1.02]",
          )}
        >
          {loading
            ? "Procesando..."
            : step === 5
              ? "Publicar reto"
              : "Siguiente →"}
        </button>
      </div>
    </div>
  );
}

function canAdvance(args: {
  step: number;
  title: string;
  description: string;
  courseId: string;
  schemaDdl: string;
  testDataSql: string;
  expectedColumns: string;
  expectedRows: string;
}): boolean {
  switch (args.step) {
    case 1:
      return args.title.trim().length >= 3 && args.description.trim().length >= 10 && !!args.courseId;
    case 2:
      return args.schemaDdl.trim().length >= 10;
    case 3:
      return args.testDataSql.trim().length >= 10;
    case 4:
      return args.expectedColumns.trim().length > 0 && args.expectedRows.trim().length > 0;
    case 5:
      return true;
    default:
      return false;
  }
}

// ============================================================
// Stepper visual
// ============================================================
function Stepper({ current }: { current: number }) {
  return (
    <div className="mt-8 flex items-center gap-2">
      {STEPS.map((s, i) => {
        const active = s.n === current;
        const done = s.n < current;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border font-mono text-xs",
                done && "border-accent-orange/60 bg-accent-orange/10 text-accent-orange",
                active && "border-accent-yellow bg-accent-yellow text-background",
                !active && !done && "border-border text-muted-foreground",
              )}
            >
              {done ? "✓" : s.n}
            </div>
            <span
              className={cn(
                "text-xs uppercase tracking-[0.18em]",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="mx-1 h-px w-6 bg-border" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Step components
// ============================================================
const inputCls =
  "w-full rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-accent-orange/60 disabled:opacity-50";
const textareaCls = cn(inputCls, "min-h-32 font-mono leading-relaxed");
// Para que las <option> nativas usen fondo oscuro (sin esto se ven blanco/gris claro).
const selectCls = cn(inputCls, "[&>option]:bg-background [&>option]:text-foreground");

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function StepInfo(props: {
  courses: Course[];
  title: string; setTitle: (s: string) => void;
  description: string; setDescription: (s: string) => void;
  difficulty: Difficulty; setDifficulty: (d: Difficulty) => void;
  tagsInput: string; setTagsInput: (s: string) => void;
  engine: Engine; setEngine: (e: Engine) => void;
  timeLimit: number; setTimeLimit: (n: number) => void;
  courseId: string; setCourseId: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-5">
      <Field label="Título" hint="Mínimo 3 caracteres.">
        <input
          type="text"
          required minLength={3}
          value={props.title}
          onChange={(e) => props.setTitle(e.target.value)}
          placeholder="Clientes en Bogotá"
          disabled={props.disabled}
          className={inputCls}
        />
      </Field>

      <Field label="Descripción" hint="Lo que el estudiante tiene que resolver. Mínimo 10 caracteres.">
        <textarea
          required minLength={10}
          value={props.description}
          onChange={(e) => props.setDescription(e.target.value)}
          placeholder="Devuelve los nombres de los clientes cuya ciudad sea Bogotá."
          disabled={props.disabled}
          className={cn(inputCls, "min-h-24")}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label="Dificultad">
          <div className="flex gap-2">
            {(["EASY", "MEDIUM", "HARD"] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => props.setDifficulty(d)}
                disabled={props.disabled}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  props.difficulty === d
                    ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Motor" hint="Solo postgresql está cableado al runner.">
          <select
            value={props.engine}
            onChange={(e) => props.setEngine(e.target.value as Engine)}
            disabled={props.disabled}
            className={selectCls}
          >
            <option value="postgresql">postgresql</option>
            <option value="mysql">mysql</option>
            <option value="sqlite">sqlite</option>
          </select>
        </Field>

        <Field label="Tiempo límite (ms)">
          <input
            type="number" min={100} step={100}
            value={props.timeLimit}
            onChange={(e) => props.setTimeLimit(Number(e.target.value))}
            disabled={props.disabled}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Tags" hint="Separados por coma.">
        <input
          type="text"
          value={props.tagsInput}
          onChange={(e) => props.setTagsInput(e.target.value)}
          placeholder="SELECT, WHERE, JOIN"
          disabled={props.disabled}
          className={inputCls}
        />
      </Field>

      <Field label="Curso" hint="El reto pertenece a un curso tuyo.">
        {props.courses.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No tenés cursos. Creá uno primero en{" "}
            <Link href="/dashboard/courses/new" className="text-accent-orange">
              + Crear curso
            </Link>
            .
          </p>
        ) : (
          <select
            value={props.courseId}
            onChange={(e) => props.setCourseId(e.target.value)}
            disabled={props.disabled}
            className={selectCls}
          >
            {props.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  );
}

function StepSchema({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <Field
        label="DDL del schema"
        hint="Solo CREATE TABLE. El backend rechaza DROP, ALTER, DELETE, INSERT, etc."
      >
        <textarea
          required minLength={10}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(textareaCls, "min-h-72")}
          spellCheck={false}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Endpoint: <code className="font-mono text-foreground/80">PUT /challenges/:id/schema</code>.
        El servicio parsea el DDL con <code className="font-mono">node-sql-parser</code> y persiste{" "}
        <code className="font-mono">parsedTables</code> con metadata estructurada.
      </p>
    </div>
  );
}

function StepTestData({
  name,
  setName,
  sql,
  setSql,
  disabled,
}: {
  name: string;
  setName: (s: string) => void;
  sql: string;
  setSql: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-5">
      <Field label="Nombre del dataset" hint="Etiqueta interna del dataset.">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
          className={inputCls}
        />
      </Field>
      <Field
        label="INSERTs"
        hint="Datos exactos para el sandbox. Para datasets grandes, podrás cambiar a generador (faker) más adelante."
      >
        <textarea
          required minLength={10}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          disabled={disabled}
          className={cn(textareaCls, "min-h-72")}
          spellCheck={false}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Endpoint:{" "}
        <code className="font-mono text-foreground/80">
          POST /challenges/:id/test-data/manual
        </code>
        .
      </p>
    </div>
  );
}

function StepExpected({
  columns, setColumns,
  rows, setRows,
  orderSensitive, setOrderSensitive,
  floatTolerance, setFloatTolerance,
  disabled,
}: {
  columns: string; setColumns: (s: string) => void;
  rows: string; setRows: (s: string) => void;
  orderSensitive: boolean; setOrderSensitive: (b: boolean) => void;
  floatTolerance: number; setFloatTolerance: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-5">
      <Field label="Columnas" hint='CSV con los nombres exactos. Ej: name, total'>
        <input
          type="text"
          required
          value={columns}
          onChange={(e) => setColumns(e.target.value)}
          disabled={disabled}
          className={cn(inputCls, "font-mono")}
        />
      </Field>

      <Field
        label="Filas"
        hint='JSON array de arrays. Ej: [["Ana", 8], ["Beto", 6]].'
      >
        <textarea
          required
          value={rows}
          onChange={(e) => setRows(e.target.value)}
          disabled={disabled}
          className={cn(textareaCls, "min-h-40")}
          spellCheck={false}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Tolerancia decimal" hint="0 = comparación exacta.">
          <input
            type="number" min={0} step={0.01}
            value={floatTolerance}
            onChange={(e) => setFloatTolerance(Number(e.target.value))}
            disabled={disabled}
            className={inputCls}
          />
        </Field>

        <Field label="Sensible al orden" hint="Si está activo, exige mismo orden de filas.">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={orderSensitive}
              onChange={(e) => setOrderSensitive(e.target.checked)}
              disabled={disabled}
              className="h-4 w-4 accent-accent-orange"
            />
            <span className="text-sm text-muted-foreground">
              orderSensitive: {orderSensitive ? "true" : "false"}
            </span>
          </label>
        </Field>
      </div>

      <p className="text-xs text-muted-foreground">
        Endpoint:{" "}
        <code className="font-mono text-foreground/80">
          PUT /challenges/:id/expected-result
        </code>
        .
      </p>
    </div>
  );
}

function StepPublish(props: {
  title: string;
  description: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimit: number;
  courseCode: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-foreground/[0.03] p-5">
        <div className="flex items-center gap-3">
          <DifficultyChip level={props.difficulty} />
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
            {props.courseCode}
          </span>
        </div>
        <h3 className="mt-3 text-xl">{props.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {props.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {props.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[0.65rem] font-mono text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Time limit: <span className="font-mono text-foreground/80">{props.timeLimit}ms</span>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Al publicar, el reto queda visible para los estudiantes inscritos en el curso.
        Endpoint:{" "}
        <code className="font-mono text-foreground/80">
          PATCH /challenges/:id/status
        </code>{" "}
        con <code className="font-mono">status: "published"</code>.
      </p>
    </div>
  );
}

// ============================================================
// Samples - pre-populated para el demo
// ============================================================
const SAMPLE_SCHEMA = `CREATE TABLE customers (
  id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  city VARCHAR(80) NOT NULL
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  total DECIMAL(10,2) NOT NULL
);`;

const SAMPLE_SEED = `INSERT INTO customers (id, name, city) VALUES
  (1, 'Ana López', 'Bogotá'),
  (2, 'Beto García', 'Medellín'),
  (3, 'Carla Romero', 'Cali'),
  (4, 'Diego Vargas', 'Bogotá');

INSERT INTO orders (id, customer_id, total) VALUES
  (1, 1, 100000.00),
  (2, 1, 250000.00),
  (3, 2, 90000.00);`;
