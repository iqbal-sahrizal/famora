-- Migration 0014: Full Family Task Management (Multiple Assignees, Subtasks, Comments, Attachments, History, Recurrence)

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'household' CHECK (category IN ('household', 'chores', 'school', 'errands', 'health', 'other')),
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL;

-- 1. Multiple assignees per task
CREATE TABLE public.task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_task_assignee UNIQUE (task_id, member_id)
);

CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX idx_task_assignees_member ON public.task_assignees(member_id);
CREATE TRIGGER trg_task_assignees_updated_at
  BEFORE UPDATE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. Subtasks
CREATE TABLE public.task_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_subtasks_task ON public.task_subtasks(task_id, sort_order);
CREATE TRIGGER trg_task_subtasks_updated_at
  BEFORE UPDATE ON public.task_subtasks
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Task comments
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_comments_task ON public.task_comments(task_id, created_at);
CREATE TRIGGER trg_task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Task attachments metadata
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL CHECK (char_length(trim(file_name)) BETWEEN 1 AND 180),
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_attachments_task ON public.task_attachments(task_id);
CREATE TRIGGER trg_task_attachments_updated_at
  BEFORE UPDATE ON public.task_attachments
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 5. Task history
CREATE TABLE public.task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (char_length(trim(event_type)) BETWEEN 2 AND 60),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_history_task ON public.task_history(task_id, created_at DESC);
CREATE TRIGGER trg_task_history_updated_at
  BEFORE UPDATE ON public.task_history
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_subtasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.task_assignees, public.task_subtasks, public.task_comments, public.task_attachments, public.task_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_assignees, public.task_subtasks, public.task_comments, public.task_attachments TO authenticated;
GRANT SELECT, INSERT ON public.task_history TO authenticated;

CREATE POLICY "task_assignees_select_member" ON public.task_assignees
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "task_assignees_write_manager" ON public.task_assignees
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'tasks.manage_all'))
  WITH CHECK (famora.has_permission(family_id, 'tasks.manage_all'));

CREATE POLICY "task_subtasks_select_member" ON public.task_subtasks
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "task_subtasks_write_member" ON public.task_subtasks
  FOR ALL TO authenticated
  USING (famora.is_family_member(family_id))
  WITH CHECK (famora.is_family_member(family_id));

CREATE POLICY "task_comments_select_member" ON public.task_comments
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "task_comments_insert_member" ON public.task_comments
  FOR INSERT TO authenticated WITH CHECK (famora.is_family_member(family_id));
CREATE POLICY "task_comments_delete_author_or_manager" ON public.task_comments
  FOR DELETE TO authenticated
  USING (
    author_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'tasks.manage_all')
  );

CREATE POLICY "task_attachments_select_member" ON public.task_attachments
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "task_attachments_write_member" ON public.task_attachments
  FOR ALL TO authenticated
  USING (famora.is_family_member(family_id))
  WITH CHECK (famora.is_family_member(family_id));

CREATE POLICY "task_history_select_member" ON public.task_history
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "task_history_insert_member" ON public.task_history
  FOR INSERT TO authenticated WITH CHECK (famora.is_family_member(family_id));
