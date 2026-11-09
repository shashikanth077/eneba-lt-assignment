-- Server-side cart: one row per (user, offer). Prices are never stored here, they are read live from offers.
CREATE TABLE cart_items (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED NOT NULL,
    offer_id   INT UNSIGNED NOT NULL,
    qty        TINYINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cart_user_offer (user_id, offer_id),
    CONSTRAINT fk_cart_user  FOREIGN KEY (user_id)  REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_offer FOREIGN KEY (offer_id) REFERENCES offers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- pending  = keys reserved, waiting for payment (until reserved_until)
-- paid     = payment confirmed by Stripe's webhook, keys sold
-- failed / expired / canceled = keys released
-- refund_needed = money was taken but the keys could not be delivered; refunded = we returned it
CREATE TABLE orders (
    id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id                  BIGINT UNSIGNED NOT NULL,
    status                   ENUM('pending','paid','failed','expired','canceled','refund_needed','refunded') NOT NULL DEFAULT 'pending',
    currency                 CHAR(3)      NOT NULL,
    total_cents              INT UNSIGNED NOT NULL,
    stripe_payment_intent_id VARCHAR(255) NULL,
    reserved_until           DATETIME     NOT NULL,   -- UTC
    paid_at                  DATETIME     NULL,       -- UTC
    failure_reason           VARCHAR(255) NULL,
    created_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_orders_payment_intent (stripe_payment_intent_id),
    KEY idx_orders_user_created (user_id, created_at, id),
    KEY idx_orders_status_reserved (status, reserved_until),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A snapshot: name and price as they were when the order was created, whatever the catalog does later.
CREATE TABLE order_items (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id         BIGINT UNSIGNED NOT NULL,
    offer_id         INT UNSIGNED NOT NULL,
    product_id       INT UNSIGNED NOT NULL,
    product_slug     VARCHAR(160) NOT NULL,
    product_name     VARCHAR(160) NOT NULL,
    seller_name      VARCHAR(80)  NOT NULL,
    unit_price_cents INT UNSIGNED NOT NULL,
    qty              TINYINT UNSIGNED NOT NULL,
    UNIQUE KEY uq_order_items_offer (order_id, offer_id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT fk_order_items_offer FOREIGN KEY (offer_id) REFERENCES offers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every Stripe event is processed once: the primary key is the dedupe.
CREATE TABLE stripe_events (
    event_id     VARCHAR(255) NOT NULL PRIMARY KEY,
    type         VARCHAR(100) NOT NULL,
    processed_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE game_keys ADD CONSTRAINT fk_keys_order FOREIGN KEY (order_id) REFERENCES orders (id);
CREATE INDEX idx_keys_order ON game_keys (order_id);
