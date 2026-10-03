CREATE TABLE `studio_project_heads` (
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`revision` integer NOT NULL,
	`hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`owner`, `project_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_studio_project_heads_owner_expiry` ON `studio_project_heads` (`owner`,`expires_at`);--> statement-breakpoint
CREATE TABLE `studio_snapshots` (
	`owner` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`project_id` text NOT NULL,
	`scene_id` text NOT NULL,
	`revision` integer NOT NULL,
	`hash` text NOT NULL,
	`base_hash` text,
	`operation_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`result_json` text NOT NULL,
	`byte_length` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`owner`, `snapshot_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_studio_snapshots_owner_operation` ON `studio_snapshots` (`owner`,`operation_id`);--> statement-breakpoint
CREATE INDEX `idx_studio_snapshots_owner_expiry` ON `studio_snapshots` (`owner`,`expires_at`);