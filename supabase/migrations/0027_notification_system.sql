-- Migration 0027: Notification System (Outbox Pattern, Delivery Logs, Idempotency, Web Push)

-- 1. Extend existing notifications table with category, idempotency_key, and push_status
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'activity'
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
      'activity'
    )),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS push_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (push_status IN ('pending', 'sent', 'suppressed_quiet_hours', 'suppressed_preference', 'failed', 'skipped'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_recipient_idempotency
  ON public.notifications(recipient_member_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Extend member_preferences with per-category disabled list
ALTER TABLE public.member_preferences
  ADD COLUMN IF NOT EXISTS disabled_categories TEXT[] NOT NULL DEFAULT '{}';

-- 3. Notification Outbox (reliable delivery, deduplication, retry tracking)
CREATE TABLE public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'push')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, channel)
);

CREATE INDEX idx_notification_outbox_pending ON public.notification_outbox(status, next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_notification_outbox_recipient ON public.notification_outbox(recipient_member_id, created_at DESC);
CREATE TRIGGER trg_notification_outbox_updated_at
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Delivery & Failure Logs per device
CREATE TABLE public.notification_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  outbox_id UUID NOT NULL REFERENCES public.notification_outbox(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.user_devices(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'expired_subscription', 'suppressed')),
  http_status INTEGER,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_delivery_logs_outbox ON public.notification_delivery_logs(outbox_id, created_at DESC);
CREATE TRIGGER trg_notification_delivery_logs_updated_at
  BEFORE UPDATE ON public.notification_delivery_logs
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_logs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_outbox, public.notification_delivery_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_outbox TO authenticated;
GRANT SELECT, INSERT ON public.notification_delivery_logs TO authenticated;

CREATE POLICY "notification_outbox_select_recipient" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (
    recipient_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'workspace.settings.manage')
  );

CREATE POLICY "notification_outbox_insert_member" ON public.notification_outbox
  FOR INSERT TO authenticated
  WITH CHECK (famora.is_family_member(family_id));

CREATE POLICY "notification_outbox_update_recipient_or_admin" ON public.notification_outbox
  FOR UPDATE TO authenticated
  USING (
    recipient_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'workspace.settings.manage')
  )
  WITH CHECK (famora.is_family_member(family_id));

CREATE POLICY "notification_delivery_logs_select_member" ON public.notification_delivery_logs
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND EXISTS (
      SELECT 1 FROM public.notification_outbox o
      WHERE o.id = outbox_id
        AND (
          o.recipient_member_id = famora.current_member_id(family_id)
          OR famora.has_permission(family_id, 'workspace.settings.manage')
        )
    )
  );

CREATE POLICY "notification_delivery_logs_insert_member" ON public.notification_delivery_logs
  FOR INSERT TO authenticated
  WITH CHECK (famora.is_family_member(family_id));
