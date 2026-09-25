import { useEffect, useState } from 'react';
import { getEvidenceDrafts, subscribeEvidenceDrafts } from '../services/evidenceDraftRunner';
import type { EvidenceDraft } from '../services/evidenceDrafts';

/** Evidence drafts for one escrow, re-read whenever they change. */
export function useEvidenceDrafts(escrowId: string): EvidenceDraft[] {
  const [drafts, setDrafts] = useState<EvidenceDraft[]>(() => getEvidenceDrafts(escrowId));
  useEffect(() => {
    setDrafts(getEvidenceDrafts(escrowId));
    return subscribeEvidenceDrafts(() => setDrafts(getEvidenceDrafts(escrowId)));
  }, [escrowId]);
  return drafts;
}
