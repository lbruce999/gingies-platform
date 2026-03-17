ALTER TABLE users
ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE users
SET username = (
  COALESCE(
    NULLIF(
      regexp_replace(split_part(lower(email::text), '@', 1), '[^a-z0-9_.-]+', '_', 'g'),
      ''
    ),
    'user'
  ) || '_' || substring(replace(id::text, '-', '') FROM 1 FOR 8)
)
WHERE username IS NULL;

ALTER TABLE users
ALTER COLUMN username SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_username_key'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END;
$$;
