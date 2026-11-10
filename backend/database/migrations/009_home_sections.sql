-- Homepage sections: the category shortcut strip, "recently viewed" (drawn in the browser: no endpoint), "recommended for you" and
-- "upcoming games". Existing rows keep their content; only their order moves to make room. Safe on a fresh database too (the seeder
-- writes the same rows).
INSERT INTO home_blocks (slug, type, title, endpoint, position, config) VALUES
    ('categories', 'shortcuts', 'Categories', '/api/home/categories', 2, '{"genres":4}'),
    ('recently_viewed', 'recent', 'Recently viewed', '', 3, '{"limit":6}'),
    ('recommended', 'carousel', 'Recommended for you', '/api/home/recommended', 4, '{"limit":10}'),
    ('upcoming', 'carousel', 'Upcoming games', '/api/home/upcoming', 8, '{"limit":10}')
ON DUPLICATE KEY UPDATE type = VALUES(type), title = VALUES(title), endpoint = VALUES(endpoint), position = VALUES(position), config = VALUES(config);

UPDATE home_blocks SET position = 5 WHERE slug = 'best_sellers';
UPDATE home_blocks SET position = 6 WHERE slug = 'deals';
UPDATE home_blocks SET position = 7 WHERE slug = 'new_releases';

-- Demo data ages: when no product has a future release date, schedule a few (same rule as the seeder).
UPDATE products SET release_date = DATE_ADD(CURDATE(), INTERVAL (id % 9) * 11 + 7 DAY)
WHERE id % 10 = 3 AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM products WHERE release_date > CURDATE() LIMIT 1) future);
