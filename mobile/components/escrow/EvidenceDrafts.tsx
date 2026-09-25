import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import Button from '../ui/Button';
import type { EvidenceDraft } from '../../services/evidenceDrafts';

interface EvidenceDraftsProps {
  drafts: EvidenceDraft[];
  onSave: (description: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Write dispute evidence that is saved on the device and uploaded when
 * online. Drafts can be deleted until they have been uploaded.
 */
export default function EvidenceDrafts({ drafts, onSave, onDelete }: EvidenceDraftsProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      onSave(text);
      setText('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the draft.');
    }
  };

  return (
    <View style={styles.container} testID="evidence-drafts">
      <Text style={styles.title}>Evidence</Text>
      <Text style={styles.help}>
        Saved on this device and uploaded automatically when you're online.
      </Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Describe what happened, with dates and references"
        placeholderTextColor="#6b7280"
        multiline
        accessibilityLabel="Evidence description"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title="Save evidence" onPress={handleSave} variant="secondary" />

      {drafts.map((draft) => (
        <View key={draft.id} style={styles.draft}>
          <View style={styles.draftText}>
            <Text style={styles.draftBody} numberOfLines={3}>
              {draft.description}
            </Text>
            <Text style={draft.status === 'failed' ? styles.failed : styles.pending}>
              {draft.status === 'failed'
                ? `Not uploaded: ${draft.lastError ?? 'rejected by the server'}`
                : 'Waiting to upload'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onDelete(draft.id)}
            accessibilityRole="button"
            accessibilityLabel="Delete draft"
          >
            <Text style={styles.delete}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16, gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#f9fafb' },
  help: { fontSize: 12, color: '#9ca3af' },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 10,
    color: '#f9fafb',
    textAlignVertical: 'top',
  },
  error: { fontSize: 12, color: '#ef4444' },
  draft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 8,
    padding: 10,
  },
  draftText: { flex: 1, gap: 4 },
  draftBody: { fontSize: 13, color: '#e5e7eb' },
  pending: { fontSize: 12, color: '#fbbf24' },
  failed: { fontSize: 12, color: '#fb923c' },
  delete: { fontSize: 13, color: '#9ca3af', fontWeight: '600' },
});
