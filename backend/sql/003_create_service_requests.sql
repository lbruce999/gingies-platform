ALTER TABLE jobs
DROP CONSTRAINT IF EXISTS jobs_service_type_chk;

ALTER TABLE jobs
ADD CONSTRAINT jobs_service_type_chk
  CHECK (
    service_type IN (
      'Plumbing',
      'Electrical',
      'HVAC',
      'Roofing',
      'Handyman',
      'Landscaping',
      'Cleaning',
      'Painting',
      'Moving',
      'General Home Repair',
      'Carpentry',
      'General Repairs'
    )
  );

ALTER TABLE contractor_services
DROP CONSTRAINT IF EXISTS contractor_services_service_type_chk;

ALTER TABLE contractor_services
ADD CONSTRAINT contractor_services_service_type_chk
  CHECK (
    service_type IN (
      'Plumbing',
      'Electrical',
      'HVAC',
      'Roofing',
      'Handyman',
      'Landscaping',
      'Cleaning',
      'Painting',
      'Moving',
      'General Home Repair',
      'Carpentry',
      'General Repairs'
    )
  );

CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_type TEXT NOT NULL,
  service_subtype TEXT,
  address TEXT,
  zip_code TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email CITEXT NOT NULL,
  preferred_contact_method TEXT NOT NULL,
  project_description TEXT NOT NULL,
  urgency TEXT NOT NULL,
  property_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  CONSTRAINT service_requests_service_type_chk
    CHECK (
      service_type IN (
        'Plumbing',
        'Electrical',
        'HVAC',
        'Roofing',
        'Handyman',
        'Landscaping',
        'Cleaning',
        'Painting',
        'Moving',
        'General Home Repair'
      )
    ),
  CONSTRAINT service_requests_location_chk
    CHECK (address IS NOT NULL OR zip_code IS NOT NULL),
  CONSTRAINT service_requests_address_chk
    CHECK (address IS NULL OR length(btrim(address)) > 0),
  CONSTRAINT service_requests_zip_code_chk
    CHECK (zip_code IS NULL OR zip_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  CONSTRAINT service_requests_state_chk
    CHECK (state ~ '^[A-Z]{2}$'),
  CONSTRAINT service_requests_preferred_contact_method_chk
    CHECK (preferred_contact_method IN ('phone', 'email', 'text')),
  CONSTRAINT service_requests_urgency_chk
    CHECK (urgency IN ('emergency', 'within_24_hours', 'this_week', 'flexible')),
  CONSTRAINT service_requests_property_type_chk
    CHECK (
      property_type IN (
        'single_family',
        'townhouse',
        'condo',
        'apartment',
        'multifamily',
        'commercial',
        'other'
      )
    ),
  CONSTRAINT service_requests_status_chk
    CHECK (status IN ('new', 'in_review', 'contacted', 'scheduled', 'closed'))
);

CREATE INDEX IF NOT EXISTS service_requests_status_created_at_idx
  ON service_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS service_requests_service_type_status_idx
  ON service_requests (service_type, status);

CREATE INDEX IF NOT EXISTS service_requests_city_state_zip_code_idx
  ON service_requests (city, state, zip_code);

CREATE INDEX IF NOT EXISTS service_requests_email_idx
  ON service_requests (email);

DROP TRIGGER IF EXISTS service_requests_updated_at_tg ON service_requests;
CREATE TRIGGER service_requests_updated_at_tg
BEFORE UPDATE ON service_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
