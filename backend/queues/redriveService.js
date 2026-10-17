const inFlightRedrives = new Map();

export function readRedriveConfig(env = process.env) {
  const concurrency = Number(env.DLQ_REDRIVE_CONCURRENCY ?? 2);
  const batchSize = Number(env.DLQ_REDRIVE_BATCH_SIZE ?? 25);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 10) {
    throw new Error('DLQ_REDRIVE_CONCURRENCY must be an integer between 1 and 10');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error('DLQ_REDRIVE_BATCH_SIZE must be an integer between 1 and 100');
  }
  return { concurrency, batchSize };
}

export function redriveJob(jobId, { sourceQueue, targetQueue } = {}) {
  const id = String(jobId || '').trim();
  if (!id) return Promise.reject(new Error('jobId is required'));
  if (!sourceQueue || !targetQueue) {
    return Promise.resolve({ status: 'degraded', reason: 'queue_unavailable', jobId: id });
  }
  if (inFlightRedrives.has(id)) return inFlightRedrives.get(id);

  const operation = (async () => {
    try {
      const job = await sourceQueue.getJob(id);
      if (!job) return { status: 'not_found', jobId: id };
      await targetQueue.add('process-event', job.data.originalJobData ?? job.data, {
        jobId: `redrive-${id}`,
      });
      await job.remove();
      return { status: 'redriven', jobId: id };
    } catch (error) {
      if (['ECONNREFUSED', 'QUEUE_UNAVAILABLE'].includes(error.code)) {
        return { status: 'degraded', reason: 'queue_unavailable', jobId: id };
      }
      throw error;
    }
  })().finally(() => inFlightRedrives.delete(id));

  inFlightRedrives.set(id, operation);
  return operation;
}

export function resetRedriveState() {
  inFlightRedrives.clear();
}
