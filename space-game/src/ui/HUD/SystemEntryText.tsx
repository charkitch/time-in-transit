import { useEffect, useState } from 'react';
import { useGameState } from '../../game/GameState';

export function SystemEntryText() {
  const lines = useGameState(s => s.systemEntryLines);
  const setSystemEntryLines = useGameState(s => s.setSystemEntryLines);
  const [visibleCount, setVisibleCount] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!lines || lines.length === 0) {
      setVisibleCount(0);
      setFading(false);
      return;
    }

    setVisibleCount(0);
    setFading(false);

    // Stagger line appearance
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < lines.length; i++) {
      timers.push(setTimeout(() => setVisibleCount(i + 1), i * 500));
    }

    // Start fade after 8 seconds
    timers.push(setTimeout(() => setFading(true), 8000));

    // Clear after fade completes
    timers.push(setTimeout(() => {
      setSystemEntryLines(null);
    }, 10000));

    return () => timers.forEach(clearTimeout);
  }, [lines, setSystemEntryLines]);

  if (!lines || lines.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: '15%',
      left: '50%',
      transform: 'translateX(-50%)',
      textAlign: 'center',
      fontFamily: 'Courier New, monospace',
      pointerEvents: 'none',
      zIndex: 20,
      opacity: fading ? 0 : 1,
      transition: 'opacity 2s ease-out',
    }}>
      {lines.slice(0, visibleCount).map((line, i) => {
        const isFirst = i === 0;
        const isContested = line.startsWith('CONTESTED') || line.includes('COMBAT ZONE');
        const isWarning = line.includes('FLEET ENGAGEMENT') || line.includes('NO LONGER HOLDS');

        let color = '#33FF88';
        if (isContested) color = '#FFAA00';
        if (isWarning) color = '#FFAA00';

        return (
          <div
            key={i}
            style={{
              fontSize: isFirst ? '18px' : '13px',
              letterSpacing: isFirst ? '6px' : '3px',
              color,
              textShadow: `0 0 10px ${color}44`,
              marginBottom: '8px',
              opacity: 0,
              animation: 'entryLineFade 0.5s ease-out forwards',
            }}
          >
            {line}
          </div>
        );
      })}
      <style>{`
        @keyframes entryLineFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
