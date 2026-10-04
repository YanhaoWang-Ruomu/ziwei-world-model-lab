CREATE TABLE `card_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`page` integer NOT NULL,
	`card_id` text,
	`author_key` text NOT NULL,
	`author_label` text NOT NULL,
	`payload` text NOT NULL,
	`base_card_revision` integer NOT NULL,
	`source_revision` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decision_note` text DEFAULT '' NOT NULL,
	`reviewer_key` text,
	`decided_at` integer,
	`published_card_id` text,
	`published_payload` text,
	`review_token` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_submissions_author` ON `card_submissions` (`author_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_submissions_status` ON `card_submissions` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `core_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`granted_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL
);
