-- Migration 0036: Align Storage RLS Policies with Document Vault & Child Attachments Permissions
-- Fixes BUG-016 (family-documents) and BUG-017 (family-child-attachments):
-- 1. family-documents ({family_id}/{tier}/{filename}):
--    - 'vault' tier strictly requires documents.sensitive_vault for SELECT/INSERT/DELETE.
--    - 'standard' tier allows documents.standard.manage OR documents.sensitive_vault for SELECT/INSERT/DELETE.
-- 2. family-child-attachments ({family_id}/{child_profile_id}/{filename}):
--    - SELECT allows child_dev.identity.view, child_dev.health.view, or child_dev.growth_milestones.manage.
--    - INSERT/DELETE allows child_dev.growth_milestones.manage or child_dev.health.view.
-- Note: Do NOT apply to production directly without staging verification.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "family_docs_storage_select" ON storage.objects;
      CREATE POLICY "family_docs_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'family-documents'
          AND CASE
            WHEN (storage.foldername(name))[2] = 'vault'
              THEN famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
            ELSE (
              famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.standard.manage')
              OR famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
            )
          END
        );

      DROP POLICY IF EXISTS "family_docs_storage_insert" ON storage.objects;
      CREATE POLICY "family_docs_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'family-documents'
          AND CASE
            WHEN (storage.foldername(name))[2] = 'vault'
              THEN famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
            ELSE (
              famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.standard.manage')
              OR famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
            )
          END
        );

      DROP POLICY IF EXISTS "family_docs_storage_delete" ON storage.objects;
      CREATE POLICY "family_docs_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'family-documents'
          AND CASE
            WHEN (storage.foldername(name))[2] = 'vault'
              THEN famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
            ELSE (
              famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.standard.manage')
              OR famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
            )
          END
        );

      DROP POLICY IF EXISTS "child_attachments_storage_select" ON storage.objects;
      CREATE POLICY "child_attachments_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'family-child-attachments'
          AND (
            famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.identity.view')
            OR famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.health.view')
            OR famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.growth_milestones.manage')
          )
        );

      DROP POLICY IF EXISTS "child_attachments_storage_insert" ON storage.objects;
      CREATE POLICY "child_attachments_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'family-child-attachments'
          AND (
            famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.growth_milestones.manage')
            OR famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.health.view')
          )
        );

      DROP POLICY IF EXISTS "child_attachments_storage_delete" ON storage.objects;
      CREATE POLICY "child_attachments_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'family-child-attachments'
          AND (
            famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.growth_milestones.manage')
            OR famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.health.view')
          )
        );
    $p$;
  END IF;
END $$;
