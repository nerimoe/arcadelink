ALTER TABLE shops ADD COLUMN hero_hash TEXT;
-- Existing covers use v=original until replaced; new uploads use their SHA-256.
