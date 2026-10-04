CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`level` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`page_count` integer NOT NULL,
	`source_hash` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`upload_id` text,
	`file_ready` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `grants` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`label` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_grants_subject` ON `grants` (`subject`);--> statement-breakpoint
CREATE INDEX `idx_grants_book` ON `grants` (`book_id`);--> statement-breakpoint
CREATE TABLE `pages` (
	`book_id` text NOT NULL,
	`page` integer NOT NULL,
	`raw_text` text NOT NULL,
	`normalized` text NOT NULL,
	`reviewed` text DEFAULT '[]' NOT NULL,
	`review_search` text DEFAULT '' NOT NULL,
	`aliases` text DEFAULT '' NOT NULL,
	`engine` text NOT NULL,
	`image_ready` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`book_id`, `page`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `key_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `grants`(`id`) ON UPDATE no action ON DELETE cascade
);
