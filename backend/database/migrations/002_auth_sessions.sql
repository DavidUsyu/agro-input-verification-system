CREATE TABLE auth_sessions (
  token_hash CHAR(64) PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT auth_sessions_expiry_order CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (expires_at);
COMMENT ON COLUMN auth_sessions.token_hash IS
  'SHA-256 digest of a cryptographically random session token. Raw tokens exist only in HttpOnly cookies.';
