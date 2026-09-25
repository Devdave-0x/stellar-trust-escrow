import { useCallback, useReducer } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { uploadReducer, uploadEvidenceFile, waitForScan, type EvidenceFile } from '../lib/evidenceUpload';

const SCAN_LABELS = {
  clean: 'Scan passed — evidence submitted',
  infected: 'File rejected: the virus scan found a threat',
  error: 'Uploaded, but the virus scan could not complete. Support will review it.',
} as const;

/**
 * Uploads one evidence file for a dispute and shows upload progress, a retry
 * action on failure, and the final virus-scan state.
 */
export default function EvidenceUploader({ disputeId, file }: { disputeId: string | number; file: EvidenceFile }) {
  const [state, dispatch] = useReducer(uploadReducer, { phase: 'idle' });

  const start = useCallback(async () => {
    dispatch({ type: 'start' });
    try {
      const record = await uploadEvidenceFile(disputeId, file, (loaded, total) => dispatch({ type: 'progress', loaded, total }));
      const initial = record.scanStatus ?? 'pending';
      dispatch({ type: 'uploaded', evidenceId: record.id, scanStatus: initial });
      if (initial === 'pending') {
        const scanStatus = await waitForScan(disputeId, record.id);
        if (scanStatus === 'pending') {
          dispatch({ type: 'failed', error: 'The virus scan is taking longer than expected. Check again later.' });
        } else {
          dispatch({ type: 'scanned', scanStatus });
        }
      }
    } catch (err: any) {
      dispatch({ type: 'failed', error: err?.response?.data?.error ?? err?.message ?? 'Upload failed' });
    }
  }, [disputeId, file]);

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <Text style={styles.name}>{file.name}</Text>

      {state.phase === 'idle' && (
        <Pressable style={styles.button} onPress={start}>
          <Text style={styles.buttonText}>Upload</Text>
        </Pressable>
      )}

      {state.phase === 'uploading' && (
        <>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${state.progress}%` }]} />
          </View>
          <Text>{state.progress}% uploaded</Text>
        </>
      )}

      {state.phase === 'scanning' && <Text>Uploaded. Scanning for viruses…</Text>}

      {state.phase === 'done' && (
        <Text style={state.scanStatus === 'clean' ? styles.ok : styles.bad}>{SCAN_LABELS[state.scanStatus]}</Text>
      )}

      {state.phase === 'failed' && (
        <>
          <Text style={styles.bad}>{state.error}</Text>
          <Pressable style={styles.button} onPress={start} accessibilityLabel="Retry upload">
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 8, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  name: { fontWeight: '600' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#333', overflow: 'hidden' },
  bar: { height: 8, backgroundColor: '#4f46e5' },
  button: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, backgroundColor: '#4f46e5' },
  buttonText: { color: '#fff', fontWeight: '600' },
  ok: { color: '#22c55e' },
  bad: { color: '#ef4444' },
});
