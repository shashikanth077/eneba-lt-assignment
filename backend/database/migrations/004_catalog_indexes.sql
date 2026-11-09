-- Genre is a filter and a facet (GROUP BY genre).
CREATE INDEX idx_products_genre ON products (genre);
