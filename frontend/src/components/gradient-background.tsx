"use client";

import { GrainGradient } from "@paper-design/shaders-react";

/**
 * Fondo del landing y de páginas hero. Usar siempre `-z-10` para que
 * quede detrás del contenido. Las páginas internas (dashboard, results)
 * pueden bajar `intensity` y `softness` para que no compita con datos.
 */
export function GradientBackground({
  intensity = 0.45,
  softness = 0.76,
  speed = 1,
}: {
  intensity?: number;
  softness?: number;
  speed?: number;
}) {
  return (
    <div className="absolute inset-0 -z-10">
      <GrainGradient
        style={{ height: "100%", width: "100%" }}
        colorBack="hsl(0, 0%, 0%)"
        softness={softness}
        intensity={intensity}
        noise={0}
        shape="corners"
        offsetX={0}
        offsetY={0}
        scale={1}
        rotation={0}
        speed={speed}
        colors={[
          "hsl(14, 100%, 57%)",
          "hsl(45, 100%, 51%)",
          "hsl(340, 82%, 52%)",
        ]}
      />
    </div>
  );
}
