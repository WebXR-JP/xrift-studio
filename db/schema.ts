import { integer, primaryKey, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const studioSnapshots = sqliteTable('studio_snapshots', {
  owner: text('owner').notNull(),
  snapshotId: text('snapshot_id').notNull(),
  projectId: text('project_id').notNull(),
  sceneId: text('scene_id').notNull(),
  revision: integer('revision').notNull(),
  hash: text('hash').notNull(),
  baseHash: text('base_hash'),
  operationId: text('operation_id').notNull(),
  inputHash: text('input_hash').notNull(),
  resultJson: text('result_json').notNull(),
  byteLength: integer('byte_length').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [
  primaryKey({ columns: [table.owner, table.snapshotId] }),
  uniqueIndex('idx_studio_snapshots_owner_operation').on(table.owner, table.operationId),
  index('idx_studio_snapshots_owner_expiry').on(table.owner, table.expiresAt),
]);

export const studioProjectHeads = sqliteTable('studio_project_heads', {
  owner: text('owner').notNull(),
  projectId: text('project_id').notNull(),
  snapshotId: text('snapshot_id').notNull(),
  revision: integer('revision').notNull(),
  hash: text('hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [
  primaryKey({ columns: [table.owner, table.projectId] }),
  index('idx_studio_project_heads_owner_expiry').on(table.owner, table.expiresAt),
]);
