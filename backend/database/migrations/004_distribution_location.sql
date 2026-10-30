CREATE TABLE distribution_counties (name VARCHAR(50) PRIMARY KEY);
INSERT INTO distribution_counties (name) VALUES
  ('Baringo'),('Bomet'),('Bungoma'),('Busia'),('Elgeyo-Marakwet'),('Embu'),('Garissa'),('Homa Bay'),
  ('Isiolo'),('Kajiado'),('Kakamega'),('Kericho'),('Kiambu'),('Kilifi'),('Kirinyaga'),('Kisii'),('Kisumu'),
  ('Kitui'),('Kwale'),('Laikipia'),('Lamu'),('Machakos'),('Makueni'),('Mandera'),('Marsabit'),('Meru'),
  ('Migori'),('Mombasa'),('Murang''a'),('Nairobi'),('Nakuru'),('Nandi'),('Narok'),('Nyamira'),('Nyandarua'),
  ('Nyeri'),('Samburu'),('Siaya'),('Taita-Taveta'),('Tana River'),('Tharaka-Nithi'),('Trans Nzoia'),
  ('Turkana'),('Uasin Gishu'),('Vihiga'),('Wajir'),('West Pokot');

-- Existing printed codes remain valid identifiers; their distribution must be assigned by an administrator.
ALTER TABLE product_codes ADD COLUMN distribution_county VARCHAR(50) REFERENCES distribution_counties(name);
ALTER TABLE verification_records
  ADD COLUMN distribution_county VARCHAR(50) REFERENCES distribution_counties(name),
  ADD COLUMN location_source VARCHAR(20) NOT NULL DEFAULT 'legacy' CHECK (location_source IN ('legacy','device_reported','unavailable')),
  ADD COLUMN location_status VARCHAR(30) NOT NULL DEFAULT 'not_checked' CHECK (location_status IN
    ('not_checked','unavailable','stale','inaccurate','outside_kenya','boundary_uncertain','unassigned','matched','mismatch'));
ALTER TABLE verification_records DROP CONSTRAINT verification_records_result_check;
ALTER TABLE verification_records ADD CONSTRAINT verification_records_result_check CHECK
  (result IN ('verified','expired','inactive','suspicious','unregistered','invalid','reported','review_required'));
ALTER TABLE verification_records DROP CONSTRAINT verification_records_code_result;
ALTER TABLE verification_records ADD CONSTRAINT verification_records_code_result CHECK (
  (result IN ('unregistered','invalid') AND product_code_id IS NULL)
  OR (result IN ('verified','expired','inactive','suspicious','reported','review_required') AND product_code_id IS NOT NULL)
);
ALTER TABLE verification_records DROP CONSTRAINT verification_records_reason_check;
ALTER TABLE verification_records ADD CONSTRAINT verification_records_reason_check CHECK
  (reason IN ('legacy','matched','not_found','malformed','expired','product_inactive','code_inactive',
    'product_flagged','code_flagged','not_yet_manufactured','location_unavailable','location_stale',
    'location_inaccurate','location_outside_kenya','location_uncertain','distribution_unassigned','distribution_mismatch'));
COMMENT ON COLUMN verification_records.county IS 'Historical profile county for older records; device-derived verification county for new checks. Never assume a profile county is current location.';
COMMENT ON COLUMN verification_records.distribution_county IS 'Private distribution assignment at verification time. Excluded from public responses and farmer history.';
COMMENT ON COLUMN verification_records.location_source IS 'Device-reported coordinates are untrusted client input; only the derived county is retained, not precise coordinates.';
