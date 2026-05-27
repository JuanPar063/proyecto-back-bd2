# Arquitectura - SQL Judge

> **Owner:** Dayana Molina, lider de arquitectura.
> Este documento describe la arquitectura de la implementacion final del backend SQL Judge.

---

## 1. Contexto del sistema

SQL Judge es una plataforma backend para crear cursos, retos SQL, datasets de prueba, resultados esperados, evaluaciones, submissions, reportes academicos y recomendaciones automaticas de mejora sobre consultas SQL.

La implementacion final incluye los siguientes modulos NestJS:

- `auth`
- `users`
- `courses`
- `challenges`
- `schemas`
- `test-data`
- `submissions`
- `evaluations`
- `ai-assistant`
- `reports`
- `demo`
- `health`

El sistema usa NestJS, Prisma, PostgreSQL, Redis, BullMQ, Docker Compose, JWT y un worker independiente ubicado en `worker/src`.

---

## 2. Vista de despliegue

```mermaid
flowchart LR
  CLIENT["Cliente HTTP<br/>Postman / Swagger UI"]

  subgraph DockerHost["Docker Host"]
    subgraph Compose["Docker Compose"]
      API["API NestJS<br/>REST + Swagger<br/>JWT Guards"]
      PG[("PostgreSQL principal<br/>sqljudge")]
      REDIS[("Redis 7<br/>BullMQ + Cache")]
      WORKER["Worker SQL<br/>worker/src<br/>BullMQ consumer"]
      REPORTS["Reports / Leaderboard<br/>servicio logico en API"]
      AI["AI Assistant Service<br/>reglas + LLM opcional/stub"]
    end

    subgraph RunnerEnv["Runner SQL en Docker<br/>ambiente aislado por submission"]
      RUNNER["PostgreSQL temporal<br/>schema + test data + query"]
    end
  end

  CLIENT -->|HTTP / JWT| API
  API -->|Prisma| PG
  API -->|enqueue submission jobs| REDIS
  API --> REPORTS
  REPORTS -->|read/write TTL corto| REDIS
  REPORTS -->|metricas persistidas| PG

  REDIS -->|deliver jobs| WORKER
  WORKER -->|update submission status/result| PG
  WORKER -->|docker socket| RUNNER
  WORKER -->|recommendation request| AI
  AI -->|RecommendationRepository| PG
```

Notas operativas:

- La base principal `sqljudge` almacena usuarios, cursos, retos, schemas, datasets, resultados esperados, submissions, evaluaciones, reportes derivados y recomendaciones.
- La base principal no ejecuta SQL enviado por estudiantes.
- El SQL de estudiantes se ejecuta unicamente en el Runner SQL, dentro de un contenedor Docker temporal y aislado.
- El runner aplica `SchemaScript`, carga `TestDataset`, ejecuta la query del estudiante y destruye el ambiente al finalizar.
- El runner opera con limites de CPU, memoria y tiempo de ejecucion.
- Redis se usa para BullMQ y para cache de reportes/leaderboard.

---

## 3. Modelo de dominio

```mermaid
classDiagram
  class User {
    +id: UUID
    +email: string
    +passwordHash: string
    +fullName: string
    +role: ADMIN | PROFESSOR | STUDENT
    +isActive: boolean
  }

  class Course {
    +id: UUID
    +name: string
    +code: string
    +period: string
    +groupName: string
    +professorId: UUID
    +isActive: boolean
  }

  class Enrollment {
    +id: UUID
    +courseId: UUID
    +studentId: UUID
    +enrolledAt: DateTime
  }

  class Challenge {
    +id: UUID
    +title: string
    +description: text
    +difficulty: EASY | MEDIUM | HARD
    +tags: string[]
    +databaseEngine: postgresql | mysql | sqlite
    +timeLimit: int
    +status: draft | published | archived
    +courseId: UUID
    +createdById: UUID
  }

  class SchemaScript {
    +id: UUID
    +challengeId: UUID
    +ddl: text
    +parsedTables: Json
    +version: int
  }

  class TestDataset {
    +id: UUID
    +challengeId: UUID
    +name: string
    +kind: MANUAL_INSERT | GENERATOR_CONFIG
    +sql: text
    +generatorConfig: Json
  }

  class ExpectedResult {
    +id: UUID
    +challengeId: UUID
    +columns: string[]
    +rows: Json
    +orderSensitive: boolean
    +floatTolerance: float
  }

  class Submission {
    +id: UUID
    +studentId: UUID
    +challengeId: UUID
    +evaluationAttemptId: UUID
    +query: text
    +status: SubmissionStatus
    +score: int
    +scoreBreakdown: Json
    +executionTimeMs: int
    +resultData: Json
  }

  class Recommendation {
    +id: UUID
    +submissionId: UUID
    +explanation: text
    +suggestedIndexes: string[]
    +rewriteSql: text
    +warnings: Json
    +impact: text
    +highestSeverity: info | warning | critical
    +qualityScore: Json
  }

  class Evaluation {
    +id: UUID
    +name: string
    +description: text
    +courseId: UUID
    +startDate: DateTime
    +endDate: DateTime
    +durationMinutes: int
    +maxAttempts: int
    +resultsVisibility: EvaluationResultsVisibility
  }

  class EvaluationChallenge {
    +id: UUID
    +evaluationId: UUID
    +challengeId: UUID
    +position: int
  }

  class EvaluationAttempt {
    +id: UUID
    +evaluationId: UUID
    +studentId: UUID
    +attemptNumber: int
    +startedAt: DateTime
    +endsAt: DateTime
    +submittedAt: DateTime
  }

  User "1" --> "0..*" Course : ensena
  User "1" --> "0..*" Enrollment : se inscribe mediante
  Course "1" --> "0..*" Enrollment : tiene
  Course "1" --> "0..*" Challenge : tiene
  Course "1" --> "0..*" Evaluation : tiene

  User "1" --> "0..*" Challenge : crea
  Challenge "1" --> "0..1" SchemaScript : tiene
  Challenge "1" --> "0..*" TestDataset : tiene
  Challenge "1" --> "0..1" ExpectedResult : tiene
  Challenge "1" --> "0..*" Submission : recibe

  Evaluation "1" --> "0..*" EvaluationChallenge : agrupa
  EvaluationChallenge "*" --> "1" Challenge : referencia
  Evaluation "1" --> "0..*" EvaluationAttempt : tiene

  EvaluationAttempt "1" --> "0..*" Submission : contiene
  Submission "*" --> "1" User : pertenece a
  Submission "*" --> "1" Challenge : pertenece a
  Submission "1" --> "0..*" Recommendation : tiene
```

### Invariantes principales

- Solo profesores y administradores pueden crear cursos, retos, schemas, datasets y resultados esperados.
- Un `Course` pertenece a un profesor mediante `professorId`.
- Un estudiante se vincula a un curso mediante `Enrollment`.
- Un `Challenge` pertenece a un curso y se publica solo cuando tiene los insumos necesarios.
- Un `Challenge` puede tener un `SchemaScript`, multiples `TestDataset` y un `ExpectedResult`.
- Un `ExpectedResult` existe como entidad separada para permitir comparacion deterministica.
- Una `Evaluation` agrupa retos mediante `EvaluationChallenge`.
- Una `EvaluationAttempt` representa el intento de un estudiante dentro de una evaluacion.
- Una `Submission` pertenece a un estudiante y a un reto.
- Una `Submission` puede pertenecer a una `EvaluationAttempt`.
- Las `Recommendation` se persisten como entidad separada asociada a la submission evaluada.
- El SQL de estudiantes nunca se ejecuta en la base principal.

---

## 4. Vista de componentes - Clean Architecture

```mermaid
flowchart TB
  subgraph Presentation["Presentation"]
    AuthCtrl["AuthController"]
    CoursesCtrl["CoursesController"]
    ChallengesCtrl["ChallengesController"]
    SubmissionsCtrl["SubmissionsController"]
    EvaluationsCtrl["EvaluationsController"]
    ReportsCtrl["ReportsController"]
    AiCtrl["AiAssistantController"]
    SupportCtrl["Users / Schemas / TestData / Demo / Health Controllers"]
  end

  subgraph Application["Application"]
    AuthUC["Auth Use Cases"]
    CoursesUC["Courses Use Cases"]
    ChallengesUC["Challenges Use Cases"]
    SubmissionsUC["Submissions Use Cases"]
    EvaluationsUC["Evaluations Use Cases"]
    ReportsUC["Reports Use Cases"]
    AiUC["AI Assistant Use Cases"]
  end

  subgraph Domain["Domain"]
    Entities["Entities"]
    ValueObjects["Value Objects"]
    Ports["Ports"]
    DomainExceptions["Domain Exceptions"]
  end

  subgraph Infrastructure["Infrastructure"]
    PrismaRepos["Prisma Repositories"]
    BullProducers["BullMQ Producers"]
    BullWorker["BullMQ Worker"]
    RedisCache["Redis Cache"]
    DockerRunner["Docker Runner Adapter"]
    AiAdapter["AI Recommendation Adapter"]
    JwtGuards["JWT Guards / Roles Guards"]
    PG[("PostgreSQL")]
    Redis[("Redis")]
  end

  AuthCtrl --> AuthUC
  CoursesCtrl --> CoursesUC
  ChallengesCtrl --> ChallengesUC
  SubmissionsCtrl --> SubmissionsUC
  EvaluationsCtrl --> EvaluationsUC
  ReportsCtrl --> ReportsUC
  AiCtrl --> AiUC
  SupportCtrl --> CoursesUC
  SupportCtrl --> ChallengesUC

  AuthCtrl --> JwtGuards
  CoursesCtrl --> JwtGuards
  ChallengesCtrl --> JwtGuards
  SubmissionsCtrl --> JwtGuards
  EvaluationsCtrl --> JwtGuards
  ReportsCtrl --> JwtGuards
  AiCtrl --> JwtGuards

  AuthUC --> Entities
  CoursesUC --> Entities
  ChallengesUC --> Entities
  SubmissionsUC --> Entities
  EvaluationsUC --> Entities
  ReportsUC --> Entities
  AiUC --> Entities

  AuthUC --> Ports
  CoursesUC --> Ports
  ChallengesUC --> Ports
  SubmissionsUC --> Ports
  EvaluationsUC --> Ports
  AiUC --> Ports

  Ports -.implemented by.-> PrismaRepos
  PrismaRepos --> PG

  SubmissionsUC -->|enqueue job| BullProducers
  BullProducers --> Redis
  Redis --> BullWorker

  BullWorker -->|load context and persist result| PrismaRepos
  BullWorker -->|execute isolated SQL| DockerRunner
  BullWorker -->|generate recommendation| AiAdapter
  AiAdapter --> AiUC

  ReportsUC -->|read/write TTL corto| RedisCache
  ReportsUC -->|query persisted submissions| PrismaRepos
  RedisCache --> Redis

  DockerRunner --> Runner["Runner SQL Docker<br/>PostgreSQL temporal"]
```

### Reglas de dependencia

- `domain` no depende de NestJS, Prisma, BullMQ, Redis ni Docker.
- `application` orquesta casos de uso y depende de abstracciones del dominio.
- `infrastructure` implementa persistencia, colas, cache, runner, guardas JWT y adaptadores externos.
- `presentation` expone controladores HTTP, DTOs, Swagger y guardas.
- El modulo de submissions encola trabajos en BullMQ.
- El worker consume trabajos, usa el runner aislado y consulta el asistente IA.
- Reports calcula metricas desde datos persistidos y usa Redis Cache para consultas pesadas.

---

## 5. Flujo end-to-end final

```mermaid
sequenceDiagram
  actor Professor as Profesor
  actor Student as Estudiante
  participant API as API NestJS
  participant PG as PostgreSQL principal
  participant RB as Redis / BullMQ
  participant Worker as Worker SQL
  participant Runner as Runner SQL Docker
  participant AI as AI Assistant Service
  participant Reports as Reports / Leaderboard

  Professor->>API: Crear curso
  API->>PG: INSERT Course

  Professor->>API: Crear reto en draft
  API->>PG: INSERT Challenge status=draft

  Professor->>API: Cargar SchemaScript
  API->>PG: UPSERT SchemaScript

  Professor->>API: Cargar TestDataset
  API->>PG: INSERT TestDataset

  Professor->>API: Cargar ExpectedResult
  API->>PG: UPSERT ExpectedResult

  Professor->>API: Publicar reto
  API->>PG: UPDATE Challenge status=published

  Student->>API: Enviar submission
  API->>PG: INSERT Submission status=QUEUED
  API->>RB: Enqueue submission job
  API-->>Student: 202 Accepted

  RB-->>Worker: Deliver job
  Worker->>PG: UPDATE Submission status=RUNNING
  Worker->>PG: Leer Challenge, SchemaScript, TestDataset, ExpectedResult

  Worker->>Runner: Crear ambiente aislado
  Runner->>Runner: Aplicar schema
  Runner->>Runner: Cargar test dataset
  Runner->>Runner: Ejecutar query del estudiante
  Runner-->>Worker: SqlExecutionResult

  Worker->>Worker: Comparar contra ExpectedResult
  Worker->>Worker: Calcular score

  Worker->>AI: Generar Recommendation
  AI->>PG: Persistir Recommendation
  AI-->>Worker: Resultado de recomendacion

  Worker->>PG: Persistir status final, score, feedback y resultData

  Reports->>PG: Leer submissions persistidos
  Reports->>RB: Leer/escribir metricas cacheadas
  Reports-->>API: Reportes y leaderboard
```

---

## 6. Estados de Challenge

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> published
  draft --> archived
  published --> archived
```

Reglas:

- `draft`: reto editable, todavia no disponible para estudiantes.
- `published`: reto disponible para submissions.
- `archived`: reto cerrado para nuevas submissions.

---

## 7. Estados de Submission

```mermaid
stateDiagram-v2
  [*] --> QUEUED
  QUEUED --> RUNNING
  RUNNING --> ACCEPTED
  RUNNING --> WRONG_ANSWER
  RUNNING --> SYNTAX_ERROR
  RUNNING --> TIME_LIMIT_EXCEEDED
  RUNNING --> RUNTIME_ERROR
  RUNNING --> OPTIMIZATION_REQUIRED
```

Estados finales:

- `ACCEPTED`: resultado correcto.
- `WRONG_ANSWER`: la query ejecuta, pero no coincide con `ExpectedResult`.
- `SYNTAX_ERROR`: error de sintaxis SQL.
- `TIME_LIMIT_EXCEEDED`: supero el limite de tiempo configurado.
- `RUNTIME_ERROR`: error de ejecucion o fallo del runner.
- `OPTIMIZATION_REQUIRED`: la respuesta puede ser correcta, pero requiere mejoras relevantes detectadas por el asistente.

---

## 8. Seguridad de ejecucion SQL

La ejecucion de SQL de estudiantes se considera entrada no confiable.

Reglas obligatorias:

- La API HTTP nunca ejecuta SQL de estudiantes.
- La base principal `sqljudge` nunca ejecuta SQL de estudiantes.
- Toda submission entra por cola y se procesa de forma asincrona.
- El worker crea un ambiente Docker temporal para cada evaluacion.
- El runner aplica schema y test data en una base temporal.
- El runner ejecuta solo consultas permitidas y con timeout.
- El contenedor del runner se destruye al finalizar, incluso ante error.
- El runner usa limites de CPU, memoria y tiempo.
- Se bloquean operaciones destructivas o administrativas como `DROP`, `DELETE`, `UPDATE`, `ALTER`, `TRUNCATE`, `GRANT` y `REVOKE`.
- Los resultados se comparan contra `ExpectedResult`, no contra consultas ejecutadas en la base principal.

---

## 9. Diagrama de reportes

```mermaid
flowchart TB
  ReportsController["ReportsController"]
  ReportsService["ReportsService"]
  RedisCache[("Redis Cache<br/>TTL corto")]
  Prisma["Prisma"]
  PostgreSQL[("PostgreSQL principal")]

  StudentReport["Reporte por estudiante"]
  ChallengeReport["Reporte por reto"]
  CourseReport["Reporte por curso"]
  Leaderboard["Leaderboard"]

  ReportsController --> ReportsService

  ReportsService -->|read/write cache| RedisCache
  ReportsService -->|cache miss / datos base| Prisma
  Prisma --> PostgreSQL

  ReportsService --> StudentReport
  ReportsService --> ChallengeReport
  ReportsService --> CourseReport
  ReportsService --> Leaderboard
```

Los reportes y leaderboard se calculan desde submissions persistidos. Redis se usa como cache de TTL corto para evitar recomputar consultas pesadas de forma innecesaria.

---

## 10. Diagrama de AI Assistant

```mermaid
flowchart TB
  Worker["Worker SQL"]
  AiService["AiAssistantService"]
  RuleEngine["RuleEngine"]
  LlmClient["LlmClient<br/>opcional/stub"]
  Builder["RecommendationBuilder"]
  Repo["RecommendationRepository"]
  PostgreSQL[("PostgreSQL principal")]

  Worker --> AiService
  AiService --> RuleEngine
  AiService --> LlmClient
  AiService --> Builder
  RuleEngine --> Builder
  LlmClient --> Builder
  Builder --> Repo
  Repo --> PostgreSQL
```

El asistente usa un enfoque hibrido: reglas deterministicas para detectar patrones conocidos y un cliente LLM opcional o stub para enriquecer la explicacion. Las recomendaciones se persisten como entidad separada.

---

## 11. Decisiones arquitectonicas

| ID | Decision | Estado |
|----|----------|--------|
| ADR-001 | NestJS como framework backend principal por modularidad, DI y soporte para arquitectura por capas. | Adoptada |
| ADR-002 | Prisma como ORM para type-safety, migraciones y claridad del modelo relacional. | Adoptada |
| ADR-003 | PostgreSQL como base principal para persistencia transaccional. | Adoptada |
| ADR-004 | Redis como infraestructura compartida para BullMQ y cache de reportes. | Adoptada |
| ADR-005 | JWT y guards por roles para autenticacion y autorizacion HTTP. | Adoptada |
| ADR-006 | Clean Architecture por modulo para separar presentation, application, domain e infrastructure. | Adoptada |
| ADR-007 | La base principal no ejecuta SQL de estudiantes. | Adoptada |
| ADR-008 | Runner SQL en Docker para aislamiento de ejecucion. | Adoptada |
| ADR-009 | Evaluacion asincrona con BullMQ para desacoplar API y ejecucion SQL. | Adoptada |
| ADR-010 | ExpectedResult separado para comparacion deterministica. | Adoptada |
| ADR-011 | IA hibrida basada en reglas y cliente LLM opcional/stub. | Adoptada |
| ADR-012 | Recommendations persistidas como entidad separada. | Adoptada |
| ADR-013 | Leaderboard calculado desde submissions persistidos. | Adoptada |
| ADR-014 | Reportes pesados cacheados en Redis con TTL corto. | Adoptada |
| ADR-015 | Worker independiente en `worker/src` para procesar submissions y operar el runner. | Adoptada |
| ADR-016 | Runner con limites de CPU, memoria y tiempo para controlar riesgo operativo. | Adoptada |

Si una decision cambia, se debe actualizar este documento y el ADR correspondiente antes de mergear.

---
