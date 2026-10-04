CREATE TABLE `technique_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technique_id` text NOT NULL,
	`revision` integer NOT NULL,
	`release_version` integer NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`note` text NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_technique_history_card` ON `technique_history` (`technique_id`,`id`);--> statement-breakpoint
ALTER TABLE `authored_techniques` ADD `published_payload` text;--> statement-breakpoint
ALTER TABLE `authored_techniques` ADD `published_revision` integer;--> statement-breakpoint
ALTER TABLE `authored_techniques` ADD `release_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `authored_techniques` ADD `last_actor` text;
--> statement-breakpoint
UPDATE authored_techniques SET published_payload=payload,published_revision=revision,release_version=1 WHERE status='approved';
--> statement-breakpoint
INSERT INTO technique_history(technique_id,revision,release_version,action,actor,payload,status,note,occurred_at)
SELECT id,revision,release_version,'baseline','',payload,status,note,updated_at FROM authored_techniques;
--> statement-breakpoint
CREATE TRIGGER technique_history_create AFTER INSERT ON authored_techniques BEGIN
  INSERT INTO technique_history(technique_id,revision,release_version,action,actor,payload,status,note,occurred_at)
  VALUES(NEW.id,NEW.revision,NEW.release_version,'create',NEW.author,NEW.payload,NEW.status,NEW.note,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER technique_history_change AFTER UPDATE ON authored_techniques WHEN NEW.revision<>OLD.revision BEGIN
  INSERT INTO technique_history(technique_id,revision,release_version,action,actor,payload,status,note,occurred_at)
  VALUES(NEW.id,NEW.revision,NEW.release_version,
    CASE WHEN NEW.status='approved' THEN 'publish' WHEN NEW.status='rejected' THEN 'reject'
    WHEN NEW.status='pending' AND OLD.status<>'pending' THEN 'submit'
    WHEN OLD.status='approved' THEN 'revise' ELSE 'edit' END,
    COALESCE(NEW.last_actor,''),NEW.payload,NEW.status,NEW.note,NEW.updated_at);
END;
