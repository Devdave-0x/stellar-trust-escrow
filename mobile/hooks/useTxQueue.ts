import { useEffect, useState } from 'react';
import { getTxQueue, subscribeTxQueue } from '../services/txRetryRunner';
import type { QueuedTransaction } from '../services/txRetryQueue';

/** The retry queue, re-read whenever it changes. */
export function useTxQueue(): QueuedTransaction[] {
  const [queue, setQueue] = useState<QueuedTransaction[]>(getTxQueue);
  useEffect(() => subscribeTxQueue(() => setQueue(getTxQueue())), []);
  return queue;
}
