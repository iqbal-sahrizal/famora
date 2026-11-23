-- Migration 0025: Family Memories (Private Storage, Albums, Photo/Video Memories, Personal Journals, Favorites)

-- 1. Create private Supabase Storage bucket for family memories
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'family-memories',
  'family-memories',
  false,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Memory Albums
CREATE TABLE public.memory_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  cover_storage_path TEXT,
  visibility TEXT NOT NULL DEFAULT 'family' CHECK (visibility IN ('family', 'adults_only', 'shared', 'private')),
  shared_with_member_ids UUID[] NOT NULL DEFAULT '{}',
  event_name TEXT NOT NULL DEFAULT '' CHECK (char_length(event_name) <= 120),
  event_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_albums_family ON public.memory_albums(family_id, created_at DESC);
CREATE TRIGGER trg_memory_albums_updated_at
  BEFORE UPDATE ON public.memory_albums
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Memory Items (Photos, Videos, Personal Journals, Important Moments)
CREATE TABLE public.memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  album_id UUID REFERENCES public.memory_albums(id) ON DELETE SET NULL,
  author_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video', 'journal')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  journal_entry TEXT NOT NULL DEFAULT '' CHECK (char_length(journal_entry) <= 6000),
  moment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  event_label TEXT NOT NULL DEFAULT '' CHECK (char_length(event_label) <= 100),
  is_important BOOLEAN NOT NULL DEFAULT false,
  visibility TEXT NOT NULL DEFAULT 'family' CHECK (visibility IN ('family', 'adults_only', 'shared', 'private')),
  shared_with_member_ids UUID[] NOT NULL DEFAULT '{}',
  storage_path TEXT,
  thumbnail_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT CHECK (size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 52428800)),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_items_family_date ON public.memory_items(family_id, moment_date DESC, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_memory_items_album ON public.memory_items(album_id, moment_date DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_memory_items_updated_at
  BEFORE UPDATE ON public.memory_items
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Memory Favorites
CREATE TABLE public.memory_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES public.memory_items(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (memory_id, member_id)
);

CREATE INDEX idx_memory_favorites_member ON public.memory_favorites(family_id, member_id);
CREATE TRIGGER trg_memory_favorites_updated_at
  BEFORE UPDATE ON public.memory_favorites
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.memory_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_albums FORCE ROW LEVEL SECURITY;
ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.memory_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_favorites FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.memory_albums, public.memory_items, public.memory_favorites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_albums, public.memory_items, public.memory_favorites TO authenticated;

-- Album Policies
CREATE POLICY "memory_albums_select_scoped" ON public.memory_albums
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND (
      visibility = 'family'
      OR created_by_member_id = famora.current_member_id(family_id)
      OR (visibility = 'shared' AND famora.current_member_id(family_id) = ANY(shared_with_member_ids))
      OR (visibility = 'adults_only' AND famora.has_permission(family_id, 'memories.manage'))
    )
  );

CREATE POLICY "memory_albums_insert_permitted" ON public.memory_albums
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_family_member(family_id)
    AND (visibility = 'private' OR famora.has_permission(family_id, 'memories.manage'))
  );

CREATE POLICY "memory_albums_update_owner_or_manager" ON public.memory_albums
  FOR UPDATE TO authenticated
  USING (
    created_by_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'memories.manage')
  )
  WITH CHECK (
    created_by_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'memories.manage')
  );

CREATE POLICY "memory_albums_delete_owner_or_manager" ON public.memory_albums
  FOR DELETE TO authenticated
  USING (
    created_by_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'memories.manage')
  );

-- Memory Item Policies
CREATE POLICY "memory_items_select_scoped" ON public.memory_items
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND famora.is_family_member(family_id)
    AND (
      visibility = 'family'
      OR author_member_id = famora.current_member_id(family_id)
      OR (visibility = 'shared' AND famora.current_member_id(family_id) = ANY(shared_with_member_ids))
      OR (visibility = 'adults_only' AND famora.has_permission(family_id, 'memories.manage'))
    )
  );

CREATE POLICY "memory_items_insert_permitted" ON public.memory_items
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_family_member(family_id)
    AND author_member_id = famora.current_member_id(family_id)
    AND (
      media_type = 'journal'
      OR visibility = 'private'
      OR famora.has_permission(family_id, 'memories.manage')
    )
  );

CREATE POLICY "memory_items_update_owner_or_manager" ON public.memory_items
  FOR UPDATE TO authenticated
  USING (
    author_member_id = famora.current_member_id(family_id)
    OR (visibility <> 'private' AND famora.has_permission(family_id, 'memories.manage'))
  )
  WITH CHECK (
    author_member_id = famora.current_member_id(family_id)
    OR (visibility <> 'private' AND famora.has_permission(family_id, 'memories.manage'))
  );

-- Favorites Policies
CREATE POLICY "memory_favorites_select_member" ON public.memory_favorites
  FOR SELECT TO authenticated
  USING (famora.is_family_member(family_id));

CREATE POLICY "memory_favorites_insert_own" ON public.memory_favorites
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_family_member(family_id)
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "memory_favorites_delete_own" ON public.memory_favorites
  FOR DELETE TO authenticated
  USING (member_id = famora.current_member_id(family_id));

-- Private Storage Object Policies (path convention: {family_id}/{member_id}/{filename})
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "family_memories_storage_select" ON storage.objects;
      CREATE POLICY "family_memories_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'family-memories'
          AND famora.is_family_member((storage.foldername(name))[1]::uuid)
        );

      DROP POLICY IF EXISTS "family_memories_storage_insert" ON storage.objects;
      CREATE POLICY "family_memories_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'family-memories'
          AND famora.is_family_member((storage.foldername(name))[1]::uuid)
        );

      DROP POLICY IF EXISTS "family_memories_storage_delete" ON storage.objects;
      CREATE POLICY "family_memories_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'family-memories'
          AND (
            famora.has_permission((storage.foldername(name))[1]::uuid, 'memories.manage')
            OR (storage.foldername(name))[2] = famora.current_member_id((storage.foldername(name))[1]::uuid)::text
          )
        );
    $p$;
  END IF;
END $$;
