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