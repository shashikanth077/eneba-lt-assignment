CREATE TABLE banners (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug       VARCHAR(60)  NOT NULL,
    title      VARCHAR(120) NOT NULL,
    subtitle   VARCHAR(200) NOT NULL,
    cta_label  VARCHAR(40)  NOT NULL,
    href       VARCHAR(200) NOT NULL,
    image_svg  MEDIUMTEXT   NOT NULL, -- served by /api/images/banners/{slug}.svg
    position   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    active     TINYINT(1)   NOT NULL DEFAULT 1,
    UNIQUE KEY uq_banners_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The homepage layout lives in the database: the frontend only renders what GET /api/home/layout returns.
CREATE TABLE home_blocks (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug     VARCHAR(40)  NOT NULL,  -- banner, best_sellers, deals, new_releases
    type     VARCHAR(40)  NOT NULL,  -- frontend component: hero | carousel
    title    VARCHAR(120) NOT NULL,
    endpoint VARCHAR(120) NOT NULL,  -- the block's own data source
    position SMALLINT UNSIGNED NOT NULL,
    enabled  TINYINT(1)   NOT NULL DEFAULT 1,
    config   JSON NULL,
    UNIQUE KEY uq_home_blocks_slug (slug),
    KEY idx_home_blocks_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
