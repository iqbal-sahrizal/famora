-- Migration 0040: Native Android FCM device tokens, update notification categories, and Android APK release manifest

-- 1. Extend user_devices for native Android FCM tokens & installed app version tracking
ALTER TABLE public.user_devices
  DROP CONSTRAINT IF EXISTS user_devices_platform_check;

ALTER TABLE public.user_devices
  ADD CONSTRAINT user_devices_platform_check
  CHECK (platform IN ('web', 'ios_pwa', 'android_pwa', 'desktop_pwa', 'android_fcm'));

ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS fcm_token TEXT,
  ADD COLUMN IF NOT EXISTS app_version_code INTEGER,
  ADD COLUMN IF NOT EXISTS app_version_name TEXT;

CREATE INDEX IF NOT EXISTS idx_user_devices_fcm_active
  ON public.user_devices(user_id)
  WHERE revoked_at IS NULL AND fcm_token IS NOT NULL;

-- 2. Extend notifications.category to support system_update & app_update
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_category_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_category_check
  CHECK (category IN (
    'invitation',
    'announcement',
    'calendar',
    'task_assignment',
    'task_deadline',
    'shopping',
    'bill_reminder',
    'document_expiration',
    'chat',
    'activity',
    'system_update',
    'app_update'
  ));

-- 3. Android APK Release Manifests (public read for enabled releases, service-role write only)
CREATE TABLE IF NOT EXISTS public.app_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android')),
  latest_version TEXT NOT NULL,
  version_code INTEGER NOT NULL CHECK (version_code > 0),
  minimum_supported_version_code INTEGER NOT NULL
    CHECK (minimum_supported_version_code > 0 AND minimum_supported_version_code <= version_code),
  download_url TEXT NOT NULL,
  release_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  sha256 TEXT NOT NULL CHECK (char_length(sha256) = 64),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, version_code)
);

CREATE INDEX IF NOT EXISTS idx_app_releases_latest_enabled
  ON public.app_releases(platform, enabled, version_code DESC);

CREATE TRIGGER trg_app_releases_updated_at
  BEFORE UPDATE ON public.app_releases
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_releases FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_releases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_releases TO anon, authenticated;

CREATE POLICY "app_releases_select_enabled" ON public.app_releases
  FOR SELECT TO anon, authenticated
  USING (enabled = true);

-- 4. Idempotency guard for Android release update notifications (service-role only)
CREATE TABLE IF NOT EXISTS public.app_release_notifications (
  release_version_code INTEGER PRIMARY KEY,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipients_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_app_release_notifications_updated_at
  BEFORE UPDATE ON public.app_release_notifications
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

ALTER TABLE public.app_release_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_release_notifications FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_release_notifications FROM PUBLIC, anon, authenticated;
