-- Migration 0028: Famora AI Family Assistant (Conversations, Messages, Usage Tracking, Rate Limiting)

CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_conversations_member ON public.ai_conversations(family_id, member_id, updated_at DESC);
CREATE TRIGGER trg_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1 AND char_length(content) <= 12000),
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposed_action JSONB,
  action_status TEXT NOT NULL DEFAULT 'none' CHECK (action_status IN ('none', 'pending_confirmation', 'confirmed', 'cancelled')),
  provider_name TEXT NOT NULL DEFAULT 'famora_local',
  model_name TEXT NOT NULL DEFAULT 'context_engine_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_conv ON public.ai_messages(conversation_id, created_at ASC);
CREATE TRIGGER trg_ai_messages_updated_at
  BEFORE UPDATE ON public.ai_messages
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  status TEXT NOT NULL CHECK (status IN ('ok', 'rate_limited', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_member_time ON public.ai_usage_logs(family_id, member_id, created_at DESC);
CREATE TRIGGER trg_ai_usage_logs_updated_at
  BEFORE UPDATE ON public.ai_usage_logs
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_conversations, public.ai_messages, public.ai_usage_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations, public.ai_messages TO authenticated;
GRANT SELECT, INSERT ON public.ai_usage_logs TO authenticated;

CREATE POLICY "ai_conversations_owner_only" ON public.ai_conversations
  FOR ALL TO authenticated
  USING (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  )
  WITH CHECK (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "ai_messages_owner_only" ON public.ai_messages
  FOR ALL TO authenticated
  USING (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  )
  WITH CHECK (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "ai_usage_logs_owner_only" ON public.ai_usage_logs
  FOR SELECT TO authenticated
  USING (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "ai_usage_logs_insert_self" ON public.ai_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  );
