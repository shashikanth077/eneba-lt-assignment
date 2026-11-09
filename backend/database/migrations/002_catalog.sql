CREATE TABLE platforms (
    id   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(40) NOT NULL,
    name VARCHAR(60) NOT NULL,
    UNIQUE KEY uq_platforms_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE regions (
    id   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(40) NOT NULL,
    name VARCHAR(60) NOT NULL,
    UNIQUE KEY uq_regions_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sellers (
    id     INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name   VARCHAR(80)  NOT NULL,
    rating DECIMAL(2,1) NOT NULL, -- 0.0 - 5.0
    UNIQUE KEY uq_sellers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug         VARCHAR(160) NOT NULL,
    name         VARCHAR(160) NOT NULL,
    name_norm    VARCHAR(160) NOT NULL, -- lower-cased, accent-free name used by search
    description  TEXT         NOT NULL,
    genre        VARCHAR(40)  NOT NULL,
    publisher    VARCHAR(80)  NOT NULL,
    release_date DATE         NOT NULL,
    platform_id  SMALLINT UNSIGNED NOT NULL,
    region_id    SMALLINT UNSIGNED NOT NULL,
    cover_svg    MEDIUMTEXT   NOT NULL, -- generated cover, served by /api/images/products/{slug}.svg
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_products_slug (slug),
    KEY idx_products_platform (platform_id),
    KEY idx_products_region (region_id),
    KEY idx_products_release (release_date),
    KEY idx_products_name_norm (name_norm),
    CONSTRAINT fk_products_platform FOREIGN KEY (platform_id) REFERENCES platforms (id),
    CONSTRAINT fk_products_region   FOREIGN KEY (region_id)   REFERENCES regions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE offers (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    product_id  INT UNSIGNED NOT NULL,
    seller_id   INT UNSIGNED NOT NULL,
    price_cents INT UNSIGNED NOT NULL,
    currency    CHAR(3)      NOT NULL DEFAULT 'EUR',
    active      TINYINT(1)   NOT NULL DEFAULT 1,
    UNIQUE KEY uq_offers_product_seller (product_id, seller_id),
    KEY idx_offers_price (product_id, price_cents),
    CONSTRAINT fk_offers_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_offers_seller  FOREIGN KEY (seller_id)  REFERENCES sellers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deals are their own source for the homepage "deals" block: an offer with a crossed-out price.
CREATE TABLE deals (
    id                   INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offer_id             INT UNSIGNED NOT NULL,
    original_price_cents INT UNSIGNED NOT NULL,
    discount_pct         TINYINT UNSIGNED NOT NULL,
    ends_at              DATETIME NULL, -- NULL = ongoing
    UNIQUE KEY uq_deals_offer (offer_id),
    CONSTRAINT fk_deals_offer FOREIGN KEY (offer_id) REFERENCES offers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Own source for the "best sellers" block and for popularity sorting.
CREATE TABLE product_stats (
    product_id INT UNSIGNED NOT NULL PRIMARY KEY,
    units_sold INT UNSIGNED NOT NULL DEFAULT 0,
    view_count INT UNSIGNED NOT NULL DEFAULT 0,
    popularity INT UNSIGNED NOT NULL DEFAULT 0,
    KEY idx_stats_popularity (popularity),
    KEY idx_stats_sold (units_sold),
    CONSTRAINT fk_stats_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per sellable key. key_enc is libsodium-encrypted; key_hash (sha256 of the plain key)
-- lets the seeder be idempotent without ever decrypting. order_id gets its FK in the checkout migration.
CREATE TABLE game_keys (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offer_id       INT UNSIGNED NOT NULL,
    key_enc        VARCHAR(255) NOT NULL,
    key_hash       CHAR(64)     NOT NULL,
    status         ENUM('available','reserved','sold') NOT NULL DEFAULT 'available',
    order_id       BIGINT UNSIGNED NULL,
    reserved_until DATETIME NULL,
    UNIQUE KEY uq_keys_hash (key_hash),
    KEY idx_keys_offer_status (offer_id, status, id),
    KEY idx_keys_reserved (status, reserved_until),
    CONSTRAINT fk_keys_offer FOREIGN KEY (offer_id) REFERENCES offers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
