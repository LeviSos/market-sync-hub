-- ENUMS
CREATE TYPE public.app_role AS ENUM ('owner','admin','moderator','finance','support');
CREATE TYPE public.item_rarity AS ENUM ('consumer','industrial','milspec','restricted','classified','covert','exotic','contraband');
CREATE TYPE public.inventory_status AS ENUM ('owned','sold','withdrawn','used');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  steam_id text UNIQUE,
  username text NOT NULL DEFAULT 'Player',
  avatar_url text,
  trade_url text,
  level int NOT NULL DEFAULT 1,
  xp int NOT NULL DEFAULT 0,
  balance numeric(16,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  frozen_balance numeric(16,2) NOT NULL DEFAULT 0 CHECK (frozen_balance >= 0),
  rtp_override numeric(6,4),
  is_banned boolean NOT NULL DEFAULT false,
  is_muted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

CREATE POLICY "own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

-- ITEMS
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  image_url text,
  rarity public.item_rarity NOT NULL,
  weapon text,
  category text,
  base_price numeric(16,2) NOT NULL DEFAULT 0,
  price_override numeric(16,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.items TO anon, authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items public read" ON public.items FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX items_rarity_idx ON public.items (rarity);
CREATE INDEX items_price_idx ON public.items (base_price);

-- CASES
CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Budget',
  image_url text,
  price numeric(16,2) NOT NULL DEFAULT 0,
  tag text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cases TO anon, authenticated;
GRANT ALL ON public.cases TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cases public read" ON public.cases FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.case_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  weight int NOT NULL DEFAULT 1 CHECK (weight > 0),
  UNIQUE (case_id, item_id)
);
GRANT SELECT ON public.case_items TO anon, authenticated;
GRANT ALL ON public.case_items TO service_role;
ALTER TABLE public.case_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case items public read" ON public.case_items FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX case_items_case_idx ON public.case_items (case_id);

-- INVENTORY
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id),
  value numeric(16,2) NOT NULL DEFAULT 0,
  status public.inventory_status NOT NULL DEFAULT 'owned',
  source text NOT NULL DEFAULT 'case',
  source_ref uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inventory" ON public.inventory_items FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE INDEX inventory_user_idx ON public.inventory_items (user_id, status);

-- LEDGER (double entry)
CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  account text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  amount numeric(16,2) NOT NULL CHECK (amount >= 0),
  ref_type text,
  ref_id uuid,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ledger" ON public.ledger_entries FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE INDEX ledger_user_idx ON public.ledger_entries (user_id, created_at DESC);

-- PROVABLY FAIR SEEDS
CREATE TABLE public.user_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  server_seed text NOT NULL,
  server_seed_hash text NOT NULL,
  client_seed text NOT NULL,
  nonce bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  revealed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_seeds TO authenticated;
GRANT ALL ON public.user_seeds TO service_role;
ALTER TABLE public.user_seeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own seeds" ON public.user_seeds FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE UNIQUE INDEX user_seeds_active_idx ON public.user_seeds (user_id) WHERE is_active;

-- CASE OPENINGS (live feed)
CREATE TABLE public.case_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  username text NOT NULL DEFAULT 'Player',
  avatar_url text,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  cost numeric(16,2) NOT NULL DEFAULT 0,
  value numeric(16,2) NOT NULL DEFAULT 0,
  roll numeric(20,18) NOT NULL DEFAULT 0,
  server_seed_hash text,
  client_seed text,
  nonce bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.case_openings TO anon, authenticated;
GRANT ALL ON public.case_openings TO service_role;
ALTER TABLE public.case_openings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "openings public read" ON public.case_openings FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX openings_recent_idx ON public.case_openings (created_at DESC);

-- SETTINGS
CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.site_settings (key, value) VALUES
  ('case_rtp', '{"value":0.94}'),
  ('upgrade_house_edge', '{"value":0.06}'),
  ('battle_rake', '{"value":0.05}'),
  ('contract_multiplier', '{"value":0.92}');

-- AUDIT LOG
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read audit" ON public.admin_audit_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- NEW USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, steam_id, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'steam_id',
    COALESCE(NEW.raw_user_meta_data->>'username', 'Player'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ATOMIC CASE OPEN
CREATE OR REPLACE FUNCTION public.fn_open_case(
  p_user uuid, p_case uuid, p_item uuid, p_roll numeric,
  p_hash text, p_client_seed text, p_nonce bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prof public.profiles%ROWTYPE;
  v_price numeric(16,2);
  v_value numeric(16,2);
  v_tx uuid := gen_random_uuid();
  v_inv uuid;
  v_open uuid;
BEGIN
  SELECT * INTO v_prof FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_prof.is_banned THEN RAISE EXCEPTION 'account_banned'; END IF;

  SELECT price INTO v_price FROM public.cases WHERE id = p_case AND is_active;
  IF v_price IS NULL THEN RAISE EXCEPTION 'case_not_found'; END IF;
  IF v_prof.balance < v_price THEN RAISE EXCEPTION 'insufficient_funds'; END IF;

  SELECT COALESCE(price_override, base_price) INTO v_value FROM public.items WHERE id = p_item;

  UPDATE public.profiles
     SET balance = balance - v_price, xp = xp + GREATEST(1, FLOOR(v_price)::int), updated_at = now()
   WHERE id = p_user;
  UPDATE public.profiles SET level = 1 + FLOOR(SQRT(xp::numeric / 25))::int WHERE id = p_user;

  INSERT INTO public.ledger_entries (tx_id,user_id,account,direction,amount,ref_type,ref_id,memo)
  VALUES (v_tx,p_user,'user_balance','debit',v_price,'case_open',p_case,'Case opening'),
         (v_tx,NULL,'house_balance','credit',v_price,'case_open',p_case,'Case opening');

  INSERT INTO public.inventory_items (user_id,item_id,value,source,source_ref)
  VALUES (p_user,p_item,v_value,'case',p_case) RETURNING id INTO v_inv;

  INSERT INTO public.case_openings (user_id,username,avatar_url,case_id,item_id,cost,value,roll,server_seed_hash,client_seed,nonce)
  VALUES (p_user,v_prof.username,v_prof.avatar_url,p_case,p_item,v_price,v_value,p_roll,p_hash,p_client_seed,p_nonce)
  RETURNING id INTO v_open;

  UPDATE public.user_seeds SET nonce = p_nonce WHERE user_id = p_user AND is_active;

  RETURN jsonb_build_object('inventory_id',v_inv,'opening_id',v_open,'value',v_value,
    'balance',(SELECT balance FROM public.profiles WHERE id = p_user));
END;
$$;

-- SELL ITEM
CREATE OR REPLACE FUNCTION public.fn_sell_item(p_user uuid, p_inventory uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_val numeric(16,2); v_tx uuid := gen_random_uuid();
BEGIN
  UPDATE public.inventory_items SET status = 'sold'
   WHERE id = p_inventory AND user_id = p_user AND status = 'owned'
   RETURNING value INTO v_val;
  IF v_val IS NULL THEN RAISE EXCEPTION 'item_not_sellable'; END IF;

  UPDATE public.profiles SET balance = balance + v_val, updated_at = now() WHERE id = p_user;
  INSERT INTO public.ledger_entries (tx_id,user_id,account,direction,amount,ref_type,ref_id,memo)
  VALUES (v_tx,NULL,'house_balance','debit',v_val,'item_sell',p_inventory,'Item sold back'),
         (v_tx,p_user,'user_balance','credit',v_val,'item_sell',p_inventory,'Item sold back');

  RETURN jsonb_build_object('amount',v_val,'balance',(SELECT balance FROM public.profiles WHERE id = p_user));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_open_case(uuid,uuid,uuid,numeric,text,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_sell_item(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_open_case(uuid,uuid,uuid,numeric,text,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_sell_item(uuid,uuid) TO service_role;