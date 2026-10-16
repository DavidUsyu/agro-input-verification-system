-- Preserve the details used for each verification instead of recomputing history.
ALTER TABLE verification_records DROP CONSTRAINT verification_records_result_check;
ALTER TABLE verification_records ADD CONSTRAINT verification_records_result_check
  CHECK (result IN ('verified', 'expired', 'inactive', 'suspicious', 'unregistered', 'invalid', 'reported'));
ALTER TABLE verification_records DROP CONSTRAINT verification_records_code_result;
ALTER TABLE verification_records ADD CONSTRAINT verification_records_code_result CHECK (
  (result IN ('unregistered', 'invalid') AND product_code_id IS NULL)
  OR (result IN ('verified', 'expired', 'inactive', 'suspicious', 'reported') AND product_code_id IS NOT NULL)
);
ALTER TABLE verification_records
  ADD COLUMN reason VARCHAR(40) NOT NULL DEFAULT 'legacy'
    CHECK (reason IN ('legacy', 'matched', 'not_found', 'malformed', 'expired',
      'product_inactive', 'code_inactive', 'product_flagged', 'code_flagged', 'not_yet_manufactured')),
  ADD COLUMN product_snapshot JSONB CHECK (product_snapshot IS NULL OR jsonb_typeof(product_snapshot) = 'object'),
  ADD COLUMN actor_role VARCHAR(20) NOT NULL DEFAULT 'guest'
    CHECK (actor_role IN ('guest', 'farmer', 'administrator'));
UPDATE verification_records SET actor_role = 'farmer' WHERE farmer_id IS NOT NULL;
CREATE INDEX verification_records_result_time_idx ON verification_records (result, verified_at DESC);
COMMENT ON COLUMN verification_records.product_snapshot IS
  'Public product and batch details at verification time. Null for records created before snapshots were introduced.';
COMMENT ON COLUMN verification_records.reason IS
  'Saved explanation for the outcome. Legacy records retain their original result without a fabricated explanation.';
