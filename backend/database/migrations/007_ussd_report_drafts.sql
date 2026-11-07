CREATE TABLE ussd_report_drafts (
  farmer_id BIGINT PRIMARY KEY REFERENCES farmers(user_id) ON DELETE CASCADE,
  id UUID NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  state JSONB NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','submitted','discarded')),
  report_id BIGINT REFERENCES product_reports(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '24 hours'),
  CHECK ((status = 'submitted') = (report_id IS NOT NULL))
);
CREATE INDEX ussd_report_drafts_expiry_idx ON ussd_report_drafts(expires_at);
COMMENT ON TABLE ussd_report_drafts IS 'One unfinished report per farmer, resumable after fresh PIN authentication for 24 hours after the last answer. Contains report fields only, never PINs or raw callback text. Revisions reject concurrent stale sessions; terminal rows prevent duplicate submissions.';
