import { useCallback, useEffect, useState } from 'react';
import { TRAVEL_TERMS } from '../../game/constants';
import type { AutosaveKind, SlotMeta } from './saveSlots';
import { readAllSlotMetas, readAutosaveMetas } from './saveSlots';
import { SaveSlotGrid } from './SaveSlotGrid';
import styles from './MainMenu.module.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface MainMenuProps {
  onNewGame: () => void;
  onResume: () => void;
  onSaveToSlot: (index: number) => Promise<void>;
  onLoadFromSlot: (index: number) => Promise<void>;
  onLoadAutosave: (kind: AutosaveKind) => Promise<void>;
  invertControls: boolean;
  onToggleInvertControls: () => void;
  buildLabel: string;
  initialView?: 'main' | 'load';
}

export function MainMenu({ onNewGame, onResume, onSaveToSlot, onLoadFromSlot, onLoadAutosave, invertControls, onToggleInvertControls, buildLabel, initialView = 'main' }: MainMenuProps) {
  const [view, setView] = useState<'main' | 'controls' | 'fullscreen' | 'save' | 'load'>(initialView);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState<string>('');
  const [slots, setSlots] = useState<(SlotMeta | null)[]>(Array(5).fill(null));
  const [autosaveMetas, setAutosaveMetas] = useState<Record<AutosaveKind, SlotMeta | null>>({
    interval: null,
    system_entry: null,
    last_system_entry: null,
  });

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
  const isChromium = /chrome|chromium|crios|edg|edgios/.test(ua);
  const isMobile = isIOS || isAndroid;

  const refreshSlots = useCallback(async () => {
    const [slotMetas, autoMetas] = await Promise.all([readAllSlotMetas(), readAutosaveMetas()]);
    setSlots(slotMetas);
    setAutosaveMetas(autoMetas);
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
    };
    const onAppInstalled = () => {
      setInstallMessage('Installed. Launch from your home screen for fullscreen mode.');
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (view === 'save' || view === 'load') {
      refreshSlots();
    }
  }, [view, refreshSlots]);

  const handleInstallPrompt = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstallMessage('Install accepted. The app will be available on your home screen.');
    } else {
      setInstallMessage('Install dismissed. You can come back here and try again anytime.');
    }
    setDeferredPrompt(null);
  };

  const handleSaveSlotClick = async (index: number) => {
    await onSaveToSlot(index);
    await refreshSlots();
  };

  const handleLoadSlotClick = async (index: number) => {
    await onLoadFromSlot(index);
  };

  if (view === 'save') {
    return (
      <div className={styles.overlay}>
        <div className={styles.panel}>
          <SaveSlotGrid
            mode="save"
            slots={slots}
            isSafari={isSafari}
            onSlotClick={handleSaveSlotClick}
            onBack={() => setView('main')}
          />
        </div>
      </div>
    );
  }

  if (view === 'load') {
    return (
      <div className={styles.overlay}>
        <div className={styles.panel}>
          <SaveSlotGrid
            mode="load"
            slots={slots}
            autosaves={autosaveMetas}
            isSafari={isSafari}
            onSlotClick={handleLoadSlotClick}
            onLoadAutosave={onLoadAutosave}
            onBack={() => setView('main')}
          />
        </div>
      </div>
    );
  }

  if (view === 'controls') {
    return (
      <div className={styles.overlay}>
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.title}>CONTROLS</div>
            <div className={styles.buildTag} aria-hidden="true">{buildLabel}</div>
          </div>
          <div className={styles.controlsList}>
            <div className={styles.controlRow}>
              <span className={styles.key}>W / S</span>
              <span className={styles.action}>PITCH UP / DOWN</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>A / D</span>
              <span className={styles.action}>ROLL LEFT / RIGHT</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>Q / E</span>
              <span className={styles.action}>YAW LEFT / RIGHT</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>SPACE</span>
              <span className={styles.action}>THRUST</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>SHIFT</span>
              <span className={styles.action}>BOOST</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>TAB</span>
              <span className={styles.action}>CYCLE TARGET</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>F</span>
              <span className={styles.action}>DOCK / LAND</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>G</span>
              <span className={styles.action}>CLUSTER MAP</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>1</span>
              <span className={styles.action}>SYSTEM MAP</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>J</span>
              <span className={styles.action}>{TRAVEL_TERMS.modeNameUpper} JUMP</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>H</span>
              <span className={styles.action}>HAIL / COMMUNICATE</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>ESC</span>
              <span className={styles.action}>MENU / BACK</span>
            </div>
          </div>
          <button className={styles.menuBtn} onClick={onToggleInvertControls}>
            INVERT CONTROLS: {invertControls ? 'ON' : 'OFF'}
          </button>
          <button className={styles.menuBtn} onClick={() => setView('main')}>
            BACK
          </button>
        </div>
      </div>
    );
  }

  if (view === 'fullscreen') {
    return (
      <div className={styles.overlay}>
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.title}>FULL SCREEN</div>
            <div className={styles.buildTag} aria-hidden="true">{buildLabel}</div>
          </div>
          <p className={styles.helpText}>
            Add this game to your home screen to run it like an app in fullscreen, with faster launch and fewer browser UI distractions.
          </p>

          {isStandalone && (
            <p className={styles.statusText}>
              This app is already running in standalone mode from your home screen.
            </p>
          )}

          {!isStandalone && deferredPrompt && (
            <button className={styles.menuBtn} onClick={handleInstallPrompt}>
              SHOW INSTALL OPTION
            </button>
          )}

          {!isStandalone && !deferredPrompt && isIOS && isSafari && (
            <p className={styles.statusText}>
              iPhone/iPad tip: Tap Share, then Add to Home Screen.
            </p>
          )}

          {!isStandalone && !deferredPrompt && isIOS && !isSafari && (
            <p className={styles.statusText}>
              iPhone/iPad: open this page in Safari, then tap Share and Add to Home Screen.
            </p>
          )}

          {!isStandalone && !deferredPrompt && isAndroid && isChromium && (
            <p className={styles.statusText}>
              Android: open browser menu and use Install app or Add to Home screen.
            </p>
          )}

          {!isStandalone && !deferredPrompt && !isIOS && !(isAndroid && isChromium) && (
            <p className={styles.statusText}>
              Install is not currently available in this browser session. Try from a supported mobile browser over HTTPS.
            </p>
          )}

          {installMessage && <p className={styles.statusText}>{installMessage}</p>}

          <button className={styles.menuBtn} onClick={() => setView('main')}>
            BACK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>TIME IN TRANSIT</div>
          <div className={styles.buildTag} aria-hidden="true">{buildLabel}</div>
        </div>
        <div className={styles.menuOptions}>
          <button className={styles.menuBtn} onClick={onResume}>
            RESUME
          </button>
          <button className={styles.menuBtn} onClick={() => setView('controls')}>
            CONTROLS
          </button>
          <button className={styles.menuBtn} onClick={() => setView('save')}>
            SAVE GAME
          </button>
          <button className={styles.menuBtn} onClick={() => setView('load')}>
            LOAD GAME
          </button>
          {isMobile && !isStandalone && (
            <button className={styles.menuBtn} onClick={() => setView('fullscreen')}>
              FIND OUT ABOUT FULL SCREEN
            </button>
          )}
          <button className={styles.menuBtn} onClick={onNewGame}>
            NEW GAME
          </button>
          {isStandalone && (
            <button className={styles.menuBtn} onClick={() => window.location.reload()}>
              CHECK FOR UPDATES
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
