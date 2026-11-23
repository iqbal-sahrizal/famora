-- Migration 0031: Allow recipients to delete their own notifications within their family

CREATE POLICY "notifications_delete_recipient" ON public.notifications
  FOR DELETE TO authenticated
  USING (recipient_member_id = famora.current_member_id(family_id));
