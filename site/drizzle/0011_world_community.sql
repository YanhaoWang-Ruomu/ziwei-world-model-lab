CREATE TABLE `community_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "community_comment_status" CHECK("community_comments"."status" IN ('pending','published','rejected','hidden','withdrawn'))
);
--> statement-breakpoint
CREATE INDEX `idx_community_comments` ON `community_comments` (`post_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_favorites` (
	`user_id` text NOT NULL,
	`post_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `post_id`),
	FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `community_moderation` (
	`id` text PRIMARY KEY NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`actor` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `community_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`kind` text NOT NULL,
	`tags` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "community_post_kind" CHECK("community_posts"."kind" IN ('case','technique')),
	CONSTRAINT "community_post_status" CHECK("community_posts"."status" IN ('pending','published','rejected','hidden','withdrawn'))
);
--> statement-breakpoint
CREATE INDEX `idx_community_public` ON `community_posts` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_community_owner` ON `community_posts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "community_report_kind" CHECK("community_reports"."target_kind" IN ('post','comment')),
	CONSTRAINT "community_report_status" CHECK("community_reports"."status" IN ('open','resolved'))
);
--> statement-breakpoint
CREATE INDEX `idx_community_reports` ON `community_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `community_report_unique` ON `community_reports` (`user_id`,`target_kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `world_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `world_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_world_branch` ON `world_branches` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `world_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_world_owner` ON `world_projects` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `world_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `world_branches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_world_review` ON `world_reviews` (`branch_id`,`created_at`);