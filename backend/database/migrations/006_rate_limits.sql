-- Fixed-window request counters for the abuse limits (App\Support\RateLimiter): one row per (limit name, who, window).
-- The primary key makes "count this request" a single atomic INSERT ... ON DUPLICATE KEY UPDATE, with no read-then-write race.
CREATE TABLE rate_limits (
    bucket       VARCHAR(40)  NOT NULL,   -- which limit: register, checkout, search
    subject      VARCHAR(64)  NOT NULL,   -- who: client IP, or user id
    window_start INT UNSIGNED NOT NULL,   -- unix time the window began (a multiple of the window length)
    hits         INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket, subject, window_start),
    KEY idx_rate_limits_old (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
