CREATE TABLE users (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(50)  NOT NULL,
    token_version INT UNSIGNED NOT NULL DEFAULT 0, -- bump to revoke every JWT of this user
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per login attempt; the rate limiter counts recent failures.
CREATE TABLE login_attempts (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ip           VARCHAR(45) NOT NULL,
    email_hash   CHAR(64)    NOT NULL, -- sha256 of the lower-cased email: no raw emails of strangers kept
    succeeded    TINYINT(1)  NOT NULL DEFAULT 0,
    attempted_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_attempts_ip_time (ip, attempted_at),
    KEY idx_attempts_email_time (email_hash, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
