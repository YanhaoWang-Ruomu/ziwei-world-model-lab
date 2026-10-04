CREATE TABLE `storage_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`manifest_key` text NOT NULL,
	`counts` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storage_state` (
	`id` text PRIMARY KEY NOT NULL,
	`dirty_version` integer DEFAULT 0 NOT NULL,
	`backup_version` integer DEFAULT 0 NOT NULL,
	`backup_at` integer DEFAULT 0 NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`backup_error` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_drafts` (
	`owner_key` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`book_id` text,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_key`, `key`)
);
