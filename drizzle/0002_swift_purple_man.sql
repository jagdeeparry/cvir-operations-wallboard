CREATE INDEX `idx_resource_alignments_completed_at` ON `resource_alignments` (`completed_at`);
--> statement-breakpoint
PRAGMA optimize;
