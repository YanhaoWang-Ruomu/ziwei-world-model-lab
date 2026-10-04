CREATE TABLE `community_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`target_kind` text,
	`target_id` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "community_attachment_size" CHECK("community_attachments"."file_size" > 0 AND "community_attachments"."file_size" <= 10485760),
	CONSTRAINT "community_attachment_target" CHECK(("community_attachments"."target_kind" IS NULL AND "community_attachments"."target_id" IS NULL) OR ("community_attachments"."target_kind" IN ('post','comment') AND "community_attachments"."target_id" IS NOT NULL) AND "community_attachments"."target_kind" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `idx_community_attachment_owner` ON `community_attachments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_community_attachment_target` ON `community_attachments` (`target_kind`,`target_id`);--> statement-breakpoint
ALTER TABLE `community_comments` ADD `format` text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE `community_posts` ADD `format` text DEFAULT 'plain' NOT NULL;