-- ponytail: keep one small logo inline in D1; move image storage to R2 when size/count grows.
ALTER TABLE shops ADD COLUMN logo_data TEXT;
