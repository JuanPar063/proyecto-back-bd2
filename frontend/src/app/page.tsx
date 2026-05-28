import { GradientBackground } from "@/components/gradient-background";
import { LoginForm } from "@/components/login-form";

export default function LandingPage() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden">
      <GradientBackground />

      {/* Wordmark anclado al borde superior izquierdo */}
      <p className="absolute left-6 top-6 z-10 text-sm font-medium uppercase tracking-[0.22em] text-foreground/90 md:left-10 md:top-10">
        SQL Judge
      </p>

      {/* Login flotante: centrado vertical, alineado al borde derecho */}
      <div className="relative z-10 flex min-h-dvh items-center justify-end px-6 md:pr-10 lg:pr-16">
        <LoginForm />
      </div>
    </main>
  );
}
