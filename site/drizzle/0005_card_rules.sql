CREATE TABLE `card_rules` (
	`card_id` text PRIMARY KEY NOT NULL,
	`definition` text NOT NULL,
	`card_revision` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`card_id`) REFERENCES `technique_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
