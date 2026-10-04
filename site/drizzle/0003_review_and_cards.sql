CREATE TABLE `page_revisions` (
	`book_id` text NOT NULL,
	`page` integer NOT NULL,
	`revision` integer NOT NULL,
	`corrected_text` text NOT NULL,
	`unresolved` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`raw_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`book_id`, `page`, `revision`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `technique_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`page` integer NOT NULL,
	`title` text NOT NULL,
	`quote` text NOT NULL,
	`conditions` text NOT NULL,
	`conclusion` text NOT NULL,
	`exceptions` text NOT NULL,
	`terminology` text NOT NULL,
	`questions` text NOT NULL,
	`notes` text NOT NULL,
	`source_revision` integer NOT NULL,
	`source_hash` text NOT NULL,
	`source_text_hash` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`approved_at` integer,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cards_source` ON `technique_cards` (`book_id`,`page`);--> statement-breakpoint
ALTER TABLE `pages` ADD `correction_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` ADD `corrected_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` ADD `correction_search` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` ADD `correction_status` text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` ADD `unresolved` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` ADD `correction_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` ADD `correction_updated_at` integer DEFAULT 0 NOT NULL;