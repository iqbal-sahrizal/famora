-- Migration 0005: Seed System Roles and Canonical Permission Catalog

INSERT INTO public.family_roles (family_id, role_key, display_name, description, is_system, rank_order)
VALUES
  (NULL, 'owner', 'Owner', 'Primary family custodian with full control including deletion.', true, 10),
  (NULL, 'admin', 'Admin', 'Co-manager with full operational control.', true, 20),
  (NULL, 'adult', 'Adult', 'Trusted household adult with daily management access.', true, 30),
  (NULL, 'teen', 'Teen', 'Age-appropriate autonomy for tasks, chat, and personal schedule.', true, 40),
  (NULL, 'child', 'Child', 'Simplified view for chores, habits, and rewards.', true, 50),
  (NULL, 'extended', 'Extended Family', 'Read-focused access to memories, calendar, and chat.', true, 60),
  (NULL, 'caregiver', 'Caregiver', 'Scoped access to child routines, safety cards, and assigned tasks.', true, 70)
ON CONFLICT (family_id, role_key) DO NOTHING;

INSERT INTO public.permissions (permission_key, domain, description)
VALUES
  ('family.delete', 'family', 'Delete or archive the entire family workspace'),
  ('family.settings.manage', 'family', 'Manage family profile, timezone, and custom roles'),
  ('family.members.invite_manage', 'family', 'Invite, update roles, or remove family members'),
  ('family.members.view', 'family', 'View active family member directory'),
  ('calendar.family.manage', 'calendar', 'Create and update shared family calendar events'),
  ('calendar.adults_only.view', 'calendar', 'View adults-only calendar events'),
  ('tasks.manage_all', 'tasks', 'Create and manage tasks across the family'),
  ('tasks.approve_chores', 'tasks', 'Approve completed chores and award points'),
  ('finance.accounts.manage', 'finance', 'Manage family financial accounts and budgets'),
  ('finance.transactions.manage', 'finance', 'Log and categorize family financial transactions'),
  ('finance.allowance.view_own', 'finance', 'View own allowance balance and history'),
  ('child_dev.manage', 'child-dev', 'Manage child profiles, milestones, and rewards'),
  ('child_dev.rewards.redeem', 'child-dev', 'Redeem earned reward points'),
  ('shopping.manage', 'shopping', 'Add, check off, and manage shopping list items'),
  ('inventory.manage', 'inventory', 'Manage household pantry and supply inventory'),
  ('documents.standard.manage', 'documents', 'Upload and manage standard family documents'),
  ('documents.sensitive_vault', 'documents', 'Access encrypted sensitive vault documents'),
  ('chat.family.participate', 'chat', 'Read and send messages in general family chat'),
  ('chat.adults_only.participate', 'chat', 'Participate in adults-only chat channels'),
  ('meals.manage', 'meals', 'Create recipes and weekly meal plans'),
  ('home.manage', 'home', 'Manage home assets, maintenance, and contractors'),
  ('memories.manage', 'memories', 'Upload and organize family memories and albums'),
  ('habits.manage_all', 'habits', 'Manage routines and habit trackers'),
  ('safety.contacts_medical.manage', 'safety', 'Manage emergency contacts and medical cards'),
  ('safety.sos.trigger', 'safety', 'Trigger emergency SOS alerts and safety check-ins'),
  ('ai.assistant.use', 'ai', 'Use the permission-scoped AI assistant'),
  ('audit_logs.view', 'settings', 'View family audit and activity logs')
ON CONFLICT (permission_key) DO NOTHING;

-- Map permissions to roles
WITH role_perm_map(r_key, p_key) AS (
  VALUES
    -- Owner gets all permissions
    ('owner', 'family.delete'), ('owner', 'family.settings.manage'), ('owner', 'family.members.invite_manage'), ('owner', 'family.members.view'),
    ('owner', 'calendar.family.manage'), ('owner', 'calendar.adults_only.view'), ('owner', 'tasks.manage_all'), ('owner', 'tasks.approve_chores'),
    ('owner', 'finance.accounts.manage'), ('owner', 'finance.transactions.manage'), ('owner', 'finance.allowance.view_own'),
    ('owner', 'child_dev.manage'), ('owner', 'child_dev.rewards.redeem'), ('owner', 'shopping.manage'), ('owner', 'inventory.manage'),
    ('owner', 'documents.standard.manage'), ('owner', 'documents.sensitive_vault'), ('owner', 'chat.family.participate'), ('owner', 'chat.adults_only.participate'),
    ('owner', 'meals.manage'), ('owner', 'home.manage'), ('owner', 'memories.manage'), ('owner', 'habits.manage_all'),
    ('owner', 'safety.contacts_medical.manage'), ('owner', 'safety.sos.trigger'), ('owner', 'ai.assistant.use'), ('owner', 'audit_logs.view'),

    -- Admin gets all except family.delete
    ('admin', 'family.settings.manage'), ('admin', 'family.members.invite_manage'), ('admin', 'family.members.view'),
    ('admin', 'calendar.family.manage'), ('admin', 'calendar.adults_only.view'), ('admin', 'tasks.manage_all'), ('admin', 'tasks.approve_chores'),
    ('admin', 'finance.accounts.manage'), ('admin', 'finance.transactions.manage'), ('admin', 'finance.allowance.view_own'),
    ('admin', 'child_dev.manage'), ('admin', 'child_dev.rewards.redeem'), ('admin', 'shopping.manage'), ('admin', 'inventory.manage'),
    ('admin', 'documents.standard.manage'), ('admin', 'documents.sensitive_vault'), ('admin', 'chat.family.participate'), ('admin', 'chat.adults_only.participate'),
    ('admin', 'meals.manage'), ('admin', 'home.manage'), ('admin', 'memories.manage'), ('admin', 'habits.manage_all'),
    ('admin', 'safety.contacts_medical.manage'), ('admin', 'safety.sos.trigger'), ('admin', 'ai.assistant.use'), ('admin', 'audit_logs.view'),

    -- Adult
    ('adult', 'family.members.view'), ('adult', 'calendar.family.manage'), ('adult', 'calendar.adults_only.view'),
    ('adult', 'tasks.manage_all'), ('adult', 'tasks.approve_chores'), ('adult', 'finance.transactions.manage'), ('adult', 'finance.allowance.view_own'),
    ('adult', 'child_dev.manage'), ('adult', 'shopping.manage'), ('adult', 'inventory.manage'), ('adult', 'documents.standard.manage'),
    ('adult', 'chat.family.participate'), ('adult', 'chat.adults_only.participate'), ('adult', 'meals.manage'), ('adult', 'home.manage'),
    ('adult', 'memories.manage'), ('adult', 'safety.contacts_medical.manage'), ('adult', 'safety.sos.trigger'), ('adult', 'ai.assistant.use'),

    -- Teen
    ('teen', 'family.members.view'), ('teen', 'calendar.family.manage'), ('teen', 'finance.allowance.view_own'),
    ('teen', 'child_dev.rewards.redeem'), ('teen', 'shopping.manage'), ('teen', 'chat.family.participate'),
    ('teen', 'meals.manage'), ('teen', 'memories.manage'), ('teen', 'safety.sos.trigger'), ('teen', 'ai.assistant.use'),

    -- Child
    ('child', 'family.members.view'), ('child', 'finance.allowance.view_own'), ('child', 'child_dev.rewards.redeem'),
    ('child', 'chat.family.participate'), ('child', 'safety.sos.trigger'),

    -- Extended
    ('extended', 'family.members.view'), ('extended', 'chat.family.participate'), ('extended', 'safety.sos.trigger'),

    -- Caregiver
    ('caregiver', 'family.members.view'), ('caregiver', 'shopping.manage'), ('caregiver', 'chat.family.participate'), ('caregiver', 'safety.sos.trigger')
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT fr.id, p.id
FROM role_perm_map m
JOIN public.family_roles fr ON fr.role_key = m.r_key AND fr.family_id IS NULL
JOIN public.permissions p ON p.permission_key = m.p_key
ON CONFLICT (role_id, permission_id) DO NOTHING;
