CREATE TABLE "bar_annotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"learning_plan_id" integer NOT NULL,
	"lesson_day_id" integer,
	"user_id" varchar NOT NULL,
	"measure_start" integer NOT NULL,
	"measure_end" integer NOT NULL,
	"text" text NOT NULL,
	"session_number" integer,
	"session_date" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bar_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"learning_plan_id" integer NOT NULL,
	"lesson_day_id" integer NOT NULL,
	"measure_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"note" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bar_flag_lesson_measure_unique" UNIQUE("lesson_day_id","measure_id")
);
--> statement-breakpoint
CREATE TABLE "community_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"piece_id" integer NOT NULL,
	"movement_id" integer,
	"sheet_music_id" integer NOT NULL,
	"submitted_by_user_id" varchar(100) NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"description" text,
	"download_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "composers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"birth_year" integer,
	"death_year" integer,
	"nationality" text,
	"image_url" text,
	"period" text,
	CONSTRAINT "composers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "learning_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"repertoire_entry_id" integer,
	"sheet_music_id" integer,
	"daily_practice_minutes" integer DEFAULT 30 NOT NULL,
	"target_completion_date" text,
	"total_measures" integer,
	"status" text DEFAULT 'setup' NOT NULL,
	"scheduler_version" integer DEFAULT 1 NOT NULL,
	"last_replan_at" timestamp,
	"block_type" text DEFAULT 'piece' NOT NULL,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"cadence_days" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lesson_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"learning_plan_id" integer NOT NULL,
	"scheduled_date" text NOT NULL,
	"measure_start" integer NOT NULL,
	"measure_end" integer NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"user_notes" text,
	"completed_at" timestamp,
	"tasks" jsonb,
	"section_id" integer,
	"phase_type" text
);
--> statement-breakpoint
CREATE TABLE "measure_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"learning_plan_id" integer NOT NULL,
	"measure_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"notes" text,
	"last_practiced_at" text,
	CONSTRAINT "measure_progress_unique" UNIQUE("learning_plan_id","measure_id")
);
--> statement-breakpoint
CREATE TABLE "measures" (
	"id" serial PRIMARY KEY NOT NULL,
	"sheet_music_id" integer NOT NULL,
	"measure_number" integer NOT NULL,
	"page_number" integer NOT NULL,
	"bounding_box" jsonb,
	"image_url" text,
	"movement_number" integer DEFAULT 1 NOT NULL,
	"user_corrected" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp,
	"display_label" text,
	"ignored" boolean DEFAULT false NOT NULL,
	"movement_id" integer
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"piece_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passage_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"passage_id" integer NOT NULL,
	"learning_plan_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"current_phase" text DEFAULT 'orient' NOT NULL,
	"phase_started_at" text,
	"phase_touch_count" integer DEFAULT 0 NOT NULL,
	"maturity" integer DEFAULT 0 NOT NULL,
	"sr_stability" integer DEFAULT 1 NOT NULL,
	"sr_difficulty" integer DEFAULT 5 NOT NULL,
	"last_reviewed_at" text,
	"next_due_at" text,
	"review_count" integer DEFAULT 0 NOT NULL,
	"lapse_count" integer DEFAULT 0 NOT NULL,
	"outstanding_challenges" jsonb DEFAULT '[]'::jsonb,
	"last_flag_count" integer DEFAULT 0 NOT NULL,
	"introduced_at" text,
	"retired_at" text,
	"daily_maintenance_flag" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "passage_progress_unique" UNIQUE("passage_id","learning_plan_id")
);
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" serial PRIMARY KEY NOT NULL,
	"learning_plan_id" integer NOT NULL,
	"section_id" integer,
	"kind" text DEFAULT 'primary' NOT NULL,
	"label" text,
	"measure_start" integer NOT NULL,
	"measure_end" integer NOT NULL,
	"difficulty" integer DEFAULT 5 NOT NULL,
	"challenges" jsonb DEFAULT '[]'::jsonb,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "piece_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"piece_id" integer NOT NULL,
	"analysis" text NOT NULL,
	"wiki_url" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "piece_analyses_piece_id_unique" UNIQUE("piece_id")
);
--> statement-breakpoint
CREATE TABLE "piece_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"piece_id" integer NOT NULL,
	"movement_id" integer,
	"cycle_number" integer DEFAULT 1 NOT NULL,
	"milestone_type" text NOT NULL,
	"achieved_at" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "piece_milestones_unique" UNIQUE("user_id","piece_id","movement_id","cycle_number","milestone_type")
);
--> statement-breakpoint
CREATE TABLE "pieces" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"composer_id" integer NOT NULL,
	"instrument" text DEFAULT 'Solo Piano',
	"imslp_url" text,
	"key_signature" text,
	"year_composed" integer,
	"difficulty" text
);
--> statement-breakpoint
CREATE TABLE "plan_section_phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" integer NOT NULL,
	"phase_type" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "plan_section_phase_unique" UNIQUE("section_id","phase_type")
);
--> statement-breakpoint
CREATE TABLE "plan_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"learning_plan_id" integer NOT NULL,
	"name" text NOT NULL,
	"measure_start" integer NOT NULL,
	"measure_end" integer NOT NULL,
	"difficulty" integer DEFAULT 4 NOT NULL,
	"ignored" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plan_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"learning_plan_id" integer NOT NULL,
	"triggered_by_lesson_id" integer,
	"type" text NOT NULL,
	"section_id" integer,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"session_date" text NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "practice_sessions_user_date_unique" UNIQUE("user_id","session_date")
);
--> statement-breakpoint
CREATE TABLE "repertoire_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"composer_id" integer NOT NULL,
	"piece_id" integer NOT NULL,
	"movement_id" integer,
	"status" text DEFAULT 'In Progress' NOT NULL,
	"started_date" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"split_view" boolean DEFAULT false NOT NULL,
	"current_cycle" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_task_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_day_id" integer NOT NULL,
	"passage_id" integer,
	"learning_plan_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"comfort" text,
	"completion" text,
	"flags" jsonb,
	"minutes_spent" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sheet_music" (
	"id" serial PRIMARY KEY NOT NULL,
	"piece_id" integer,
	"user_id" varchar NOT NULL,
	"file_url" text NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"page_count" integer,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sheet_music_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sheet_music_id" integer NOT NULL,
	"page_number" integer NOT NULL,
	"image_url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"display_name" text NOT NULL,
	"instrument" text,
	"level" text,
	"playing_level" text,
	"location" text,
	"bio" text,
	"avatar_url" text,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"first_name" text,
	"last_name" text,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bar_annotations" ADD CONSTRAINT "bar_annotations_learning_plan_id_learning_plans_id_fk" FOREIGN KEY ("learning_plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_annotations" ADD CONSTRAINT "bar_annotations_lesson_day_id_lesson_days_id_fk" FOREIGN KEY ("lesson_day_id") REFERENCES "public"."lesson_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_annotations" ADD CONSTRAINT "bar_annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_flags" ADD CONSTRAINT "bar_flags_learning_plan_id_learning_plans_id_fk" FOREIGN KEY ("learning_plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_flags" ADD CONSTRAINT "bar_flags_lesson_day_id_lesson_days_id_fk" FOREIGN KEY ("lesson_day_id") REFERENCES "public"."lesson_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_flags" ADD CONSTRAINT "bar_flags_measure_id_measures_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."measures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_flags" ADD CONSTRAINT "bar_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_scores" ADD CONSTRAINT "community_scores_piece_id_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_scores" ADD CONSTRAINT "community_scores_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_scores" ADD CONSTRAINT "community_scores_sheet_music_id_sheet_music_id_fk" FOREIGN KEY ("sheet_music_id") REFERENCES "public"."sheet_music"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_scores" ADD CONSTRAINT "community_scores_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_repertoire_entry_id_repertoire_entries_id_fk" FOREIGN KEY ("repertoire_entry_id") REFERENCES "public"."repertoire_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_sheet_music_id_sheet_music_id_fk" FOREIGN KEY ("sheet_music_id") REFERENCES "public"."sheet_music"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_days" ADD CONSTRAINT "lesson_days_learning_plan_id_learning_plans_id_fk" FOREIGN KEY ("learning_plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_days" ADD CONSTRAINT "lesson_days_section_id_plan_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."plan_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_progress" ADD CONSTRAINT "measure_progress_learning_plan_id_learning_plans_id_fk" FOREIGN KEY ("learning_plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_progress" ADD CONSTRAINT "measure_progress_measure_id_measures_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."measures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_progress" ADD CONSTRAINT "measure_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_sheet_music_id_sheet_music_id_fk" FOREIGN KEY ("sheet_music_id") REFERENCES "public"."sheet_music"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_piece_id_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_progress" ADD CONSTRAINT "passage_progress_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_progress" ADD CONSTRAINT "passage_progress_learning_plan_id_learning_plans_id_fk" FOREIGN KEY ("learning_plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_progress" ADD CONSTRAINT "passage_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_learning_plan_id_learning_plans_id_fk" FOREIGN KEY ("learning_plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_section_id_plan_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."plan_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_analyses" ADD CONSTRAINT "piece_analyses_piece_id_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_milestones" ADD CONSTRAINT "piece_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_milestones" ADD CONSTRAINT "piece_milestones_piece_id_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_milestones" ADD CONSTRAINT "piece_milestones_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_composer_id_composers_id_fk" FOREIGN KEY ("composer_id") REFERENCES "public"."composers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_section_phases" ADD CONSTRAINT "plan_section_phases_section_id_plan_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."plan_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_sections" ADD CONSTRAINT "plan_sections_learning_plan_id_learning_plans_id_fk" FOREIGN KEY ("learning_plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_suggestions" ADD CONSTRAINT "plan_suggestions_learning_plan_id_learning_plans_id_fk" FOREIGN KEY ("learning_plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_suggestions" ADD CONSTRAINT "plan_suggestions_triggered_by_lesson_id_lesson_days_id_fk" FOREIGN KEY ("triggered_by_lesson_id") REFERENCES "public"."lesson_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_suggestions" ADD CONSTRAINT "plan_suggestions_section_id_plan_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."plan_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertoire_entries" ADD CONSTRAINT "repertoire_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertoire_entries" ADD CONSTRAINT "repertoire_entries_composer_id_composers_id_fk" FOREIGN KEY ("composer_id") REFERENCES "public"."composers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertoire_entries" ADD CONSTRAINT "repertoire_entries_piece_id_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertoire_entries" ADD CONSTRAINT "repertoire_entries_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_task_feedback" ADD CONSTRAINT "session_task_feedback_lesson_day_id_lesson_days_id_fk" FOREIGN KEY ("lesson_day_id") REFERENCES "public"."lesson_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_task_feedback" ADD CONSTRAINT "session_task_feedback_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_task_feedback" ADD CONSTRAINT "session_task_feedback_learning_plan_id_learning_plans_id_fk" FOREIGN KEY ("learning_plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_task_feedback" ADD CONSTRAINT "session_task_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_music" ADD CONSTRAINT "sheet_music_piece_id_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_music" ADD CONSTRAINT "sheet_music_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_music_pages" ADD CONSTRAINT "sheet_music_pages_sheet_music_id_sheet_music_id_fk" FOREIGN KEY ("sheet_music_id") REFERENCES "public"."sheet_music"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;