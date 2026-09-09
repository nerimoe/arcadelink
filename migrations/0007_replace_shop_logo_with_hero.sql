-- Shop covers replace logos. Existing square logos are intentionally not reused.
ALTER TABLE shops DROP COLUMN logo_data;
ALTER TABLE shops ADD COLUMN hero_data TEXT;
