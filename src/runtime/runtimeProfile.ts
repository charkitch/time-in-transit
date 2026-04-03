export type QualityTier = 'ultra' | 'high' | 'medium';

export interface RuntimeProfile {
  isMobile: boolean;
  isTouchPrimary: boolean;
  isLandscape: boolean;
  pixelRatioCap: number;
  qualityTier: QualityTier;
  minSupportedYear: number;
}

function getViewportSize(): { width: number; height: number } {
  const vv = window.visualViewport;
  if (vv) {
    return { width: vv.width, height: vv.height };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

export function detectRuntimeProfile(): RuntimeProfile {
  const ua = navigator.userAgent.toLowerCase();
  const hasMobileUA = /iphone|ipod|android.*mobile|mobile/.test(ua);
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const isMobile = hasMobileUA || coarsePointer;
  const isTouchPrimary = coarsePointer || navigator.maxTouchPoints > 0;
  const { width, height } = getViewportSize();
  const isLandscape = width >= height;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 2024+ phone baseline with visual-first defaults.
  const qualityTier: QualityTier = isMobile
    ? (reducedMotion ? 'medium' : 'high')
    : 'ultra';
  const pixelRatioCap = isMobile ? 2.25 : Math.max(1, window.devicePixelRatio || 1);

  return {
    isMobile,
    isTouchPrimary,
    isLandscape,
    pixelRatioCap,
    qualityTier,
    minSupportedYear: 2024,
  };
}
