/**
 * Migration: Add Stellar Horizon event listener and deduplication tables
 *
 * Creates tables for:
 *  - processedEvent: deduplication using paging_token
 *  - systemConfig: persistent cursor storage for Horizon stream
 */

export async function up(knex) {
  // Create processedEvent table for deduplication
  await knex.schema.createTable('processed_events', (table) => {
    table.increments('id').primary();
    table.string('paging_token').unique().notNullable(); // Horizon's unique event ID
    table.bigInteger('ledger_sequence').notNullable();
    table.string('transaction_hash').notNullable();
    table.integer('event_index').notNullable();
    table.string('event_type').notNullable(); // e.g., "EscrowCreated", "MilestoneApproved"
    table.bigInteger('escrow_id').nullable();
    table.json('event_data').notNullable(); // Full event payload
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Indexes for efficient duplicate checks and analytics
    table.index(['paging_token'], 'idx_processed_events_paging_token');
    table.index(['ledger_sequence'], 'idx_processed_events_ledger');
    table.index(['event_type'], 'idx_processed_events_type');
    table.index(['escrow_id'], 'idx_processed_events_escrow_id');
    table.index(['created_at'], 'idx_processed_events_created_at');
  });

  // Create systemConfig table for cursor and listener state
  await knex.schema.createTable('system_config', (table) => {
    table.string('key').primary();
    table.string('value').notNullable();
    table.text('description').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['key'], 'idx_system_config_key');
  });

  // Insert default row for Horizon cursor
  await knex('system_config').insert({
    key: 'horizon_cursor',
    value: 'now',
    description: 'Cursor for Stellar Horizon event stream; "now" means start from latest',
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('processed_events');
  await knex.schema.dropTableIfExists('system_config');
}
