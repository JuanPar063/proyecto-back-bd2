# SQL Judge — Frontend

Frontend Next.js 14 (App Router) para la plataforma SQL Judge. Consume la API REST que vive en `../src/` (backend NestJS) por defecto en `http://localhost:3000/api`.

## Stack

- Next.js 14 (App Router, React Server Components por defecto)
- TypeScript 5
- Tailwind CSS 3
- `@paper-design/shaders-react` para el GrainGradient del landing
- Tipografías: Inter (sans), Instrument Serif (display editorial), JetBrains Mono (mono)

## Paleta

Tomada exacta del shader del landing. Mantener estos tokens al agregar nuevos flujos para conservar coherencia visual.

| Token Tailwind | HSL | Uso |
|----------------|-----|-----|
| `bg-background` | 0 0% 0% | Fondo base (negro absoluto) |
| `text-foreground` | 0 0% 98% | Texto principal |
| `text-muted-foreground` | 0 0% 65% | Texto secundario |
| `bg-accent-orange` | 14 100% 57% | Acento primario, CTAs principales |
| `bg-accent-yellow` | 45 100% 51% | Acento secundario, highlights de éxito parcial |
| `bg-accent-pink` | 340 82% 52% | Acento terciario, errores/wrong answer |
| `border-border` | 0 0% 15% | Bordes sutiles sobre fondo oscuro |
| `text-status-accepted` | 142 71% 45% | Status ACCEPTED |
| `text-status-wrong` | 340 82% 52% | Status WRONG_ANSWER |
| `text-status-warning` | 45 100% 51% | Warnings del asistente IA |
| `text-status-critical` | 14 100% 57% | OPTIMIZATION_REQUIRED, SLOW_QUERY |
| `text-status-timeout` | 280 70% 60% | TIME_LIMIT_EXCEEDED |

## Levantar en local

```bash
cd frontend
npm install
npm run dev
# http://localhost:3001  (3001 para no chocar con la API NestJS en 3000)
```

## Estructura

```
frontend/
├── src/
│   ├── app/
│   │   ├── globals.css         (Tailwind base + utility .grain-overlay)
│   │   ├── layout.tsx          (fuentes + metadata)
│   │   └── page.tsx            (landing con GradientBackground)
│   ├── components/
│   │   └── gradient-background.tsx
│   └── lib/
│       └── utils.ts            (cn helper)
├── tailwind.config.ts          (paleta + fuentes)
└── next.config.mjs
```

## Flujos previstos

Landing está implementado. Pendiente armar manteniendo paleta y tipografías:

- `/login`, `/register` (auth con JWT del backend)
- `/dashboard` (cards de cursos + retos asignados)
- `/courses/[id]` (lista de retos del curso)
- `/challenges/[id]` (editor SQL + descripción + dataset preview)
- `/submissions/[id]` (resultado con score breakdown + feedback IA)
- `/reports` (gráficas con paleta del landing)
- `/evaluations/[id]` (parcial con timer)
- Admin: `/admin/dlq` (dead-letter queue)

## Decisiones para mantener al expandir

- **Background hero**: usar `<GradientBackground />` con `intensity` reducida (0.25-0.35) en páginas internas para no competir con datos.
- **Cards de datos**: `bg-background/40 backdrop-blur-md border-border` (mismo treatment que las features del landing).
- **Botones primarios**: `bg-accent-orange text-background rounded-full`.
- **Botones secundarios**: `border-border bg-background/40 backdrop-blur-sm`.
- **Display headings**: `font-display` (Instrument Serif) para titulares grandes, con `em` en `accent-orange` para énfasis.
- **Mono**: solo para queries SQL, IDs y badges técnicos.
