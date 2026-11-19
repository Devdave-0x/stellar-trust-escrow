import { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { getCachedEscrow, type Escrow } from '../../services/offlineCache';

function isBiometricEnabled(): boolean {
  return true;
}

export default function EscrowDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    async function authenticate() {
      if (!isBiometricEnabled()) {
        setAuthed(true);
        setAuthChecked(true);
        return;
      }

      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to view escrow details',
          fallbackLabel: 'Use passcode',
        });
        setAuthed(result.success);
      } catch {
        setAuthed(false);
      } finally {
        setAuthChecked(true);
      }
    }

    authenticate();
  }, []);

  useEffect(() => {
    if (!authChecked || !authed || !id) return;

    async function loadEscrow() {
      setIsLoading(true);
      try {
        const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
        const res = await fetch(`${API_URL}/api/escrows/${id}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setEscrow(data);
      } catch {
        const cached = getCachedEscrow(id);
        setEscrow(cached);
      } finally {
        setIsLoading(false);
      }
    }

    loadEscrow();
  }, [id, authChecked, authed]);

  if (!authChecked) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Verifying identity...</Text>
      </View>
    );
  }

  if (!authed) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Authentication required to view escrow details.</Text>
      </View>
/**
 * Escrow Detail Screen — biometric-gated.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useEscrow, useMilestones } from '../../hooks/useEscrows';
import { useWalletStore } from '../../store/useWalletStore';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import MilestoneItem from '../../components/escrow/MilestoneItem';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { truncateAddress, stroopsToXlm, explorerUrl } from '../../lib/stellar';
import { authenticate, isBiometricEnabled } from '../../services/biometrics';

/** Allowed MIME types for dispute evidence uploads. */
export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

/** Maximum allowed evidence file size (10 MB). */
export const MAX_EVIDENCE_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export interface EvidenceFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export type EvidenceValidationResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported-type' | 'too-large'; message: string };

/**
 * Validate a candidate evidence file locally, before any network transfer.
 */
export function validateEvidenceFile(file: EvidenceFile): EvidenceValidationResult {
  if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(file.mimeType as (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number])) {
    return {
      ok: false,
      reason: 'unsupported-type',
      message: `Unsupported file type "${file.mimeType || 'unknown'}". Allowed: JPEG, PNG, WebP, PDF.`,
    };
  }
  if (file.size > MAX_EVIDENCE_FILE_SIZE_BYTES) {
    const maxMb = MAX_EVIDENCE_FILE_SIZE_BYTES / (1024 * 1024);
    return {
      ok: false,
      reason: 'too-large',
      message: `File is too large. Maximum size is ${maxMb} MB.`,
    };
  }
  return { ok: true };
}

export default function EscrowDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const address = useWalletStore((s) => s.address);
  const router = useRouter();
  const [authed, setAuthed] = useState(!isBiometricEnabled());

  const [evidence, setEvidence] = useState<EvidenceFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: escrow, isLoading, refetch } = useEscrow(authed && id ? id : null);
  const { data: milestones = [], isLoading: milestonesLoading } = useMilestones(
    authed && escrow && id ? id : null,
  );

  const pickEvidence = useCallback(async () => {
    setUploadError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ALLOWED_EVIDENCE_MIME_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const candidate: EvidenceFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? '',
        size: asset.size ?? 0,
      };
      const validation = validateEvidenceFile(candidate);
      if (!validation.ok) {
        setUploadError(validation.message);
        return;
      }
      setEvidence(candidate);
    } catch {
      setUploadError('Could not select a file. Please try again.');
    }
  }, []);

  const uploadEvidence = useCallback(async () => {
    if (!evidence || !id) return;
    // Re-validate before any network transfer (guards against stale state).
    const validation = validateEvidenceFile(evidence);
    if (!validation.ok) {
      setUploadError(validation.message);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
      const form = new FormData();
      form.append('evidence', {
        uri: evidence.uri,
        name: evidence.name,
        type: evidence.mimeType,
      } as unknown as Blob);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/api/escrows/${id}/evidence`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(100);
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(form);
      });

      setEvidence(null);
    } catch {
      // Keep `evidence` so the user can retry with the same file.
      setUploadError('Upload failed. Your selected file was kept — tap Retry to try again.');
    } finally {
      setIsUploading(false);
    }
  }, [evidence, id]);

  useEffect(() => {
    if (!authed && isBiometricEnabled()) {
      void authenticate('Authenticate to view escrow details').then((ok) => {
        if (ok) {
          setAuthed(true);
        } else {
          router.back();
        }
      });
    }
  }, [authed, router]);

  // Render skeleton while biometric auth is pending
  if (!authed && isBiometricEnabled()) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Card style={styles.headerCard}>
            <View style={[styles.skeleton, { height: 20, marginBottom: 12 }]} />
            <View style={[styles.skeleton, { height: 40, marginBottom: 8 }]} />
            <View style={[styles.skeleton, { height: 14 }]} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading escrow...</Text>
      </View>
      <SafeAreaView style={styles.safe}>
        <EmptyState icon="⏳" title="Loading escrow…" />
      </SafeAreaView>
    );
  }

  if (!escrow) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Escrow not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Escrow #{escrow.id}</Text>
      <View style={styles.statusRow}>
        <Text style={styles.label}>Status:</Text>
        <Text style={styles.value}>{escrow.status}</Text>
      <SafeAreaView style={styles.safe}>
        <EmptyState
          icon="❌"
          title="Escrow not found"
          subtitle="It may have been removed or you're offline."
        />
      </SafeAreaView>
    );
  }

  const isClient = escrow.clientAddress === address;
  const isFreelancer = escrow.freelancerAddress === address;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || milestonesLoading}
            onRefresh={refetch}
            tintColor="#6366f1"
          />
        }
      >
        {/* Status + amount */}
        <Card style={styles.headerCard}>
          <View style={styles.row}>
            <Text style={styles.escrowId}>Escrow #{escrow.id}</Text>
            <Badge status={escrow.status} />
          </View>
          <Text style={styles.amount}>{stroopsToXlm(escrow.totalAmount)} XLM</Text>
          <Text style={styles.remaining}>
            Remaining: {stroopsToXlm(escrow.remainingBalance)} XLM
          </Text>
          {escrow.deadline && (
            <Text style={styles.deadline}>
              Deadline: {new Date(escrow.deadline).toLocaleDateString()}
            </Text>
          )}
        </Card>

        {/* Parties */}
        <Card style={styles.partiesCard}>
          <PartyRow label="Client" address={escrow.clientAddress} isYou={isClient} />
          <PartyRow label="Freelancer" address={escrow.freelancerAddress} isYou={isFreelancer} />
          {escrow.arbiterAddress && (
            <PartyRow label="Arbiter" address={escrow.arbiterAddress} isYou={false} />
          )}
        </Card>

        {/* Milestones */}
        <Text style={styles.sectionTitle}>Milestones ({milestones.length})</Text>
        <Card>
          {milestones.length === 0 ? (
            <Text style={styles.emptyMilestones}>No milestones yet.</Text>
          ) : (
            milestones.map((m, i) => <MilestoneItem key={m.id} milestone={m} index={i} />)
          )}
        </Card>

        {/* Actions */}
        {escrow.status === 'Active' && (
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <Button
              title="View on Stellar Expert"
              onPress={() => void Linking.openURL(explorerUrl('account', escrow.clientAddress))}
              variant="ghost"
              style={styles.actionBtn}
            />
            {(isClient || isFreelancer) && (
              <Button
                title="Raise Dispute"
                onPress={() =>
                  Alert.alert(
                    'Raise Dispute',
                    'Disputes are handled on-chain. Sign a transaction in your Stellar wallet app.',
                    [{ text: 'OK' }],
                  )
                }
                variant="danger"
                style={styles.actionBtn}
              />
            )}
          </View>
        )}

        {escrow.status === 'Disputed' && (
          <Card style={styles.disputeCard}>
            <Text style={styles.disputeTitle}>⚠️ Dispute Active</Text>
            <Text style={styles.disputeText}>
              This escrow is under dispute. An arbiter will review and resolve it on-chain.
            </Text>

            <View style={styles.evidenceSection}>
              <Text style={styles.evidenceTitle}>Dispute Evidence</Text>
              {evidence ? (
                <Text style={styles.evidenceFile} numberOfLines={1}>
                  {evidence.name} ({Math.ceil(evidence.size / 1024)} KB)
                </Text>
              ) : (
                <Text style={styles.evidenceHint}>
                  Attach a JPEG, PNG, WebP or PDF up to 10 MB.
                </Text>
              )}

              {uploadError && <Text style={styles.evidenceError}>{uploadError}</Text>}

              {isUploading && uploadProgress !== null && (
                <View style={styles.progressRow}>
                  <ActivityIndicator size="small" color="#fb923c" />
                  <Text style={styles.progressText}>Uploading… {uploadProgress}%</Text>
                </View>
              )}

              <Button
                title={evidence ? 'Upload Evidence' : 'Select Evidence'}
                onPress={() => {
                  if (evidence) {
                    void uploadEvidence();
                  } else {
                    void pickEvidence();
                  }
                }}
                disabled={isUploading}
                variant="ghost"
                style={styles.actionBtn}
              />
              {evidence && !isUploading && (
                <Button
                  title="Choose Different File"
                  onPress={() => void pickEvidence()}
                  variant="ghost"
                  style={styles.actionBtn}
                />
              )}
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PartyRow({ label, address, isYou }: { label: string; address: string; isYou: boolean }) {
  return (
    <View style={styles.partyRow}>
      <Text style={styles.partyLabel}>{label}</Text>
      <View style={styles.partyRight}>
        <Text style={styles.partyAddress}>{truncateAddress(address, 8, 6)}</Text>
        {isYou && <Text style={styles.youBadge}>You</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#0f172a',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  label: {
    color: '#94a3b8',
    fontSize: 14,
  },
  value: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { padding: 16, paddingBottom: 48 },
  skeleton: {
    backgroundColor: '#1f2937',
    borderRadius: 6,
  },
  headerCard: { marginBottom: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  escrowId: { fontSize: 14, fontWeight: '700', color: '#9ca3af' },
  amount: { fontSize: 32, fontWeight: '800', color: '#f9fafb', marginBottom: 4 },
  remaining: { fontSize: 13, color: '#6b7280' },
  deadline: { fontSize: 13, color: '#f59e0b', marginTop: 4 },
  partiesCard: { marginBottom: 20 },
  partyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  partyLabel: { fontSize: 13, color: '#6b7280', width: 80 },
  partyRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partyAddress: { fontSize: 13, color: '#f9fafb', fontFamily: 'monospace' },
  youBadge: {
    fontSize: 10,
    color: '#6366f1',
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#f9fafb', marginBottom: 10 },
  emptyMilestones: { color: '#6b7280', textAlign: 'center', padding: 16 },
  actionsSection: { marginTop: 24 },
  actionBtn: { marginBottom: 10 },
  disputeCard: { marginTop: 16, borderColor: '#7c2d12', backgroundColor: '#1c0a00' },
  disputeTitle: { fontSize: 15, fontWeight: '700', color: '#fb923c', marginBottom: 6 },
  disputeText: { fontSize: 13, color: '#9ca3af', lineHeight: 20 },
  evidenceSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#7c2d12', paddingTop: 12 },
  evidenceTitle: { fontSize: 14, fontWeight: '700', color: '#fb923c', marginBottom: 8 },
  evidenceFile: { fontSize: 13, color: '#f9fafb', marginBottom: 8 },
  evidenceHint: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  evidenceError: { fontSize: 12, color: '#ef4444', marginBottom: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  progressText: { fontSize: 12, color: '#fb923c' },
});
