CREATE TABLE product_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  farmer_id BIGINT NOT NULL REFERENCES farmers(user_id) ON DELETE RESTRICT,
  product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
  product_code_id BIGINT REFERENCES product_codes(id) ON DELETE RESTRICT,
  verification_id BIGINT REFERENCES verification_records(id) ON DELETE SET NULL,
  verification_result VARCHAR(30),
  product_name VARCHAR(160) NOT NULL CHECK (length(btrim(product_name)) > 0),
  category VARCHAR(20) NOT NULL CHECK (category IN ('seed', 'fertilizer')),
  entered_code VARCHAR(80),
  seller_name VARCHAR(160),
  seller_location VARCHAR(300),
  county VARCHAR(80) REFERENCES distribution_counties(name),
  reason VARCHAR(40) NOT NULL CHECK (reason IN ('suspected_counterfeit','expired','damaged_packaging','wrong_label','unknown_code','other')),
  description VARCHAR(2000) NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 2000),
  status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','resolved')),
  resolution VARCHAR(30) CHECK (resolution IN ('action_taken','no_action','insufficient_information')),
  response VARCHAR(2000),
  internal_note VARCHAR(2000),
  reviewed_by BIGINT REFERENCES administrators(user_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((status='resolved' AND resolution IS NOT NULL AND length(btrim(coalesce(response,''))) > 0)
    OR (status<>'resolved' AND resolution IS NULL)),
  CHECK ((status='submitted' AND reviewed_by IS NULL) OR (status<>'submitted' AND reviewed_by IS NOT NULL))
);
CREATE INDEX product_reports_farmer_time_idx ON product_reports(farmer_id,created_at DESC,id DESC);
CREATE INDEX product_reports_status_time_idx ON product_reports(status,created_at DESC,id DESC);

CREATE TABLE report_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES product_reports(id) ON DELETE RESTRICT,
  administrator_id BIGINT NOT NULL REFERENCES administrators(user_id) ON DELETE RESTRICT,
  from_status VARCHAR(20) NOT NULL CHECK (from_status IN ('submitted','under_review','resolved')),
  to_status VARCHAR(20) NOT NULL CHECK (to_status IN ('under_review','resolved')),
  resolution VARCHAR(30) CHECK (resolution IN ('action_taken','no_action','insufficient_information')),
  response VARCHAR(2000),
  internal_note VARCHAR(2000),
  report_version INTEGER NOT NULL CHECK (report_version > 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (report_id,report_version)
);
COMMENT ON TABLE product_reports IS 'Farmer observations awaiting investigation; submission does not establish counterfeiting or change product/code status.';
COMMENT ON COLUMN product_reports.county IS 'Optional county supplied by the reporter, not device-confirmed verification location.';
COMMENT ON TABLE report_reviews IS 'Append-only application review history. Response is farmer-visible; internal notes and reviewer identities are administrator-only.';
