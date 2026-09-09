ALTER TABLE shops ADD COLUMN public_id TEXT;

UPDATE shops
SET public_id = lower(substr(replace(id, '-', ''), 1, 12))
WHERE public_id IS NULL;

CREATE UNIQUE INDEX idx_shops_public_id ON shops(public_id);
