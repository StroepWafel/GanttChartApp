import { useState, useEffect, useCallback } from 'react';
import { getVersion } from '../api';

const POLL_INTERVAL_MS = 30_000;
const RETRY_FASTER_MS = 5_000; // When disconnected, check more often

/**
 * Returns { online, serverReachable }.
 * - online: navigator.onLine (device has network)
 * - serverReachable: when online, whether the API server is reachable
 */
export function useServerConnected(): { online: boolean; serverReachable: boolean } {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [serverReachable, setServerReachable] = useState(true);

  const checkServer = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      await getVersion();
      setServerReachable(true);
    } catch {
      setServerReachable(false);
    }
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      checkServer(); // Re-check immediately when coming back online
    };
    const onOffline = () => {
      setOnline(false);
      setServerReachable(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [checkServer]);

  useEffect(() => {
    checkServer();
    const interval = setInterval(
      () => checkServer(),
      serverReachable ? POLL_INTERVAL_MS : RETRY_FASTER_MS
    );
    return () => clearInterval(interval);
  }, [checkServer, serverReachable]);

  return { online, serverReachable };
}
