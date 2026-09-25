import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  MAX_ATTEMPTS,
  PermanentSubmissionError,
  processQueue,
  readQueue,
  submitOrQueue,
  transactionId,
  type KeyValueStore,
  type QueueDeps,
} from '../services/txRetryQueue';

function signedXdr(): { xdr: string; hash: string } {
  const source = Keypair.random();
  const tx = new TransactionBuilder(new Account(source.publicKey(), '1'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: '1',
      }),
    )
    .setTimeout(0)
    .build();
  tx.sign(source);
  return { xdr: tx.toXDR(), hash: tx.hash().toString('hex') };
}

/** An MMKV stand-in backed by a Map that outlives "restarts". */
function memoryStore(backing = new Map<string, string>()): KeyValueStore {
  return { getString: (k) => backing.get(k), set: (k, v) => void backing.set(k, v) };
}

const offline = Object.assign(new Error('Network Error'), { response: undefined });
const serverError = { response: { status: 503, data: { error: 'Unavailable' } } };
const rejected = { response: { status: 400, data: { error: 'tx_bad_seq' } } };

let now = 1_000_000;

function deps(store: KeyValueStore, broadcast: QueueDeps['broadcast']): QueueDeps {
  return { store, broadcast, now: () => now };
}

beforeEach(() => {
  now = 1_000_000;
});

describe('submitOrQueue', () => {
  it('submits directly with the transaction hash as the idempotency key', async () => {
    const { xdr, hash } = signedXdr();
    const broadcast = jest.fn().mockResolvedValue({ hash, status: 'PENDING' });
    const store = memoryStore();

    const outcome = await submitOrQueue(xdr, deps(store, broadcast));

    expect(outcome).toEqual({ status: 'submitted', result: { hash, status: 'PENDING' } });
    expect(broadcast).toHaveBeenCalledWith(xdr, hash);
    expect(readQueue(store)).toEqual([]);
  });

  it('queues the transaction when the API is unreachable, once per transaction', async () => {
    const { xdr, hash } = signedXdr();
    const broadcast = jest.fn().mockRejectedValue(offline);
    const store = memoryStore();

    await expect(submitOrQueue(xdr, deps(store, broadcast))).resolves.toEqual({
      status: 'queued',
      id: hash,
    });
    await submitOrQueue(xdr, deps(store, broadcast));

    const queue = readQueue(store);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: hash, xdr, status: 'pending', attempts: 1 });
  });

  it('queues on server errors too (5xx)', async () => {
    const { xdr } = signedXdr();
    const store = memoryStore();

    const outcome = await submitOrQueue(xdr, deps(store, jest.fn().mockRejectedValue(serverError)));

    expect(outcome.status).toBe('queued');
  });

  it('surfaces a rejection as a permanent error without queueing it', async () => {
    const { xdr } = signedXdr();
    const store = memoryStore();

    await expect(
      submitOrQueue(xdr, deps(store, jest.fn().mockRejectedValue(rejected))),
    ).rejects.toEqual(new PermanentSubmissionError('tx_bad_seq'));
    expect(readQueue(store)).toEqual([]);
  });

  it('rejects malformed XDR before trying to submit', async () => {
    const broadcast = jest.fn();

    await expect(submitOrQueue('not-xdr', deps(memoryStore(), broadcast))).rejects.toBeInstanceOf(
      PermanentSubmissionError,
    );
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe('processQueue', () => {
  async function queued(store: KeyValueStore): Promise<string> {
    const { xdr, hash } = signedXdr();
    await submitOrQueue(xdr, deps(store, jest.fn().mockRejectedValue(offline)));
    return hash;
  }

  it('persists across restarts and submits once connectivity returns', async () => {
    const backing = new Map<string, string>();
    const id = await queued(memoryStore(backing));

    // A fresh store over the same persisted data, as after an app restart.
    const restarted = memoryStore(backing);
    now += 60_000;
    const broadcast = jest.fn().mockResolvedValue({ hash: id, status: 'PENDING' });
    const result = await processQueue(deps(restarted, broadcast));

    expect(result).toEqual({ submitted: [id], failed: [] });
    expect(broadcast).toHaveBeenCalledWith(expect.any(String), id);
    expect(readQueue(restarted)).toEqual([]);
  });

  it('waits for the backoff before retrying', async () => {
    const store = memoryStore();
    await queued(store);
    const broadcast = jest.fn();

    await processQueue(deps(store, broadcast));

    expect(broadcast).not.toHaveBeenCalled();
    expect(readQueue(store)).toHaveLength(1);
  });

  it('keeps retrying while the API is still unreachable, with a growing backoff', async () => {
    const store = memoryStore();
    await queued(store);
    const firstDue = readQueue(store)[0].nextAttemptAt;

    now = firstDue;
    await processQueue(deps(store, jest.fn().mockRejectedValue(offline)));

    const [entry] = readQueue(store);
    expect(entry).toMatchObject({ status: 'pending', attempts: 2 });
    expect(entry.nextAttemptAt - now).toBeGreaterThan(firstDue - 1_000_000);
  });

  it('marks a transaction failed when the server rejects it on retry', async () => {
    const store = memoryStore();
    const id = await queued(store);
    now += 60_000;

    const result = await processQueue(deps(store, jest.fn().mockRejectedValue(rejected)));

    expect(result.failed).toEqual([id]);
    expect(readQueue(store)[0]).toMatchObject({ status: 'failed', lastError: 'tx_bad_seq' });
  });

  it(`gives up after ${MAX_ATTEMPTS} attempts`, async () => {
    const store = memoryStore();
    const id = await queued(store);
    const stillOffline = jest.fn().mockRejectedValue(offline);

    for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
      now += 10 * 60_000;
      await processQueue(deps(store, stillOffline));
    }

    expect(readQueue(store)[0]).toMatchObject({ id, status: 'failed', attempts: MAX_ATTEMPTS });
  });
});

describe('transactionId', () => {
  it('is the Stellar transaction hash', () => {
    const { xdr, hash } = signedXdr();
    expect(transactionId(xdr, Networks.TESTNET)).toBe(hash);
  });
});
