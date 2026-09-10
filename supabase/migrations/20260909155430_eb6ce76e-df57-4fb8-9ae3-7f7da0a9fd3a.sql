
CREATE TYPE public.battle_mode AS ENUM ('ffa','team2v2','crazy');
CREATE TYPE public.battle_status AS ENUM ('waiting','running','finished','cancelled');

CREATE TABLE public.upgrades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'balance',
  stake numeric(16,2) NOT NULL DEFAULT 0,
  target_item_id uuid REFERENCES public.items(id),
  target_value numeric(16,2) NOT NULL DEFAULT 0,
  chance numeric(8,5) NOT NULL DEFAULT 0,
  roll numeric(18,15) NOT NULL DEFAULT 0,
  won boolean NOT NULL DEFAULT false,
  server_seed_hash text,
  client_seed text,
  nonce bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.upgrades TO authenticated;
GRANT ALL ON public.upgrades TO service_role;
ALTER TABLE public.upgrades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own upgrades" ON public.upgrades FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_count int NOT NULL DEFAULT 0,
  input_value numeric(16,2) NOT NULL DEFAULT 0,
  output_item_id uuid REFERENCES public.items(id),
  output_value numeric(16,2) NOT NULL DEFAULT 0,
  roll numeric(18,15) NOT NULL DEFAULT 0,
  server_seed_hash text,
  client_seed text,
  nonce bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contracts" ON public.contracts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TABLE public.battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode public.battle_mode NOT NULL DEFAULT 'ffa',
  status public.battle_status NOT NULL DEFAULT 'waiting',
  player_count int NOT NULL DEFAULT 2,
  rounds int NOT NULL DEFAULT 1,
  cost numeric(16,2) NOT NULL DEFAULT 0,
  pot numeric(16,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  server_seed_hash text,
  client_seed text,
  winner_slots int[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
GRANT SELECT ON public.battles TO anon, authenticated;
GRANT ALL ON public.battles TO service_role;
ALTER TABLE public.battles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "battles public read" ON public.battles FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.battle_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id),
  position int NOT NULL
);
GRANT SELECT ON public.battle_cases TO anon, authenticated;
GRANT ALL ON public.battle_cases TO service_role;
ALTER TABLE public.battle_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "battle cases public read" ON public.battle_cases FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.battle_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  slot int NOT NULL,
  team int NOT NULL DEFAULT 0,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  username text NOT NULL DEFAULT 'Bot',
  avatar_url text,
  is_bot boolean NOT NULL DEFAULT false,
  total_value numeric(16,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, slot)
);
GRANT SELECT ON public.battle_players TO anon, authenticated;
GRANT ALL ON public.battle_players TO service_role;
ALTER TABLE public.battle_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "battle players public read" ON public.battle_players FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.battle_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  round int NOT NULL,
  slot int NOT NULL,
  case_id uuid REFERENCES public.cases(id),
  item_id uuid REFERENCES public.items(id),
  value numeric(16,2) NOT NULL DEFAULT 0,
  roll numeric(18,15) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.battle_rounds TO anon, authenticated;
GRANT ALL ON public.battle_rounds TO service_role;
ALTER TABLE public.battle_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "battle rounds public read" ON public.battle_rounds FOR SELECT TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.battles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_rounds;

-- ============ money functions ============

CREATE OR REPLACE FUNCTION public.fn_upgrade(
  p_user uuid, p_inventory uuid[], p_stake numeric, p_target uuid,
  p_chance numeric, p_roll numeric, p_won boolean,
  p_hash text, p_client_seed text, p_nonce bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_prof public.profiles%ROWTYPE;
  v_stake numeric(16,2) := 0;
  v_target_value numeric(16,2);
  v_tx uuid := gen_random_uuid();
  v_inv uuid;
  v_up uuid;
BEGIN
  SELECT * INTO v_prof FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_prof.is_banned THEN RAISE EXCEPTION 'account_banned'; END IF;

  SELECT COALESCE(price_override, base_price) INTO v_target_value FROM public.items WHERE id = p_target AND is_active;
  IF v_target_value IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;

  IF p_inventory IS NULL OR array_length(p_inventory,1) IS NULL THEN
    v_stake := p_stake;
    IF v_stake <= 0 THEN RAISE EXCEPTION 'invalid_stake'; END IF;
    IF v_prof.balance < v_stake THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
    UPDATE public.profiles SET balance = balance - v_stake, updated_at = now() WHERE id = p_user;
  ELSE
    UPDATE public.inventory_items SET status = 'used'
     WHERE id = ANY(p_inventory) AND user_id = p_user AND status = 'owned';
    SELECT COALESCE(SUM(value),0) INTO v_stake FROM public.inventory_items
      WHERE id = ANY(p_inventory) AND user_id = p_user AND status = 'used';
    IF v_stake <= 0 THEN RAISE EXCEPTION 'items_not_available'; END IF;
  END IF;

  INSERT INTO public.ledger_entries (tx_id,user_id,account,direction,amount,ref_type,ref_id,memo)
  VALUES (v_tx,p_user,'user_balance','debit',v_stake,'upgrade',p_target,'Upgrade stake'),
         (v_tx,NULL,'house_balance','credit',v_stake,'upgrade',p_target,'Upgrade stake');

  UPDATE public.profiles SET xp = xp + GREATEST(1, FLOOR(v_stake)::int) WHERE id = p_user;
  UPDATE public.profiles SET level = 1 + FLOOR(SQRT(xp::numeric / 25))::int WHERE id = p_user;

  IF p_won THEN
    INSERT INTO public.inventory_items (user_id,item_id,value,source,source_ref)
    VALUES (p_user,p_target,v_target_value,'upgrade',p_target) RETURNING id INTO v_inv;
    INSERT INTO public.ledger_entries (tx_id,user_id,account,direction,amount,ref_type,ref_id,memo)
    VALUES (gen_random_uuid(),NULL,'house_balance','debit',v_target_value,'upgrade_win',p_target,'Upgrade won');
  END IF;

  INSERT INTO public.upgrades (user_id,mode,stake,target_item_id,target_value,chance,roll,won,server_seed_hash,client_seed,nonce)
  VALUES (p_user, CASE WHEN p_inventory IS NULL OR array_length(p_inventory,1) IS NULL THEN 'balance' ELSE 'items' END,
          v_stake,p_target,v_target_value,p_chance,p_roll,p_won,p_hash,p_client_seed,p_nonce)
  RETURNING id INTO v_up;

  UPDATE public.user_seeds SET nonce = p_nonce WHERE user_id = p_user AND is_active;

  RETURN jsonb_build_object('upgrade_id',v_up,'won',p_won,'inventory_id',v_inv,'stake',v_stake,
    'target_value',v_target_value,'balance',(SELECT balance FROM public.profiles WHERE id = p_user));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_contract(
  p_user uuid, p_inventory uuid[], p_item uuid, p_roll numeric,
  p_hash text, p_client_seed text, p_nonce bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_prof public.profiles%ROWTYPE;
  v_in numeric(16,2);
  v_cnt int;
  v_out numeric(16,2);
  v_tx uuid := gen_random_uuid();
  v_inv uuid;
  v_c uuid;
BEGIN
  SELECT * INTO v_prof FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_prof.is_banned THEN RAISE EXCEPTION 'account_banned'; END IF;
  IF array_length(p_inventory,1) IS NULL OR array_length(p_inventory,1) < 3 THEN RAISE EXCEPTION 'need_three_items'; END IF;

  UPDATE public.inventory_items SET status = 'used'
   WHERE id = ANY(p_inventory) AND user_id = p_user AND status = 'owned';
  SELECT COALESCE(SUM(value),0), COUNT(*) INTO v_in, v_cnt FROM public.inventory_items
   WHERE id = ANY(p_inventory) AND user_id = p_user AND status = 'used';
  IF v_cnt < 3 THEN RAISE EXCEPTION 'items_not_available'; END IF;

  SELECT COALESCE(price_override, base_price) INTO v_out FROM public.items WHERE id = p_item;
  IF v_out IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;

  INSERT INTO public.ledger_entries (tx_id,user_id,account,direction,amount,ref_type,ref_id,memo)
  VALUES (v_tx,p_user,'user_balance','debit',v_in,'contract',p_item,'Contract input'),
         (v_tx,NULL,'house_balance','credit',v_in,'contract',p_item,'Contract input'),
         (gen_random_uuid(),NULL,'house_balance','debit',v_out,'contract_out',p_item,'Contract output');

  INSERT INTO public.inventory_items (user_id,item_id,value,source,source_ref)
  VALUES (p_user,p_item,v_out,'contract',p_item) RETURNING id INTO v_inv;

  INSERT INTO public.contracts (user_id,input_count,input_value,output_item_id,output_value,roll,server_seed_hash,client_seed,nonce)
  VALUES (p_user,v_cnt,v_in,p_item,v_out,p_roll,p_hash,p_client_seed,p_nonce) RETURNING id INTO v_c;

  UPDATE public.user_seeds SET nonce = p_nonce WHERE user_id = p_user AND is_active;

  RETURN jsonb_build_object('contract_id',v_c,'inventory_id',v_inv,'input_value',v_in,'output_value',v_out);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_battle_create(
  p_user uuid, p_mode public.battle_mode, p_players int, p_cases uuid[], p_hash text, p_client_seed text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_prof public.profiles%ROWTYPE;
  v_cost numeric(16,2) := 0;
  v_battle uuid;
  v_id uuid;
  i int := 0;
BEGIN
  SELECT * INTO v_prof FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_prof.is_banned THEN RAISE EXCEPTION 'account_banned'; END IF;
  IF array_length(p_cases,1) IS NULL THEN RAISE EXCEPTION 'no_cases'; END IF;

  FOREACH v_id IN ARRAY p_cases LOOP
    v_cost := v_cost + (SELECT price FROM public.cases WHERE id = v_id AND is_active);
  END LOOP;
  IF v_cost IS NULL OR v_cost <= 0 THEN RAISE EXCEPTION 'invalid_cases'; END IF;
  IF v_prof.balance < v_cost THEN RAISE EXCEPTION 'insufficient_funds'; END IF;

  UPDATE public.profiles SET balance = balance - v_cost, updated_at = now() WHERE id = p_user;
  INSERT INTO public.ledger_entries (tx_id,user_id,account,direction,amount,ref_type,memo)
  VALUES (gen_random_uuid(),p_user,'user_balance','debit',v_cost,'battle_buyin','Battle entry');

  INSERT INTO public.battles (mode,status,player_count,rounds,cost,pot,created_by,server_seed_hash,client_seed)
  VALUES (p_mode,'waiting',p_players,array_length(p_cases,1),v_cost,v_cost,p_user,p_hash,p_client_seed)
  RETURNING id INTO v_battle;

  FOREACH v_id IN ARRAY p_cases LOOP
    INSERT INTO public.battle_cases (battle_id,case_id,position) VALUES (v_battle,v_id,i);
    i := i + 1;
  END LOOP;

  INSERT INTO public.battle_players (battle_id,slot,team,user_id,username,avatar_url,is_bot)
  VALUES (v_battle,0,0,p_user,v_prof.username,v_prof.avatar_url,false);

  RETURN v_battle;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_battle_join(
  p_user uuid, p_battle uuid, p_slot int, p_bot boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_b public.battles%ROWTYPE;
  v_prof public.profiles%ROWTYPE;
  v_team int;
BEGIN
  SELECT * INTO v_b FROM public.battles WHERE id = p_battle FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF v_b.status <> 'waiting' THEN RAISE EXCEPTION 'battle_closed'; END IF;
  IF p_slot < 0 OR p_slot >= v_b.player_count THEN RAISE EXCEPTION 'bad_slot'; END IF;
  IF EXISTS (SELECT 1 FROM public.battle_players WHERE battle_id = p_battle AND slot = p_slot) THEN
    RAISE EXCEPTION 'slot_taken';
  END IF;

  v_team := CASE WHEN v_b.mode = 'team2v2' THEN p_slot % 2 ELSE 0 END;

  IF p_bot THEN
    IF v_b.created_by <> p_user THEN RAISE EXCEPTION 'not_owner'; END IF;
    INSERT INTO public.battle_players (battle_id,slot,team,user_id,username,is_bot)
    VALUES (p_battle,p_slot,v_team,NULL,'Bot ' || (p_slot+1),true);
  ELSE
    IF EXISTS (SELECT 1 FROM public.battle_players WHERE battle_id = p_battle AND user_id = p_user) THEN
      RAISE EXCEPTION 'already_joined';
    END IF;
    SELECT * INTO v_prof FROM public.profiles WHERE id = p_user FOR UPDATE;
    IF v_prof.is_banned THEN RAISE EXCEPTION 'account_banned'; END IF;
    IF v_prof.balance < v_b.cost THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
    UPDATE public.profiles SET balance = balance - v_b.cost, updated_at = now() WHERE id = p_user;
    INSERT INTO public.ledger_entries (tx_id,user_id,account,direction,amount,ref_type,ref_id,memo)
    VALUES (gen_random_uuid(),p_user,'user_balance','debit',v_b.cost,'battle_buyin',p_battle,'Battle entry');
    UPDATE public.battles SET pot = pot + v_b.cost WHERE id = p_battle;
    INSERT INTO public.battle_players (battle_id,slot,team,user_id,username,avatar_url,is_bot)
    VALUES (p_battle,p_slot,v_team,p_user,v_prof.username,v_prof.avatar_url,false);
  END IF;

  RETURN jsonb_build_object('filled',(SELECT COUNT(*) FROM public.battle_players WHERE battle_id = p_battle),
    'player_count',v_b.player_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_battle_settle(
  p_battle uuid, p_rounds jsonb, p_winner_slots int[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_b public.battles%ROWTYPE;
  r jsonb;
  v_winners uuid[];
  v_uid uuid;
  idx int := 0;
  v_total numeric(16,2) := 0;
BEGIN
  SELECT * INTO v_b FROM public.battles WHERE id = p_battle FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF v_b.status = 'finished' THEN RETURN jsonb_build_object('already',true); END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rounds) LOOP
    INSERT INTO public.battle_rounds (battle_id,round,slot,case_id,item_id,value,roll)
    VALUES (p_battle,(r->>'round')::int,(r->>'slot')::int,(r->>'case_id')::uuid,(r->>'item_id')::uuid,
            (r->>'value')::numeric,(r->>'roll')::numeric);
  END LOOP;

  UPDATE public.battle_players bp SET total_value = COALESCE((
    SELECT SUM(value) FROM public.battle_rounds br WHERE br.battle_id = p_battle AND br.slot = bp.slot),0)
  WHERE bp.battle_id = p_battle;

  SELECT array_agg(user_id) INTO v_winners FROM public.battle_players
   WHERE battle_id = p_battle AND slot = ANY(p_winner_slots) AND user_id IS NOT NULL;

  IF v_winners IS NOT NULL AND array_length(v_winners,1) > 0 THEN
    FOR r IN SELECT to_jsonb(br) FROM public.battle_rounds br WHERE br.battle_id = p_battle ORDER BY br.round, br.slot LOOP
      v_uid := v_winners[(idx % array_length(v_winners,1)) + 1];
      INSERT INTO public.inventory_items (user_id,item_id,value,source,source_ref)
      VALUES (v_uid,(r->>'item_id')::uuid,(r->>'value')::numeric,'battle',p_battle);
      v_total := v_total + (r->>'value')::numeric;
      idx := idx + 1;
    END LOOP;
    INSERT INTO public.ledger_entries (tx_id,user_id,account,direction,amount,ref_type,ref_id,memo)
    VALUES (gen_random_uuid(),NULL,'house_balance','debit',v_total,'battle_payout',p_battle,'Battle payout');
  END IF;

  UPDATE public.battles SET status = 'finished', winner_slots = p_winner_slots, finished_at = now()
   WHERE id = p_battle;

  RETURN jsonb_build_object('total',v_total,'winners',p_winner_slots);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_upgrade(uuid,uuid[],numeric,uuid,numeric,numeric,boolean,text,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_contract(uuid,uuid[],uuid,numeric,text,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_battle_create(uuid,public.battle_mode,int,uuid[],text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_battle_join(uuid,uuid,int,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_battle_settle(uuid,jsonb,int[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_upgrade(uuid,uuid[],numeric,uuid,numeric,numeric,boolean,text,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_contract(uuid,uuid[],uuid,numeric,text,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_battle_create(uuid,public.battle_mode,int,uuid[],text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_battle_join(uuid,uuid,int,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_battle_settle(uuid,jsonb,int[]) TO service_role;