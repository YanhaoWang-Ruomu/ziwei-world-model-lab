CREATE TABLE IF NOT EXISTS `discovery_receipts` (
  `owner_hash` text NOT NULL,
  `request_id` text NOT NULL,
  `result_hash` text NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`owner_hash`, `request_id`)
);
