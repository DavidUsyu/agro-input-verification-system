-- Separate PIN credentials and durable, retry-safe USSD sessions.
CREATE TABLE ussd_credentials (
  farmer_id BIGINT PRIMARY KEY REFERENCES farmers(user_id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  version CHAR(64) NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ussd_sessions (
  id VARCHAR(128) PRIMARY KEY,
  phone_digest CHAR(64) NOT NULL,
  service_code VARCHAR(40) NOT NULL,
  farmer_id BIGINT REFERENCES farmers(user_id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  depth INTEGER NOT NULL DEFAULT 0,
  text_digest CHAR(64) NOT NULL,
  response TEXT NOT NULL,
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '5 minutes')
);
CREATE INDEX ussd_sessions_expiry_idx ON ussd_sessions(expires_at);
ALTER TABLE product_reports ADD COLUMN channel VARCHAR(20) NOT NULL DEFAULT 'web'
  CHECK (channel IN ('web','ussd'));
ALTER TABLE verification_records DROP CONSTRAINT verification_records_location_source_check;
ALTER TABLE verification_records ADD CONSTRAINT verification_records_location_source_check
  CHECK (location_source IN ('legacy','device_reported','unavailable','self_reported'));
ALTER TABLE verification_records DROP CONSTRAINT verification_records_reason_check;
ALTER TABLE verification_records ADD CONSTRAINT verification_records_reason_check CHECK
  (reason IN ('legacy','matched','not_found','malformed','expired','product_inactive','code_inactive',
    'product_flagged','code_flagged','not_yet_manufactured','location_unavailable','location_stale',
    'location_inaccurate','location_outside_kenya','location_uncertain','distribution_unassigned',
    'distribution_mismatch','location_self_reported'));
COMMENT ON TABLE ussd_sessions IS 'No raw callback text or PINs. Digests bind cumulative requests; effects and responses commit together. Expired sessions are purged on new sessions.';
COMMENT ON COLUMN verification_records.location_source IS 'USSD self_reported counties are declarations, not device coordinates. No raw coordinates retained.';
