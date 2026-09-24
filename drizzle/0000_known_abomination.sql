CREATE TABLE `resource_alignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_type` text NOT NULL,
	`title` text NOT NULL,
	`resources` text NOT NULL,
	`schedule` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
