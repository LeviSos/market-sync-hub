CREATE TYPE public.withdrawal_status AS ENUM ('pending','sent','failed','cancelled');

CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL UNIQUE REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id),
  value numeric(16,2) NOT NULL DEFAULT 0,
  steam_id text,
  trade_url text NOT NULL,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  trade_offer_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own withdrawals" ON public.withdrawals FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

CREATE INDEX withdrawals_user_idx ON public.withdrawals (user_id, created_at DESC);
CREATE INDEX withdrawals_status_idx ON public.withdrawals (status, created_at);

CREATE OR REPLACE FUNCTION public.fn_request_withdrawal(
  p_user uuid, p_inventory uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_prof public.profiles%ROWTYPE;
  v_row public.inventory_items%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_prof FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_prof.is_banned THEN RAISE EXCEPTION 'account_banned'; END IF;
  IF v_prof.trade_url IS NULL OR btrim(v_prof.trade_url) = '' THEN RAISE EXCEPTION 'trade_url_missing'; END IF;

  SELECT * INTO v_row FROM public.inventory_items
   WHERE id = p_inventory AND user_id = p_user AND status = 'owned' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_available'; END IF;

  UPDATE public.inventory_items SET status = 'withdrawn' WHERE id = p_inventory;

  INSERT INTO public.withdrawals (user_id, inventory_id, item_id, value, steam_id, trade_url)
  VALUES (p_user, p_inventory, v_row.item_id, v_row.value, v_prof.steam_id, v_prof.trade_url)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('withdrawal_id', v_id, 'value', v_row.value);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_resolve_withdrawal(
  p_withdrawal uuid, p_status public.withdrawal_status, p_offer text, p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_w public.withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_w.status <> 'pending' THEN RAISE EXCEPTION 'already_resolved'; END IF;

  UPDATE public.withdrawals
     SET status = p_status, trade_offer_id = p_offer, note = p_note, updated_at = now()
   WHERE id = p_withdrawal;

  IF p_status IN ('failed','cancelled') THEN
    UPDATE public.inventory_items SET status = 'owned' WHERE id = v_w.inventory_id;
  ELSIF p_status = 'sent' THEN
    INSERT INTO public.ledger_entries (tx_id,user_id,account,direction,amount,ref_type,ref_id,memo)
    VALUES (gen_random_uuid(), v_w.user_id, 'user_balance', 'debit', v_w.value, 'withdrawal', p_withdrawal, 'Skin withdrawn to Steam');
  END IF;

  RETURN jsonb_build_object('status', p_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_request_withdrawal(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_resolve_withdrawal(uuid,public.withdrawal_status,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_request_withdrawal(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_resolve_withdrawal(uuid,public.withdrawal_status,text,text) TO service_role;