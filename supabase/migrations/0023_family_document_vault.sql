-- Migration 0023: Family Document Vault (Private Storage Bucket, Metadata, Sharing, Expiration, History)

-- 1. Create private Supabase Storage bucket (public = false)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'family-documents',
  'family-documents',
  false,
  15728640,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Documents metadata table
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  owner_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  category TEXT NOT NULL CHECK (category IN ('identity', 'certificates', 'education', 'insurance', 'property', 'vehicles', 'financial', 'other')),
  sensitivity TEXT NOT NULL DEFAULT 'standard' CHECK (sensitivity IN ('standard', 'sensitive_vault')),
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  expires_on DATE,
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 800),
  shared_with_member_ids UUID[] NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_family_cat ON public.documents(family_id, category) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_expires ON public.documents(family_id, expires_on) WHERE expires_on IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Document audit history
CREATE TABLE public.document_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('uploaded', 'viewed', 'downloaded', 'shared', 'updated', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_history_doc ON public.document_history(document_id, created_at DESC);
CREATE TRIGGER trg_document_history_updated_at
  BEFORE UPDATE ON public.document_history
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.documents, public.document_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT ON public.document_history TO authenticated;

CREATE POLICY "documents_select_scoped" ON public.documents
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (
        sensitivity = 'standard'
        AND (
          famora.has_permission(family_id, 'documents.standard.manage')
          OR owner_member_id = famora.current_member_id(family_id)
          OR famora.current_member_id(family_id) = ANY(shared_with_member_ids)
        )
      )
      OR (
        sensitivity = 'sensitive_vault'
        AND famora.has_permission(family_id, 'documents.sensitive_vault')
      )
    )
  );

CREATE POLICY "documents_insert_permitted" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    (sensitivity = 'standard' AND famora.has_permission(family_id, 'documents.standard.manage'))
    OR (sensitivity = 'sensitive_vault' AND famora.has_permission(family_id, 'documents.sensitive_vault'))
  );

CREATE POLICY "documents_update_delete_permitted" ON public.documents
  FOR UPDATE TO authenticated
  USING (
    owner_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'documents.sensitive_vault')
  )
  WITH CHECK (
    owner_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'documents.sensitive_vault')
  );

CREATE POLICY "document_history_select" ON public.document_history
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'documents.standard.manage') OR famora.has_permission(family_id, 'documents.sensitive_vault'));
CREATE POLICY "document_history_insert" ON public.document_history
  FOR INSERT TO authenticated
  WITH CHECK (famora.is_family_member(family_id));

-- Private Storage Object Policies (path convention: {family_id}/{tier}/{filename})
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "family_docs_storage_select" ON storage.objects;
      CREATE POLICY "family_docs_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'family-documents'
          AND famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.standard.manage')
        );

      DROP POLICY IF EXISTS "family_docs_storage_insert" ON storage.objects;
      CREATE POLICY "family_docs_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'family-documents'
          AND famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.standard.manage')
        );

      DROP POLICY IF EXISTS "family_docs_storage_delete" ON storage.objects;
      CREATE POLICY "family_docs_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'family-documents'
          AND famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
        );
    $p$;
  END IF;
END $$;
