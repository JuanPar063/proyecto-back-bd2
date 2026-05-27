import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SQL Judge — Plataforma inteligente de práctica SQL",
  description:
    "Evaluación automática de consultas SQL en sandbox Postgres aislado. Comparador determinístico y asistente IA de optimización para cursos de bases de datos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body className="relative min-h-dvh font-sans">{children}</body>
    </html>
  );
}
