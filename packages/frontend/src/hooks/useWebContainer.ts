import { useEffect, useState } from 'react';
import type { WebContainer } from '@webcontainer/api';
import { getWebContainer } from '../lib/webcontainer.js';

export interface WebContainerState {
  wc: WebContainer | null;
  ready: boolean;
  error: string | null;
}

export function useWebContainer(): WebContainerState {
  const [wc, setWc] = useState<WebContainer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWebContainer()
      .then((container) => {
        if (!cancelled) {
          setWc(container);
          setReady(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { wc, ready, error };
}
