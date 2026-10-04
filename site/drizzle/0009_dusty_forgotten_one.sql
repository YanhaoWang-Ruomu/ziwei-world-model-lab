CREATE TABLE `account_levels` (
	`user_id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`role` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `authored_techniques` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`payload` text NOT NULL,
	`level` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`reviewer` text,
	`updated_at` integer NOT NULL
);
