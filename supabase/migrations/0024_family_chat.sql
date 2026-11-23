-- Migration 0024: Family Chat (Group & Private Conversations, Messages, Reactions, Read Receipts, Private Attachments)

-- 1. Create private Supabase Storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Conversations table
CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('family_group', 'adults_group', 'direct', 'topic')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 100),
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_conversations_family ON public.chat_conversations(family_id, last_message_at DESC NULLS LAST);
CREATE TRIGGER trg_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Conversation participants + read receipts
CREATE TABLE public.chat_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  last_read_message_id UUID,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, member_id)
);

CREATE INDEX idx_chat_participants_member ON public.chat_participants(family_id, member_id);
CREATE TRIGGER trg_chat_participants_updated_at
  BEFORE UPDATE ON public.chat_participants
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Chat messages
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  client_nonce UUID,
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  reply_to_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_mime_type TEXT,
  attachment_size_bytes BIGINT CHECK (attachment_size_bytes IS NULL OR (attachment_size_bytes > 0 AND attachment_size_bytes <= 10485760)),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  pinned_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_content_present CHECK (char_length(trim(body)) > 0 OR attachment_path IS NOT NULL),
  UNIQUE (conversation_id, client_nonce)
);

CREATE INDEX idx_chat_messages_conv_created ON public.chat_messages(conversation_id, created_at DESC, id DESC);
CREATE INDEX idx_chat_messages_pinned ON public.chat_messages(conversation_id, is_pinned) WHERE is_pinned = true AND deleted_at IS NULL;
CREATE TRIGGER trg_chat_messages_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 5. Message reactions
CREATE TABLE public.chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(trim(emoji)) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, member_id, emoji)
);

CREATE INDEX idx_chat_reactions_message ON public.chat_message_reactions(message_id);
CREATE TRIGGER trg_chat_message_reactions_updated_at
  BEFORE UPDATE ON public.chat_message_reactions
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 6. Hardened membership check helper for chat conversations
CREATE OR REPLACE FUNCTION famora.is_chat_participant(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, famora
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_participants cp
    JOIN public.chat_conversations cc ON cc.id = cp.conversation_id
    JOIN public.family_members fm ON fm.id = cp.member_id
    WHERE cp.conversation_id = p_conversation_id
      AND fm.user_id = auth.uid()
      AND fm.status = 'active'
      AND (
        cc.kind <> 'adults_group'
        OR famora.has_permission(cc.family_id, 'chat.adults_only.participate')
      )
  );
$$;

REVOKE ALL ON FUNCTION famora.is_chat_participant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION famora.is_chat_participant(UUID) TO authenticated;

-- 7. Enable & Force RLS + Explicit Privileges
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reactions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_message_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_message_reactions TO authenticated;

-- Conversations policies
CREATE POLICY "chat_conversations_select_participant" ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (
    famora.is_chat_participant(id)
    OR (
      kind = 'family_group'
      AND famora.has_permission(family_id, 'chat.family.participate')
    )
    OR (
      kind = 'adults_group'
      AND famora.has_permission(family_id, 'chat.adults_only.participate')
    )
  );

CREATE POLICY "chat_conversations_insert_permitted" ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (kind = 'adults_group' AND famora.has_permission(family_id, 'chat.adults_only.participate'))
    OR (kind <> 'adults_group' AND famora.has_permission(family_id, 'chat.family.participate'))
  );

CREATE POLICY "chat_conversations_update_participant" ON public.chat_conversations
  FOR UPDATE TO authenticated
  USING (famora.is_chat_participant(id))
  WITH CHECK (famora.is_chat_participant(id));

-- Participants policies
CREATE POLICY "chat_participants_select_participant" ON public.chat_participants
  FOR SELECT TO authenticated
  USING (famora.is_chat_participant(conversation_id));

CREATE POLICY "chat_participants_insert_permitted" ON public.chat_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.has_permission(family_id, 'chat.family.participate')
    AND (
      member_id = famora.current_member_id(family_id)
      OR famora.is_chat_participant(conversation_id)
      OR EXISTS (
        SELECT 1 FROM public.chat_conversations cc
        WHERE cc.id = conversation_id AND cc.created_by_member_id = famora.current_member_id(family_id)
      )
    )
  );

CREATE POLICY "chat_participants_update_self" ON public.chat_participants
  FOR UPDATE TO authenticated
  USING (member_id = famora.current_member_id(family_id))
  WITH CHECK (member_id = famora.current_member_id(family_id));

-- Messages policies
CREATE POLICY "chat_messages_select_participant" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (famora.is_chat_participant(conversation_id));

CREATE POLICY "chat_messages_insert_participant" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_chat_participant(conversation_id)
    AND sender_member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "chat_messages_update_participant" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    famora.is_chat_participant(conversation_id)
    AND (
      sender_member_id = famora.current_member_id(family_id)
      OR famora.has_permission(family_id, 'chat.adults_only.participate')
    )
  )
  WITH CHECK (famora.is_chat_participant(conversation_id));

-- Reactions policies
CREATE POLICY "chat_reactions_select_participant" ON public.chat_message_reactions
  FOR SELECT TO authenticated
  USING (famora.is_chat_participant(conversation_id));

CREATE POLICY "chat_reactions_insert_participant" ON public.chat_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_chat_participant(conversation_id)
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "chat_reactions_delete_own" ON public.chat_message_reactions
  FOR DELETE TO authenticated
  USING (
    famora.is_chat_participant(conversation_id)
    AND member_id = famora.current_member_id(family_id)
  );

-- 8. Private Storage Policies (path convention: {family_id}/{conversation_id}/{filename})
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "chat_attachments_select" ON storage.objects;
      CREATE POLICY "chat_attachments_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'chat-attachments'
          AND famora.is_chat_participant((storage.foldername(name))[2]::uuid)
        );

      DROP POLICY IF EXISTS "chat_attachments_insert" ON storage.objects;
      CREATE POLICY "chat_attachments_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'chat-attachments'
          AND famora.is_chat_participant((storage.foldername(name))[2]::uuid)
        );

      DROP POLICY IF EXISTS "chat_attachments_delete" ON storage.objects;
      CREATE POLICY "chat_attachments_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'chat-attachments'
          AND famora.is_chat_participant((storage.foldername(name))[2]::uuid)
        );
    $p$;
  END IF;
END $$;

-- 9. Register tables for Supabase Realtime replication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages, public.chat_message_reactions, public.chat_participants;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
