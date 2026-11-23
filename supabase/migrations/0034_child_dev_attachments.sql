-- Migration 0034: Child Development Private Storage Bucket & Attachments (AUD-011)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'family-child-attachments',
  'family-child-attachments',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.child_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_profile_id UUID NOT NULL REFERENCES public.child_profiles(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('health', 'education', 'milestone')),
  file_name TEXT NOT NULL CHECK (char_length(trim(file_name)) BETWEEN 1 AND 180),
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 500),
  uploaded_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_child_attachments_child ON public.child_attachments(family_id, child_profile_id, created_at DESC);
CREATE TRIGGER trg_child_attachments_updated_at
  BEFORE UPDATE ON public.child_attachments
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

ALTER TABLE public.child_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_attachments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.child_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_attachments TO authenticated;

CREATE POLICY "child_attachments_select_permitted" ON public.child_attachments
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN record_type = 'health' THEN famora.has_permission(family_id, 'child_dev.health.view')
      ELSE famora.has_permission(family_id, 'child_dev.identity.view')
    END
  );

CREATE POLICY "child_attachments_write_permitted" ON public.child_attachments
  FOR ALL TO authenticated
  USING (
    CASE
      WHEN record_type = 'health' THEN famora.has_permission(family_id, 'child_dev.health.view')
      ELSE famora.has_permission(family_id, 'child_dev.growth_milestones.manage')
    END
  )
  WITH CHECK (
    CASE
      WHEN record_type = 'health' THEN famora.has_permission(family_id, 'child_dev.health.view')
      ELSE famora.has_permission(family_id, 'child_dev.growth_milestones.manage')
    END
  );

-- Private storage policies for family-child-attachments
CREATE POLICY "child_attachments_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'family-child-attachments'
    AND famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.identity.view')
  );

CREATE POLICY "child_attachments_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'family-child-attachments'
    AND famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.growth_milestones.manage')
  );

CREATE POLICY "child_attachments_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'family-child-attachments'
    AND famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.growth_milestones.manage')
  );
