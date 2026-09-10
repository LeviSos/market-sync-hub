CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT 'Player',
  avatar_url text,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 300),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chat_messages TO anon, authenticated;
GRANT INSERT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat public read" ON public.chat_messages FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "chat insert own" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_deleted = false
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND NOT p.is_muted AND NOT p.is_banned)
  );

CREATE POLICY "chat staff moderate" ON public.chat_messages FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE INDEX chat_messages_recent_idx ON public.chat_messages (created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;