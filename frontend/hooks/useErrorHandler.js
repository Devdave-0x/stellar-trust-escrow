'use client';

/**
 * useErrorHandler — lets event handlers / async code (fetch failures,
 * rejected promises) escalate to the nearest React error boundary, which
 * otherwise only catches errors thrown during render.
 *
 * Usage:
 *   const throwError = useErrorHandler();
 *   fetchData().catch(throwError);
 */

import { useState, useCallback } from 'react';

export function useErrorHandler() {
  const [, setState] = useState();

  return useCallback((error) => {
    setState(() => {
      throw error instanceof Error ? error : new Error(String(error));
    });
  }, []);
}
