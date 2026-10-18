// Minimal Prisma client mock used by backend tests.
// Provides the models and methods exercised by the price oracle service
// (including idempotency safeguards) without a real database connection.

const store = {
  oraclePrice: [],
  oraclePriceIngestion: [],
};

function reset() {
  store.oraclePrice.length = 0;
  store.oraclePriceIngestion.length = 0;
}

function matches(record, where) {
  if (!where) return true;
  return Object.keys(where).every((key) => record[key] === where[key]);
}

function createModel(name) {
  return {
    async create({ data }) {
      const record = { id: `${name}-${store[name].length + 1}`, ...data };
      store[name].push(record);
      return record;
    },
    async createMany({ data }) {
      const rows = Array.isArray(data) ? data : [data];
      const created = rows.map((row) => {
        const record = { id: `${name}-${store[name].length + 1}`, ...row };
        store[name].push(record);
        return record;
      });
      return { count: created.length };
    },
    async findUnique({ where }) {
      return store[name].find((record) => matches(record, where)) || null;
    },
    async findFirst({ where } = {}) {
      return store[name].find((record) => matches(record, where)) || null;
    },
    async findMany({ where } = {}) {
      return store[name].filter((record) => matches(record, where));
    },
    async update({ where, data }) {
      const record = store[name].find((item) => matches(item, where));
      if (!record) {
        const error = new Error(`Record to update not found in ${name}`);
        error.code = 'P2025';
        throw error;
      }
      Object.assign(record, data);
      return record;
    },
    async upsert({ where, create, update }) {
      const record = store[name].find((item) => matches(item, where));
      if (record) {
        Object.assign(record, update);
        return record;
      }
      const created = { id: `${name}-${store[name].length + 1}`, ...create };
      store[name].push(created);
      return created;
    },
    async delete({ where }) {
      const index = store[name].findIndex((record) => matches(record, where));
      if (index === -1) {
        const error = new Error(`Record to delete not found in ${name}`);
        error.code = 'P2025';
        throw error;
      }
      return store[name].splice(index, 1)[0];
    },
    async count({ where } = {}) {
      return store[name].filter((record) => matches(record, where)).length;
    },
  };
}

const prisma = {
  oraclePrice: createModel('oraclePrice'),
  oraclePriceIngestion: createModel('oraclePriceIngestion'),
  $transaction: async (fn) => {
    if (typeof fn === 'function') {
      return fn(prisma);
    }
    return Promise.all(fn);
  },
  $connect: async () => {},
  $disconnect: async () => {},
  __reset: reset,
  __store: store,
};

module.exports = prisma;
module.exports.PrismaClient = function PrismaClient() {
  return prisma;
};
module.exports.Prisma = {
  PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
    constructor(message, { code } = {}) {
      super(message);
      this.code = code;
    }
  },
};
