CREATE TABLE oauth_credentials (
  identity_id TEXT PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  access_token_expires_at TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  last_cards_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE passkeys ADD COLUMN aaguid TEXT;
ALTER TABLE passkeys ADD COLUMN provider_name TEXT;
