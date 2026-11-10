-- Key lifecycle, made explicit: available -> reserved (order_id, reserved_until) -> sold (order_id, sold_at).
-- sold_at is the moment the key was delivered to the buyer's order. Existing sold keys are back-filled from their order.
ALTER TABLE game_keys ADD COLUMN sold_at DATETIME NULL DEFAULT NULL AFTER reserved_until;

UPDATE game_keys k
JOIN orders o ON o.id = k.order_id
SET k.sold_at = COALESCE(o.paid_at, o.created_at)
WHERE k.status = 'sold' AND k.sold_at IS NULL;
