CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_role_chk CHECK (role IN ('homeowner', 'contractor', 'admin'))
);

CREATE TABLE IF NOT EXISTS contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  phone TEXT,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'active',
  service_area_city TEXT NOT NULL,
  service_area_state TEXT,
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  jobs_completed_base INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contractors_rating_chk CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT contractors_status_chk CHECK (status IN ('active', 'inactive', 'suspended'))
);

CREATE TABLE IF NOT EXISTS contractor_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
  service_type TEXT NOT NULL,
  CONSTRAINT contractor_services_service_type_chk
    CHECK (service_type IN ('Plumbing', 'Electrical', 'Carpentry', 'General Repairs')),
  CONSTRAINT contractor_services_unique UNIQUE (contractor_id, service_type)
);

CREATE TABLE IF NOT EXISTS homeowners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  email CITEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id UUID REFERENCES homeowners(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_email CITEXT NOT NULL,
  customer_phone TEXT,
  service_type TEXT NOT NULL,
  description TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  budget_min_cents INT,
  budget_max_cents INT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  CONSTRAINT jobs_service_type_chk
    CHECK (service_type IN ('Plumbing', 'Electrical', 'Carpentry', 'General Repairs')),
  CONSTRAINT jobs_status_chk
    CHECK (status IN ('new', 'accepted', 'scheduled', 'in_progress', 'completed', 'canceled')),
  CONSTRAINT jobs_budget_chk
    CHECK (
      budget_min_cents IS NULL
      OR budget_max_cents IS NULL
      OR budget_min_cents <= budget_max_cents
    )
);

CREATE TABLE IF NOT EXISTS job_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  note TEXT,
  CONSTRAINT job_assignments_status_chk
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'canceled'))
);

CREATE TABLE IF NOT EXISTS job_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_quotes_amount_chk CHECK (amount_cents >= 0),
  CONSTRAINT job_quotes_status_chk CHECK (status IN ('submitted', 'accepted', 'rejected', 'withdrawn'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contractor_id UUID REFERENCES contractors(id) ON DELETE RESTRICT,
  job_id UUID REFERENCES jobs(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_type_chk
    CHECK (type IN ('job_assigned', 'job_declined', 'job_scheduled', 'customer_message', 'system_alert'))
);

CREATE TABLE IF NOT EXISTS job_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_messages_sender_role_chk CHECK (sender_role IN ('homeowner', 'contractor', 'admin'))
);

CREATE TABLE IF NOT EXISTS job_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INT NOT NULL,
  storage_key TEXT NOT NULL,
  storage_provider TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_attachments_file_size_chk CHECK (file_size_bytes >= 0)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_assignments_one_active_per_job_idx
  ON job_assignments (job_id)
  WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS jobs_status_created_at_idx
  ON jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS jobs_city_service_status_idx
  ON jobs (city, service_type, status);

CREATE INDEX IF NOT EXISTS job_assignments_contractor_status_assigned_at_idx
  ON job_assignments (contractor_id, status, assigned_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_read_created_at_idx
  ON notifications (user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS job_messages_job_created_at_idx
  ON job_messages (job_id, created_at);

CREATE INDEX IF NOT EXISTS jobs_homeowner_id_idx
  ON jobs (homeowner_id);

CREATE INDEX IF NOT EXISTS homeowners_email_idx
  ON homeowners (email);

DROP TRIGGER IF EXISTS users_updated_at_tg ON users;
CREATE TRIGGER users_updated_at_tg
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS contractors_updated_at_tg ON contractors;
CREATE TRIGGER contractors_updated_at_tg
BEFORE UPDATE ON contractors
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS homeowners_updated_at_tg ON homeowners;
CREATE TRIGGER homeowners_updated_at_tg
BEFORE UPDATE ON homeowners
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS jobs_updated_at_tg ON jobs;
CREATE TRIGGER jobs_updated_at_tg
BEFORE UPDATE ON jobs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS job_quotes_updated_at_tg ON job_quotes;
CREATE TRIGGER job_quotes_updated_at_tg
BEFORE UPDATE ON job_quotes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
