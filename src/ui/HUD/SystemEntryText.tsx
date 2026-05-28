import { useEffect, useMemo, useState } from 'react';
import { useGameState } from '../../game/GameState';
import type { CrewNarrationLine } from '../../game/engine';

type EntryItem =
  | { kind: 'system'; line: string }
  | { kind: 'crew'; speaker: string; text: string };

export function SystemEntryText() {
  const lines = useGameState(s => s.systemEntryLines);
  const crewNarration = useGameState(s => s.crewNarration);
  const setSystemEntryLines = useGameState(s => s.setSystemEntryLines);
  const [visibleCount, setVisibleCount] = useState(0);
  const [fading, setFading] = useState(false);

  const items: EntryItem[] = useMemo(() => {
    const system: EntryItem[] = (lines ?? []).map(line => ({ kind: 'system', line }));
    const crew: EntryItem[] = (crewNarration ?? []).map((c: CrewNarrationLine) => ({
      kind: 'crew',
      speaker: c.speaker,
      text: c.text,
    }));
    return [...system, ...crew];
  }, [lines, crewNarration]);

  useEffect(() => {
    if (items.length === 0) {
      setVisibleCount(0);
      setFading(false);
      return;
    }

    setVisibleCount(0);
    setFading(false);

    const timers = items.map((_, i) => setTimeout(() => setVisibleCount(i + 1), i * 500));
    timers.push(setTimeout(() => setFading(true), 8000));
    timers.push(setTimeout(() => setSystemEntryLines(null), 10000));

    return () => timers.forEach(clearTimeout);
  }, [items, setSystemEntryLines]);

  if (items.length === 0) return null;

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
      {items.slice(0, visibleCount).map((item, i) => {
        if (item.kind === 'crew') {
          return (
            <div
              key={i}
              style={{
                fontSize: '12px',
                letterSpacing: '2px',
                marginBottom: '8px',
                opacity: 0,
                animation: 'entryLineFade 0.5s ease-out forwards',
              }}
            >
              <span style={{ color: 'var(--color-station)', textShadow: '0 0 10px rgba(68, 204, 255, 0.27)' }}>
                {item.speaker.toUpperCase()}:
              </span>{' '}
              <span style={{ color: '#88ddff', fontStyle: 'italic', textShadow: '0 0 10px #88ddff22' }}>
                &ldquo;{item.text}&rdquo;
              </span>
            </div>
          );
        }

        const isFirst = i === 0;
        const isContested = item.line.startsWith('CONTESTED') || item.line.includes('COMBAT ZONE');
        const isWarning = item.line.includes('FLEET ENGAGEMENT') || item.line.includes('NO LONGER HOLDS');

        let color = '#33FF88';
        if (isContested || isWarning) color = '#FFAA00';

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
            {item.line}
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
