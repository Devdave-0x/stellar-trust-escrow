import { connection } from './index.js';
import { Queue } from 'bullmq';

class InMemoryQueue {
  constructor(name) {
    this.name = name;
    this.jobs = [];
  }

  async add(eventType, data) {
    const job = { id: `${this.name}-${this.jobs.length + 1}`, name: eventType, data };
    this.jobs.push(job);
    return job;
  }

  async getWaiting() { return [...this.jobs]; }
  async getActive() { return []; }
  async getFailed() { return []; }
  __resetForTests() { this.jobs = []; }
}

export const notificationQueue =
  process.env.NODE_ENV === 'test'
    ? new InMemoryQueue('notifications')
    : new Queue('notifications', {
        connection,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      });
