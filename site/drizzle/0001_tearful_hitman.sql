CREATE TABLE `public_uploads` (
	`book_id` text PRIMARY KEY NOT NULL,
	`session_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_public_upload_session` ON `public_uploads` (`session_hash`);--> statement-breakpoint
CREATE INDEX `idx_public_upload_created` ON `public_uploads` (`created_at`);