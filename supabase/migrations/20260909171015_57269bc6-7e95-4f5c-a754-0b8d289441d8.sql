CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;

DROP POLICY "own profile" ON public.profiles;
CREATE POLICY "own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR private.is_staff(auth.uid()));

DROP POLICY "own roles" ON public.user_roles;
CREATE POLICY "own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

DROP POLICY "own inventory" ON public.inventory_items;
CREATE POLICY "own inventory" ON public.inventory_items FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

DROP POLICY "own ledger" ON public.ledger_entries;
CREATE POLICY "own ledger" ON public.ledger_entries FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

DROP POLICY "staff read audit" ON public.admin_audit_log;
CREATE POLICY "staff read audit" ON public.admin_audit_log FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY "own upgrades" ON public.upgrades;
CREATE POLICY "own upgrades" ON public.upgrades FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

DROP POLICY "own contracts" ON public.contracts;
CREATE POLICY "own contracts" ON public.contracts FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

DROP FUNCTION public.has_role(uuid, public.app_role);
DROP FUNCTION public.is_staff(uuid);

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

CREATE TABLE public.battle_seeds (
  battle_id uuid PRIMARY KEY REFERENCES public.battles(id) ON DELETE CASCADE,
  server_seed text NOT NULL,
  client_seed text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.battle_seeds TO service_role;
ALTER TABLE public.battle_seeds ENABLE ROW LEVEL SECURITY;