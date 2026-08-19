-- Fixed-window quotas create short-lived buckets. Keep retention cleanup indexed so
-- abuse controls remain cheap as the number of users and scopes grows.

create index if not exists orbit_rate_limit_buckets_window_idx
  on private.orbit_rate_limit_buckets(window_started_at);
