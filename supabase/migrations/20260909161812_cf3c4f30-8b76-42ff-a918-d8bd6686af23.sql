CREATE TABLE public.battle_seeds (
  battle_id uuid PRIMARY KEY REFERENCES public.battles(id) ON DELETE CASCADE,
  server_seed text NOT NULL,
  client_seed text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.battle_seeds TO service_role;
ALTER TABLE public.battle_seeds ENABLE ROW LEVEL SECURITY;