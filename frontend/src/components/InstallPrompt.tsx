import { useState, useEffect, useRef } from 'react';
import './InstallPrompt.css';

const STORAGE_KEY = 'gantt_mobile_install_response';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [phase, setPhase] = useState<'prompt' | 'denied' | 'hidden'>('prompt');
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'accepted' || stored === 'denied') {
      setPhase('hidden');
      return;
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as InstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function handleInstall() {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      deferredPrompt.current.userChoice.then(() => {
        deferredPrompt.current = null;
      });
    }
    setPhase('hidden');
  }

  function handleDeny() {
    setPhase('denied');
  }

  function handleCloseDenied() {
    localStorage.setItem(STORAGE_KEY, 'denied');
    setPhase('hidden');
  }

  if (phase === 'hidden') return null;

  return (
    <div className="install-prompt-overlay" role="dialog" aria-labelledby="install-prompt-title">
      <div className="install-prompt">
        {phase === 'prompt' ? (
          <>
            <h2 id="install-prompt-title">Add to Home Screen</h2>
            <p>
              Install the Gantt Chart app for quick access from your home screen. You’ll get faster loading,
              offline support, and a seamless app-like experience.
            </p>
            <div className="install-prompt-actions">
              <button type="button" className="btn-sm btn-sm-primary" onClick={handleInstall}>
                Add to Home Screen
              </button>
              <button type="button" className="btn-sm btn-sm-danger-outline" onClick={handleDeny}>
                Not now
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="install-prompt-title">No problem</h2>
            <p>
              You can add the app anytime from <strong>Settings → App</strong>.
            </p>
            <button type="button" className="btn-sm" onClick={handleCloseDenied}>
              Got it
            </button>
          </>
        )}
      </div>
    </div>
  );
}
