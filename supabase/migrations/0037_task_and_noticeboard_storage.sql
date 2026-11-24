-- Migration 0037: Private Storage Buckets for Task & Noticeboard Attachments (S4)
-- Adds private buckets `family-tasks` and `family-noticeboard` and optional `attachment_storage_path` on `family_announcements`.
-- Note: Do NOT apply directly to production without staging verification.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'family-tasks',
    'family-tasks',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'family-noticeboard',
    'family-noticeboard',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.family_announcements
  ADD COLUMN IF NOT EXISTS attachment_storage_path TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "family_tasks_storage_select" ON storage.objects;
      CREATE POLICY "family_tasks_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'family-tasks'
          AND famora.is_family_member((storage.foldername(name))[1]::uuid)
        );

      DROP POLICY IF EXISTS "family_tasks_storage_insert" ON storage.objects;
      CREATE POLICY "family_tasks_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'family-tasks'
          AND famora.is_family_member((storage.foldername(name))[1]::uuid)
        );

      DROP POLICY IF EXISTS "family_tasks_storage_delete" ON storage.objects;
      CREATE POLICY "family_tasks_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'family-tasks'
          AND famora.is_family_member((storage.foldername(name))[1]::uuid)
        );

      DROP POLICY IF EXISTS "family_noticeboard_storage_select" ON storage.objects;
      CREATE POLICY "family_noticeboard_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'family-noticeboard'
          AND famora.is_family_member((storage.foldername(name))[1]::uuid)
        );

      DROP POLICY IF EXISTS "family_noticeboard_storage_insert" ON storage.objects;
      CREATE POLICY "family_noticeboard_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'family-noticeboard'
          AND famora.has_permission((storage.foldername(name))[1]::uuid, 'announcements.publish')
        );

      DROP POLICY IF EXISTS "family_noticeboard_storage_delete" ON storage.objects;
      CREATE POLICY "family_noticeboard_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'family-noticeboard'
          AND famora.has_permission((storage.foldername(name))[1]::uuid, 'announcements.publish')
        );
    $p$;
  END IF;
END $$;
