-- NULL = the address has not been confirmed yet. Existing accounts stay unverified until they use a link.
ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL DEFAULT NULL AFTER display_name;

-- Only the SHA-256 of a token is stored: a copy of this table cannot be used to verify anybody.
CREATE TABLE email_verifications (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64)  NOT NULL,
    expires_at DATETIME  NOT NULL,
    used_at    DATETIME  NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_email_verifications_token (token_hash),
    KEY idx_email_verifications_user (user_id),
    CONSTRAINT fk_email_verifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
