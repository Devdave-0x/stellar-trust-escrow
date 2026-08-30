/**
 * Streaming Event Indexer Service
 *
 * Stream-oriented indexer that ingests Soroban contract events from Stellar RPC / Horizon SSE,
 * processes state transitions, updates database checkpoint cursors, and broadcasts realtime events.
 *
 * Resilience & Reliability:
 *  - Atomic transactions via Prisma $transaction
 *  - Checkpoint tracking in indexerState table
 *  - Clean lifecycle management (start/stop) with timer and listener cleanup
 *
 * @module streamingIndexer
 */

import { scValToNative } from '@stellar/stellar-sdk';
import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';
import { getContractEvents, getLatestLedger } from './stellarService.js';
import { broadcastEscrowEvent } from '../api/websocket/handlers.js';
import { recordEscrowStateTransition } from '../lib/metrics.js';

const log = createModuleLogger('service.streamingIndexer');

const CONTRACT_ID = process.env.ESCROW_CONTRACT_ID || '';
const DEFAULT_POLL_INTERVAL_MS = 5000;

// ── Helpers ───────────────────────────────────────────────────────────────────

const scValToJs = (scVal) => {
  if (scVal == null) return null;
  try {
    return scValToNative(scVal);
  } catch {
    return String(scVal);
  }
};

const parseBigInt = (val) => {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(val);
  try {
    return BigInt(String(val));
  } catch {
    return 0n;
  }
};

const parseAddress = (val) => {
  if (typeof val === 'string') return val;
  try {
    return val.address().toString();
  } catch {
    return String(val);
  }
};

const parseEventType = (topic0) => {
  if (typeof topic0 === 'string') return topic0;
  if (topic0?.value) return String(topic0.value());
  return String(topic0);
};

const toJson = (val) =>
  JSON.parse(JSON.stringify(val, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

// ── Event Processors ──────────────────────────────────────────────────────────

export async function processEvent(event, meta = {}) {
  const eventType = parseEventType(event.topic?.[0]);
  const escrowId = parseBigInt(event.topic?.[1]);
  const ledger = meta.ledger ?? event.ledger ?? 0;
  const ledgerAt =
    meta.ledgerAt ?? (event.ledgerClosedAt ? new Date(event.ledgerClosedAt) : new Date());

  const contractEventData = {
    ledger,
    ledgerAt,
    contractId: meta.contractId ?? CONTRACT_ID,
    eventType,
    escrowId: escrowId !== 0n ? escrowId : null,
    topics: toJson(event.topic),
    data: toJson(event.value),
    txHash: meta.txHash ?? event.txHash ?? '',
    eventIndex: meta.eventIndex ?? 0,
  };

  switch (eventType) {
    case 'esc_crt':
    case 'EscrowCreated': {
      const [client, freelancer, amount] = Array.isArray(event.value) ? event.value : [];
      const totalAmount = parseBigInt(amount).toString();

      await prisma.$transaction([
        prisma.escrow.upsert({
          where: { id: escrowId },
          create: {
            id: escrowId,
            clientAddress: parseAddress(client),
            freelancerAddress: parseAddress(freelancer),
            tokenAddress: meta.tokenAddress ?? '',
            totalAmount,
            remainingBalance: totalAmount,
            status: 'Active',
            briefHash: '',
            createdAt: ledgerAt,
            createdLedger: ledger,
          },
          update: {},
        }),
        prisma.contractEvent.create({ data: contractEventData }),
      ]);

      recordEscrowStateTransition('null', 'Active');
      try {
        broadcastEscrowEvent(escrowId, 'escrow:funded', 'Active');
      } catch (err) {
        log.warn({ message: 'broadcast_failed', error: err.message });
      }
      break;
    }

    case 'mil_add':
    case 'MilestoneAdded': {
      const [milestoneId, amount] = Array.isArray(event.value) ? event.value : [];
      const milestoneIndex = Number(parseBigInt(milestoneId));

      await prisma.$transaction([
        prisma.milestone.upsert({
          where: { escrowId_milestoneIndex: { escrowId, milestoneIndex } },
          create: {
            escrowId,
            milestoneIndex,
            title: `Milestone ${milestoneIndex}`,
            descriptionHash: '',
            amount: parseBigInt(amount).toString(),
            status: 'Pending',
          },
          update: {},
        }),
        prisma.contractEvent.create({ data: contractEventData }),
      ]);
      break;
    }

    case 'funds_rel':
    case 'FundsReleased': {
      const [amountReleased] = Array.isArray(event.value) ? event.value : [];
      const releasedAmount = parseBigInt(amountReleased);

      const existingEscrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
      const currentBalance = existingEscrow ? BigInt(existingEscrow.remainingBalance) : 0n;
      const newBalance = currentBalance >= releasedAmount ? currentBalance - releasedAmount : 0n;
      const nextStatus = newBalance === 0n ? 'Completed' : 'Active';

      await prisma.$transaction([
        prisma.escrow.update({
          where: { id: escrowId },
          data: {
            remainingBalance: String(newBalance),
            status: nextStatus,
          },
        }),
        prisma.contractEvent.create({ data: contractEventData }),
      ]);

      if (nextStatus === 'Completed') {
        recordEscrowStateTransition('Active', 'Completed');
      }
      break;
    }

    default: {
      await prisma.contractEvent.create({ data: contractEventData });
      break;
    }
  }

  return { escrowId, eventType, ledger };
}

// ── Streaming Indexer Service Class ────────────────────────────────────────────

export class StreamingIndexer {
  constructor(options = {}) {
    this.contractId = options.contractId || process.env.ESCROW_CONTRACT_ID || '';
    this.pollIntervalMs =
      options.pollIntervalMs ||
      parseInt(process.env.INDEXER_POLL_INTERVAL_MS || String(DEFAULT_POLL_INTERVAL_MS), 10);
    this.isRunning = false;
    this.timer = null;
    this.lastProcessedLedger = 0;
  }

  async initialize() {
    const state = await prisma.indexerState.upsert({
      where: { id: 1 },
      create: { id: 1, lastProcessedLedger: BigInt(process.env.INDEXER_START_LEDGER || '0') },
      update: {},
    });
    this.lastProcessedLedger = Number(state.lastProcessedLedger);
    log.info({
      message: 'streaming_indexer_initialized',
      lastProcessedLedger: this.lastProcessedLedger,
    });
    return this.lastProcessedLedger;
  }

  async updateCheckpoint(ledger) {
    if (ledger > this.lastProcessedLedger) {
      this.lastProcessedLedger = ledger;
      await prisma.indexerState.update({
        where: { id: 1 },
        data: { lastProcessedLedger: BigInt(ledger) },
      });
    }
  }

  async tick() {
    if (!this.isRunning) return;
    try {
      const latestLedger = await getLatestLedger();
      if (latestLedger > this.lastProcessedLedger) {
        const events = await getContractEvents(
          this.lastProcessedLedger + 1,
          latestLedger,
          this.contractId,
        );
        for (const evt of events) {
          await processEvent(evt, { ledger: evt.ledger ?? latestLedger });
        }
        await this.updateCheckpoint(latestLedger);
      }
    } catch (err) {
      log.error({ message: 'streaming_indexer_tick_error', error: err.message });
    }
  }

  async start() {
    if (this.isRunning) return;
    await this.initialize();
    this.isRunning = true;

    // Run first tick immediately
    await this.tick();

    // Schedule periodic polling
    this.timer = setInterval(() => {
      this.tick().catch((err) => log.error({ message: 'interval_tick_error', error: err.message }));
    }, this.pollIntervalMs);

    log.info({ message: 'streaming_indexer_started', intervalMs: this.pollIntervalMs });
  }

  async stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info({ message: 'streaming_indexer_stopped' });
  }
}

export default StreamingIndexer;
