export interface ViewportMetrics {
  offsetTop: number;
  offsetLeft: number;
  width: number;
  height: number;
}

export interface WindowViewportFallback {
  innerWidth: number;
  innerHeight: number;
}

export interface ModalViewportVariables {
  "--rlogs-visual-viewport-top": string;
  "--rlogs-visual-viewport-left": string;
  "--rlogs-visual-viewport-width": string;
  "--rlogs-visual-viewport-height": string;
}

function finiteNonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function modalViewportVariables(
  viewport: ViewportMetrics | null,
  fallback: WindowViewportFallback,
): ModalViewportVariables {
  const fallbackWidth = finitePositive(fallback.innerWidth, 1);
  const fallbackHeight = finitePositive(fallback.innerHeight, 1);
  return {
    "--rlogs-visual-viewport-top": `${finiteNonNegative(viewport?.offsetTop ?? 0, 0)}px`,
    "--rlogs-visual-viewport-left": `${finiteNonNegative(viewport?.offsetLeft ?? 0, 0)}px`,
    "--rlogs-visual-viewport-width": `${finitePositive(viewport?.width ?? fallbackWidth, fallbackWidth)}px`,
    "--rlogs-visual-viewport-height": `${finitePositive(viewport?.height ?? fallbackHeight, fallbackHeight)}px`,
  };
}

export function mountModalViewport(): () => void {
  const viewport = window.visualViewport;
  const sync = (): void => {
    const variables = modalViewportVariables(viewport, window);
    for (const [name, value] of Object.entries(variables)) {
      document.documentElement.style.setProperty(name, value);
    }
  };
  sync();
  window.addEventListener("resize", sync, { passive: true });
  viewport?.addEventListener("resize", sync, { passive: true });
  viewport?.addEventListener("scroll", sync, { passive: true });
  return () => {
    window.removeEventListener("resize", sync);
    viewport?.removeEventListener("resize", sync);
    viewport?.removeEventListener("scroll", sync);
  };
}
