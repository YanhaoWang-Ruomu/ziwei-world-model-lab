ALTER TABLE `technique_cards` ADD `topic` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `technique_cards` ADD `topic_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `technique_cards` ADD `search_text` text;--> statement-breakpoint
CREATE INDEX `idx_cards_topic` ON `technique_cards` (`topic_key`);