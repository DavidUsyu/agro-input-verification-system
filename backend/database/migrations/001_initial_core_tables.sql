-- First milestone: accounts, product records and verification history.
-- Migrations run inside a transaction. Do not edit a migration after applying it.

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL CHECK (length(btrim(full_name)) > 0),
  phone VARCHAR(30) UNIQUE,
  email VARCHAR(160),
  password_hash TEXT NOT NULL CHECK (length(btrim(password_hash)) > 0),
  role VARCHAR(30) NOT NULL DEFAULT 'farmer'
    CHECK (role IN ('farmer', 'administrator')),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Internal references implement the diagram's "exactly one matching subtype".
  -- These values are computed by PostgreSQL and must never be supplied by clients.
  farmer_profile_id BIGINT GENERATED ALWAYS AS (
    CASE WHEN role = 'farmer' THEN id END
  ) STORED UNIQUE,
  administrator_profile_id BIGINT GENERATED ALWAYS AS (
    CASE WHEN role = 'administrator' THEN id END
  ) STORED UNIQUE,
  CONSTRAINT users_contact_required CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT users_phone_format CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT users_email_format CHECK (
    email = btrim(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE farmers (
  user_id BIGINT PRIMARY KEY,
  county VARCHAR(80) CHECK (length(btrim(county)) > 0),
  preferred_channel VARCHAR(20) NOT NULL DEFAULT 'web'
    CHECK (preferred_channel IN ('web', 'ussd')),
  CONSTRAINT farmers_user_fk FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT farmers_matching_role_fk FOREIGN KEY (user_id)
    REFERENCES users (farmer_profile_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE administrators (
  user_id BIGINT PRIMARY KEY,
  staff_number VARCHAR(50) NOT NULL UNIQUE CHECK (length(btrim(staff_number)) > 0),
  permission_level VARCHAR(30) NOT NULL DEFAULT 'standard'
    CHECK (permission_level IN ('standard', 'super_admin')),
  CONSTRAINT administrators_user_fk FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT administrators_matching_role_fk FOREIGN KEY (user_id)
    REFERENCES users (administrator_profile_id) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE users ADD CONSTRAINT users_farmer_profile_fk
  FOREIGN KEY (farmer_profile_id) REFERENCES farmers (user_id)
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE users ADD CONSTRAINT users_administrator_profile_fk
  FOREIGN KEY (administrator_profile_id) REFERENCES administrators (user_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(160) NOT NULL CHECK (length(btrim(name)) > 0),
  category VARCHAR(30) NOT NULL CHECK (category IN ('seed', 'fertilizer')),
  manufacturer VARCHAR(160) NOT NULL CHECK (length(btrim(manufacturer)) > 0),
  registration_no VARCHAR(80) CHECK (length(btrim(registration_no)) > 0),
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspicious')),
  created_by BIGINT NOT NULL REFERENCES administrators (user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX products_created_by_idx ON products (created_by);
CREATE INDEX products_category_status_idx ON products (category, status);

CREATE TABLE product_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  code_value VARCHAR(80) NOT NULL CHECK (
    length(code_value) > 0 AND code_value !~ '[[:space:]]'
  ),
  batch_number VARCHAR(80) NOT NULL CHECK (length(btrim(batch_number)) > 0),
  manufacture_date DATE,
  expiry_date DATE NOT NULL,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (verification_status IN ('active', 'inactive', 'suspicious')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT product_codes_date_order CHECK (manufacture_date <= expiry_date)
);

CREATE UNIQUE INDEX product_codes_value_unique ON product_codes (upper(code_value));
CREATE INDEX product_codes_product_idx ON product_codes (product_id);

CREATE TABLE verification_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  farmer_id BIGINT REFERENCES farmers (user_id) ON DELETE SET NULL,
  product_code_id BIGINT REFERENCES product_codes (id) ON DELETE RESTRICT,
  entered_code VARCHAR(80) NOT NULL,
  result VARCHAR(30) NOT NULL
    CHECK (result IN ('verified', 'expired', 'suspicious', 'unregistered', 'invalid', 'reported')),
  channel VARCHAR(20) NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'ussd')),
  county VARCHAR(80) CHECK (length(btrim(county)) > 0),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT verification_records_input_required CHECK (
    result = 'invalid' OR length(btrim(entered_code)) > 0
  ),
  CONSTRAINT verification_records_code_result CHECK (
    (result IN ('unregistered', 'invalid') AND product_code_id IS NULL)
    OR (result IN ('verified', 'expired', 'suspicious', 'reported') AND product_code_id IS NOT NULL)
  )
);

CREATE INDEX verification_records_farmer_history_idx
  ON verification_records (farmer_id, verified_at DESC);
CREATE INDEX verification_records_code_history_idx
  ON verification_records (product_code_id, verified_at DESC);
CREATE INDEX verification_records_time_idx ON verification_records (verified_at DESC);

COMMENT ON COLUMN users.password_hash IS
  'A password hash produced by the authentication service; never store plaintext passwords.';
COMMENT ON COLUMN users.farmer_profile_id IS
  'Internal generated role reference; equals id only for farmers. Do not expose through account APIs.';
COMMENT ON COLUMN users.administrator_profile_id IS
  'Internal generated role reference; equals id only for administrators. Do not expose through account APIs.';
COMMENT ON COLUMN products.registration_no IS
  'Optional reference supplied with a product record; storage does not imply regulatory approval.';
COMMENT ON COLUMN verification_records.entered_code IS
  'Submitted input retained even when no registered product code matches.';
COMMENT ON COLUMN verification_records.result IS
  'Historical outcome, not recomputed when product status or expiry changes. Reported is reserved for the reporting milestone.';
