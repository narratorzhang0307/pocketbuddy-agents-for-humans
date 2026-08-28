-- Frost Health Taskmaster · TiDB 事实层 v2
-- 原则：原始事实 append-only；修正通过 supersedes_event_id 追加新版本；event_id 全局幂等。

CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(64) PRIMARY KEY,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  profile_json JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  device_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  hardware_kind VARCHAR(32) NOT NULL,
  firmware_version VARCHAR(64) NOT NULL,
  paired_at TIMESTAMP(3) NOT NULL,
  last_seen_at TIMESTAMP(3) NULL,
  state VARCHAR(32) NOT NULL,
  INDEX idx_devices_user (user_id)
);

CREATE TABLE IF NOT EXISTS health_events (
  event_id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  domain VARCHAR(24) NOT NULL,
  event_type VARCHAR(48) NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  provider VARCHAR(96) NOT NULL,
  facts_json JSON NOT NULL,
  confidence DECIMAL(5,4) NOT NULL,
  model_version VARCHAR(128) NOT NULL,
  tool_version VARCHAR(128) NOT NULL,
  input_hash VARCHAR(128) NOT NULL,
  visibility VARCHAR(16) NOT NULL DEFAULT 'private',
  sync_state VARCHAR(16) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  supersedes_event_id VARCHAR(128) NULL,
  inserted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_health_user_time (user_id, occurred_at),
  INDEX idx_health_domain_time (domain, occurred_at),
  INDEX idx_health_supersedes (supersedes_event_id)
);

CREATE TABLE IF NOT EXISTS device_events (
  event_id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  event_kind VARCHAR(48) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  accuracy_m DECIMAL(9,2) NULL,
  payload_json JSON NOT NULL,
  media_json JSON NULL,
  sync_state VARCHAR(16) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  inserted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_device_events_user_time (user_id, occurred_at),
  INDEX idx_device_events_device_time (device_id, occurred_at)
);

CREATE TABLE IF NOT EXISTS meal_events (
  meal_id VARCHAR(128) PRIMARY KEY,
  health_event_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  meal_slot VARCHAR(24) NULL,
  total_calories_kcal DECIMAL(10,2) NULL,
  total_protein_g DECIMAL(10,2) NULL,
  total_carbs_g DECIMAL(10,2) NULL,
  total_fat_g DECIMAL(10,2) NULL,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at TIMESTAMP(3) NOT NULL,
  UNIQUE KEY uk_meal_health_event (health_event_id),
  INDEX idx_meals_user_time (user_id, occurred_at)
);

CREATE TABLE IF NOT EXISTS meal_items (
  item_id VARCHAR(128) PRIMARY KEY,
  meal_id VARCHAR(128) NOT NULL,
  label VARCHAR(160) NOT NULL,
  canonical_food_id VARCHAR(128) NULL,
  portion_g DECIMAL(10,2) NULL,
  portion_method VARCHAR(48) NOT NULL,
  calories_kcal DECIMAL(10,2) NULL,
  protein_g DECIMAL(10,2) NULL,
  carbs_g DECIMAL(10,2) NULL,
  fat_g DECIMAL(10,2) NULL,
  confidence DECIMAL(5,4) NOT NULL,
  nutrition_source VARCHAR(256) NULL,
  INDEX idx_meal_items_meal (meal_id)
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  workout_id VARCHAR(128) PRIMARY KEY,
  health_event_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  started_at TIMESTAMP(3) NULL,
  ended_at TIMESTAMP(3) NOT NULL,
  duration_s INT UNSIGNED NOT NULL,
  distance_m DECIMAL(12,2) NOT NULL,
  steps INT UNSIGNED NULL,
  workout_type VARCHAR(48) NOT NULL,
  UNIQUE KEY uk_workout_health_event (health_event_id),
  INDEX idx_workouts_user_time (user_id, ended_at)
);

CREATE TABLE IF NOT EXISTS route_points (
  workout_id VARCHAR(128) NOT NULL,
  sequence_no INT UNSIGNED NOT NULL,
  occurred_at TIMESTAMP(3) NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  altitude_m DECIMAL(9,2) NULL,
  accuracy_m DECIMAL(9,2) NULL,
  PRIMARY KEY (workout_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS nature_moments (
  moment_id VARCHAR(128) PRIMARY KEY,
  health_event_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  workout_id VARCHAR(128) NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  label VARCHAR(160) NOT NULL DEFAULT 'unknown',
  confidence DECIMAL(5,4) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  location_is_blurred BOOLEAN NOT NULL DEFAULT TRUE,
  media_json JSON NULL,
  UNIQUE KEY uk_nature_health_event (health_event_id),
  INDEX idx_nature_user_time (user_id, occurred_at)
);

CREATE TABLE IF NOT EXISTS skills (
  skill_id VARCHAR(128) PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  version VARCHAR(64) NOT NULL,
  manifest_json JSON NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS skill_sessions (
  session_id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  skill_id VARCHAR(128) NOT NULL,
  task_id VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  started_at TIMESTAMP(3) NOT NULL,
  completed_at TIMESTAMP(3) NULL,
  result_json JSON NULL,
  UNIQUE KEY uk_skill_task (task_id, skill_id),
  INDEX idx_skill_sessions_user_time (user_id, started_at)
);

CREATE TABLE IF NOT EXISTS task_sessions (
  task_id VARCHAR(128) PRIMARY KEY,
  run_id VARCHAR(160) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  skill_id VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  checkpoint_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  UNIQUE KEY uk_task_run (run_id),
  INDEX idx_tasks_user_time (user_id, updated_at)
);

CREATE TABLE IF NOT EXISTS task_signals (
  signal_id VARCHAR(192) PRIMARY KEY,
  task_id VARCHAR(128) NOT NULL,
  run_id VARCHAR(160) NOT NULL,
  action_id VARCHAR(192) NOT NULL,
  correlation_id VARCHAR(224) NOT NULL,
  signal_kind VARCHAR(32) NOT NULL,
  actor VARCHAR(24) NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  payload_json JSON NOT NULL,
  events_json JSON NULL,
  inserted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_signals_task_time (task_id, occurred_at),
  INDEX idx_signals_correlation (correlation_id)
);

CREATE TABLE IF NOT EXISTS effect_records (
  effect_id VARCHAR(224) PRIMARY KEY,
  idempotency_key VARCHAR(256) NOT NULL,
  task_id VARCHAR(128) NOT NULL,
  run_id VARCHAR(160) NOT NULL,
  action_id VARCHAR(192) NOT NULL,
  permission VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL,
  input_json JSON NOT NULL,
  result_json JSON NULL,
  event_ids_json JSON NOT NULL,
  error_text VARCHAR(500) NULL,
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  UNIQUE KEY uk_effect_idempotency (idempotency_key),
  INDEX idx_effect_task_action (task_id, action_id)
);

CREATE TABLE IF NOT EXISTS run_trace_events (
  trace_id VARCHAR(192) PRIMARY KEY,
  run_id VARCHAR(160) NOT NULL,
  task_id VARCHAR(128) NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  event_type VARCHAR(48) NOT NULL,
  actor VARCHAR(24) NOT NULL,
  detail VARCHAR(500) NOT NULL,
  data_json JSON NOT NULL,
  INDEX idx_trace_run_time (run_id, occurred_at)
);

CREATE TABLE IF NOT EXISTS memory_summaries (
  summary_id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  summary_day DATE NOT NULL,
  summary_json JSON NOT NULL,
  source_event_ids_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_summary_user_day (user_id, summary_day)
);

CREATE TABLE IF NOT EXISTS map_objects (
  object_id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  source_event_id VARCHAR(128) NOT NULL,
  object_type VARCHAR(32) NOT NULL,
  visibility VARCHAR(16) NOT NULL DEFAULT 'private',
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  geometry_json JSON NULL,
  content_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  INDEX idx_map_user_time (user_id, created_at),
  INDEX idx_map_source (source_event_id)
);

-- 若部署的 TiDB 版本支持向量类型，再为经过脱敏的检索文本单独建向量表。
-- 向量只能帮助召回，权限判断必须继续依赖 user_id、visibility 与服务端策略。
