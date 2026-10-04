CREATE TABLE `login_attempts` (
	`bucket` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_login_attempts_expiry` ON `login_attempts` (`expires_at`);--> statement-breakpoint
CREATE TABLE `special_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`credential_version` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_special_sessions_expiry` ON `special_sessions` (`expires_at`);