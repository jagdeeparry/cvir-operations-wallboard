CREATE TABLE `employee_of_month` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`employee_name` text DEFAULT '' NOT NULL,
	`slack_image_url` text DEFAULT '' NOT NULL,
	`recognition` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
