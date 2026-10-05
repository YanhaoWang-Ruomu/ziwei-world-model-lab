CREATE TABLE `community_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`post_id` text NOT NULL,
	`comment_id` text,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_community_notifications_recipient` ON `community_notifications` (`recipient`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_revision_once` ON `community_revisions` (`kind`,`target_id`,`revision`);--> statement-breakpoint
CREATE TABLE `storage_restore_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`backup_id` text NOT NULL,
	`manifest` text NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`asset_cursor` integer DEFAULT 0 NOT NULL,
	`assets` text,
	`state` text DEFAULT 'preparing' NOT NULL,
	`history_max` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storage_restore_rows` (
	`job_id` text NOT NULL,
	`table_name` text NOT NULL,
	`ordinal` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`job_id`, `table_name`, `ordinal`),
	FOREIGN KEY (`job_id`) REFERENCES `storage_restore_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `community_comments` ADD `parent_id` text;--> statement-breakpoint
ALTER TABLE `personal_accounts` ADD `recovery_hash` text;--> statement-breakpoint
ALTER TABLE `personal_accounts` ADD `security_updated_at` integer DEFAULT 0 NOT NULL;