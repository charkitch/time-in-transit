import { useEffect, useRef } from 'react';
import type { RuntimeProfile } from '../../runtime/runtimeProfile';

export function useMobileOrientation(runtimeProfile: RuntimeProfile | null): void {
  const orientationLockAttemptedRef = useRef(false);

  useEffect(() => {
    if (!runtimeProfile?.isMobile || orientationLockAttemptedRef.current) return;
    const orientationApi = screen.orientation as (ScreenOrientation & {
      lock?: (orientation: 'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary') => Promise<void>;
    }) | undefined;
    if (!orientationApi?.lock) {
      orientationLockAttemptedRef.current = true;
      return;
    }
    const attemptLock = () => {
      if (orientationLockAttemptedRef.current) return;
      orientationLockAttemptedRef.current = true;
      orientationApi.lock?.('landscape').catch(() => {
        // Browser denied lock (common on iOS/without active user gesture). Keep letterboxed fallback.
      });
    };
    window.addEventListener('pointerdown', attemptLock, { once: true });
    window.addEventListener('touchstart', attemptLock, { once: true });
    window.addEventListener('keydown', attemptLock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', attemptLock);
      window.removeEventListener('touchstart', attemptLock);
      window.removeEventListener('keydown', attemptLock);
    };
  }, [runtimeProfile]);
}
