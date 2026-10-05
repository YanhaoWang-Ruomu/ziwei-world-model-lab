CREATE TABLE `chart_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_case_id` text,
	`auto_open` integer DEFAULT 0 NOT NULL,
	`default_settings` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chart_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`settings` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chart_profiles_user_updated` ON `chart_profiles` (`user_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `chart_cases` ADD `settings` text;