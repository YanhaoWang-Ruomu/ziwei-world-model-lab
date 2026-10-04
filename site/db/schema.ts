import { sqliteTable, text, integer, primaryKey, index, unique, check } from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';

export const worldProjects=sqliteTable('world_projects',{
  id:text('id').primaryKey(),userId:text('user_id').notNull(),title:text('title').notNull(),payload:text('payload').notNull(),revision:integer('revision').notNull().default(1),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[index('idx_world_owner').on(t.userId,t.updatedAt)]);
export const worldBranches=sqliteTable('world_branches',{
  id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>worldProjects.id,{onDelete:'cascade'}),payload:text('payload').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_world_branch').on(t.projectId,t.createdAt)]);
export const worldReviews=sqliteTable('world_reviews',{
  id:text('id').primaryKey(),branchId:text('branch_id').notNull().references(()=>worldBranches.id,{onDelete:'cascade'}),payload:text('payload').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_world_review').on(t.branchId,t.createdAt)]);
export const worldRuns=sqliteTable('world_runs',{
  id:text('id').primaryKey(),branchId:text('branch_id').notNull().references(()=>worldBranches.id,{onDelete:'cascade'}),engineVersion:text('engine_version').notNull(),inputHash:text('input_hash').notNull(),inputSnapshot:text('input_snapshot').notNull(),result:text('result').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_world_runs_branch').on(t.branchId,t.createdAt),unique('world_run_input_unique').on(t.branchId,t.inputHash)]);
export const communityPosts=sqliteTable('community_posts',{
  id:text('id').primaryKey(),userId:text('user_id').notNull(),title:text('title').notNull(),body:text('body').notNull(),format:text('format').notNull().default('plain'),kind:text('kind').notNull(),tags:text('tags').notNull(),status:text('status').notNull().default('pending'),revision:integer('revision').notNull().default(1),note:text('note').notNull().default(''),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[index('idx_community_public').on(t.status,t.createdAt),index('idx_community_owner').on(t.userId,t.createdAt),check('community_post_kind',sql`${t.kind} IN ('case','technique')`),check('community_post_status',sql`${t.status} IN ('pending','published','rejected','hidden','withdrawn')`)]);
export const communityComments=sqliteTable('community_comments',{
  id:text('id').primaryKey(),postId:text('post_id').notNull().references(()=>communityPosts.id,{onDelete:'cascade'}),userId:text('user_id').notNull(),body:text('body').notNull(),format:text('format').notNull().default('plain'),status:text('status').notNull().default('pending'),revision:integer('revision').notNull().default(1),note:text('note').notNull().default(''),createdAt:integer('created_at').notNull(),
},t=>[index('idx_community_comments').on(t.postId,t.status,t.createdAt),check('community_comment_status',sql`${t.status} IN ('pending','published','rejected','hidden','withdrawn')`)]);
export const communityFavorites=sqliteTable('community_favorites',{
  userId:text('user_id').notNull(),postId:text('post_id').notNull().references(()=>communityPosts.id,{onDelete:'cascade'}),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.postId]})]);
export const communityReports=sqliteTable('community_reports',{
  id:text('id').primaryKey(),userId:text('user_id').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),reason:text('reason').notNull(),status:text('status').notNull().default('open'),note:text('note').notNull().default(''),createdAt:integer('created_at').notNull(),
},t=>[index('idx_community_reports').on(t.status,t.createdAt),unique('community_report_unique').on(t.userId,t.targetKind,t.targetId),check('community_report_kind',sql`${t.targetKind} IN ('post','comment')`),check('community_report_status',sql`${t.status} IN ('open','resolved')`)]);
export const communityAttachments=sqliteTable('community_attachments',{
  id:text('id').primaryKey(),userId:text('user_id').notNull(),fileName:text('file_name').notNull(),contentType:text('content_type').notNull(),fileSize:integer('file_size').notNull(),objectKey:text('object_key').notNull(),sha256:text('sha256').notNull(),targetKind:text('target_kind'),targetId:text('target_id'),createdAt:integer('created_at').notNull(),
},t=>[index('idx_community_attachment_owner').on(t.userId,t.createdAt),index('idx_community_attachment_target').on(t.targetKind,t.targetId),check('community_attachment_size',sql`${t.fileSize} > 0 AND ${t.fileSize} <= 10485760`),check('community_attachment_target',sql`(${t.targetKind} IS NULL AND ${t.targetId} IS NULL) OR (${t.targetKind} IN ('post','comment') AND ${t.targetId} IS NOT NULL) AND ${t.targetKind} IS NOT NULL`)]);
export const communityModeration=sqliteTable('community_moderation',{
  id:text('id').primaryKey(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),actor:text('actor').notNull(),decision:text('decision').notNull(),reason:text('reason').notNull(),createdAt:integer('created_at').notNull(),
});

export const storageState = sqliteTable('storage_state', {
  id: text('id').primaryKey(), dirtyVersion: integer('dirty_version').notNull().default(0),
  backupVersion: integer('backup_version').notNull().default(0), backupAt: integer('backup_at').notNull().default(0),
  lockUntil: integer('lock_until').notNull().default(0), backupError: integer('backup_error').notNull().default(0),
});
export const storageBackups = sqliteTable('storage_backups', {
  id: text('id').primaryKey(), createdAt: integer('created_at').notNull(),
  manifestKey: text('manifest_key').notNull(), counts: text('counts').notNull(),
});
export const workspaceDrafts = sqliteTable('workspace_drafts', {
  ownerKey: text('owner_key').notNull(), key: text('key').notNull(), kind: text('kind').notNull(),
  bookId: text('book_id'), payload: text('payload').notNull(),
  revision: integer('revision').notNull().default(1), updatedAt: integer('updated_at').notNull(),
}, t => [primaryKey({columns:[t.ownerKey,t.key]})]);

export const personalAccounts = sqliteTable('personal_accounts', {
  id: text('id').primaryKey(), username: text('username').notNull(), usernameKey: text('username_key').notNull().unique(),
  passwordSalt: text('password_salt').notNull(), passwordHash: text('password_hash').notNull(), createdAt: integer('created_at').notNull(),
});
export const personalSessions = sqliteTable('personal_sessions', {
  hash: text('hash').primaryKey(), userId: text('user_id').notNull().references(() => personalAccounts.id,{onDelete:'cascade'}), expiresAt: integer('expires_at').notNull(),
}, t => [index('idx_personal_sessions_expiry').on(t.expiresAt)]);
export const chartCases = sqliteTable('chart_cases', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), title: text('title').notNull(), birth: text('birth').notNull(), provider: text('provider').notNull(),
  revision: integer('revision').notNull().default(1), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, t => [index('idx_chart_cases_user_updated').on(t.userId,t.updatedAt)]);

export const books = sqliteTable('books', {
  id: text('id').primaryKey(), title: text('title').notNull(),
  level: text('level').notNull(), kind: text('kind').notNull(),
  status: text('status').notNull().default('processing'),
  pageCount: integer('page_count').notNull(), sourceHash: text('source_hash').notNull(),
  fileName: text('file_name').notNull(), fileSize: integer('file_size').notNull(),
  uploadId: text('upload_id'), fileReady: integer('file_ready').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});
export const pages = sqliteTable('pages', {
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  page: integer('page').notNull(), rawText: text('raw_text').notNull(),
  normalized: text('normalized').notNull(), reviewed: text('reviewed').notNull().default('[]'),
  reviewSearch: text('review_search').notNull().default(''),
  aliases: text('aliases').notNull().default(''),
  engine: text('engine').notNull(), imageReady: integer('image_ready').notNull().default(0),
  correctionRevision: integer('correction_revision').notNull().default(0),
  correctedText: text('corrected_text').notNull().default(''),
  correctionSearch: text('correction_search').notNull().default(''),
  correctionStatus: text('correction_status').notNull().default('unreviewed'),
  unresolved: text('unresolved').notNull().default(''),
  correctionNote: text('correction_note').notNull().default(''),
  correctionUpdatedAt: integer('correction_updated_at').notNull().default(0),
}, t => [primaryKey({ columns: [t.bookId, t.page] })]);
export const pageRevisions = sqliteTable('page_revisions', {
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  page: integer('page').notNull(), revision: integer('revision').notNull(),
  correctedText: text('corrected_text').notNull(), unresolved: text('unresolved').notNull(),
  note: text('note').notNull(), status: text('status').notNull(),
  rawHash: text('raw_hash').notNull(), createdAt: integer('created_at').notNull(),
}, t => [primaryKey({ columns: [t.bookId, t.page, t.revision] })]);
export const techniqueCards = sqliteTable('technique_cards', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  page: integer('page').notNull(), title: text('title').notNull(), quote: text('quote').notNull(),
  topic: text('topic').notNull().default(''), topicKey: text('topic_key').notNull().default(''),
  searchText: text('search_text'),
  conditions: text('conditions').notNull(), conclusion: text('conclusion').notNull(),
  exceptions: text('exceptions').notNull(), terminology: text('terminology').notNull(),
  questions: text('questions').notNull(), notes: text('notes').notNull(),
  sourceRevision: integer('source_revision').notNull(), sourceHash: text('source_hash').notNull(),
  sourceTextHash: text('source_text_hash').notNull(),
  status: text('status').notNull().default('draft'), revision: integer('revision').notNull().default(1),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
  approvedAt: integer('approved_at'),
}, t => [index('idx_cards_source').on(t.bookId, t.page), index('idx_cards_topic').on(t.topicKey)]);
export const cardRules = sqliteTable('card_rules', {
  cardId: text('card_id').primaryKey().references(() => techniqueCards.id, { onDelete: 'cascade' }),
  definition: text('definition').notNull(), cardRevision: integer('card_revision').notNull(),
  status: text('status').notNull().default('draft'), revision: integer('revision').notNull().default(1),
  updatedAt: integer('updated_at').notNull(), confirmedAt: integer('confirmed_at'),
});
export const grants = sqliteTable('grants', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), subject: text('subject').notNull(),
  label: text('label').notNull(), expiresAt: integer('expires_at').notNull(),
  revoked: integer('revoked').notNull().default(0),
}, t => [index('idx_grants_subject').on(t.subject), index('idx_grants_book').on(t.bookId)]);
export const sessions = sqliteTable('key_sessions', {
  hash: text('hash').primaryKey(),
  grantId: text('grant_id').notNull().references(() => grants.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
});
export const publicUploads = sqliteTable('public_uploads', {
  bookId: text('book_id').primaryKey().references(() => books.id, { onDelete: 'cascade' }),
  sessionHash: text('session_hash').notNull(),
  expiresAt: integer('expires_at').notNull(), createdAt: integer('created_at').notNull(),
}, t => [index('idx_public_upload_session').on(t.sessionHash), index('idx_public_upload_created').on(t.createdAt)]);
export const specialSessions = sqliteTable('special_sessions', {
  hash: text('hash').primaryKey(),
  credentialVersion: text('credential_version').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, t => [index('idx_special_sessions_expiry').on(t.expiresAt)]);
export const loginAttempts = sqliteTable('login_attempts', {
  bucket: text('bucket').primaryKey(), attempts: integer('attempts').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, t => [index('idx_login_attempts_expiry').on(t.expiresAt)]);

export const coreMembers = sqliteTable('core_members', {
  userId: text('user_id').primaryKey(), label: text('label').notNull(),
  grantedBy: text('granted_by').notNull(), createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(), revoked: integer('revoked').notNull().default(0),
});
export const accountLevels=sqliteTable('account_levels',{
  userId:text('user_id').primaryKey(),label:text('label').notNull(),role:text('role').notNull(),updatedAt:integer('updated_at').notNull(),
});
export const authoredTechniques=sqliteTable('authored_techniques',{
  id:text('id').primaryKey(),author:text('author').notNull(),payload:text('payload').notNull(),level:text('level').notNull(),
  status:text('status').notNull().default('draft'),revision:integer('revision').notNull().default(1),
  note:text('note').notNull().default(''),reviewer:text('reviewer'),updatedAt:integer('updated_at').notNull(),
  publishedPayload:text('published_payload'),publishedRevision:integer('published_revision'),
  releaseVersion:integer('release_version').notNull().default(0),lastActor:text('last_actor'),
});
export const techniqueHistory=sqliteTable('technique_history',{
  id:integer('id').primaryKey({autoIncrement:true}),techniqueId:text('technique_id').notNull(),
  revision:integer('revision').notNull(),releaseVersion:integer('release_version').notNull(),
  action:text('action').notNull(),actor:text('actor').notNull(),payload:text('payload').notNull(),
  status:text('status').notNull(),note:text('note').notNull(),occurredAt:integer('occurred_at').notNull(),
},t=>[index('idx_technique_history_card').on(t.techniqueId,t.id)]);
export const cardSubmissions = sqliteTable('card_submissions', {
  id: text('id').primaryKey(), bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  page: integer('page').notNull(), cardId: text('card_id'),
  authorKey: text('author_key').notNull(), authorLabel: text('author_label').notNull(),
  payload: text('payload').notNull(), baseCardRevision: integer('base_card_revision').notNull(),
  sourceRevision: integer('source_revision').notNull(), status: text('status').notNull().default('pending'),
  decisionNote: text('decision_note').notNull().default(''), reviewerKey: text('reviewer_key'),
  decidedAt: integer('decided_at'), publishedCardId: text('published_card_id'),
  publishedPayload: text('published_payload'), reviewToken: text('review_token'),
  createdAt: integer('created_at').notNull(),
}, t => [index('idx_submissions_author').on(t.authorKey, t.createdAt), index('idx_submissions_status').on(t.status, t.createdAt)]);
