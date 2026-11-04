CREATE TABLE public.wheel_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_hash text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  rev bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wheel_sessions TO service_role;
ALTER TABLE public.wheel_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: only the server (service role) can access, after checking the secret key.

CREATE OR REPLACE FUNCTION public.wheel_active_count(d jsonb) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT count(*)::int FROM jsonb_object_keys(d) k
  WHERE k LIKE 's:%:pos'
    AND NOT coalesce((d -> (left(k, length(k) - 4) || ':del') ->> 'v')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public.wheel_apply_ops(p_id uuid, p_ops jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d jsonb; r bigint; op jsonb; k text; sid text; conflicts jsonb := '[]'::jsonb;
  rejected jsonb := '[]'::jsonb; cur jsonb;
BEGIN
  SELECT data, rev INTO d, r FROM wheel_sessions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  FOR op IN SELECT * FROM jsonb_array_elements(p_ops) LOOP
    k := op->>'k';
    IF op->>'kind' = 'add' THEN
      sid := op->>'sid';
      IF d ? ('s:' || sid || ':pos') OR wheel_active_count(d) >= 15 THEN
        rejected := rejected || jsonb_build_array(op); CONTINUE;
      END IF;
      r := r + 1;
      d := d || jsonb_build_object('s:' || sid || ':pos', jsonb_build_object('v', op->'v', 'r', r));
    ELSIF op->>'kind' = 'del' THEN
      sid := op->>'sid';
      IF NOT d ? ('s:' || sid || ':pos') OR wheel_active_count(d) <= 6 THEN
        rejected := rejected || jsonb_build_array(op); CONTINUE;
      END IF;
      r := r + 1;
      d := d || jsonb_build_object('s:' || sid || ':del', jsonb_build_object('v', true, 'r', r));
      IF d->'primary'->>'v' = sid THEN
        d := d || jsonb_build_object('primary', jsonb_build_object('v', null, 'r', r));
      END IF;
    ELSE
      IF k LIKE 's:%' THEN
        sid := split_part(k, ':', 2);
        IF NOT d ? ('s:' || sid || ':pos')
           OR coalesce((d->('s:' || sid || ':del')->>'v')::boolean, false) THEN
          rejected := rejected || jsonb_build_array(op); CONTINUE;
        END IF;
      END IF;
      cur := d->k;
      IF op ? 'base' AND jsonb_typeof(op->'base') = 'number' AND cur IS NOT NULL
         AND (cur->>'r')::bigint > (op->>'base')::bigint
         AND (cur->'v') IS DISTINCT FROM (op->'v') THEN
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('k', k, 'v', cur->'v', 'r', cur->'r', 'mine', op->'v'));
        CONTINUE;
      END IF;
      r := r + 1;
      d := d || jsonb_build_object(k, jsonb_build_object('v', op->'v', 'r', r));
    END IF;
  END LOOP;
  UPDATE wheel_sessions SET data = d, rev = r, updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('rev', r, 'data', d, 'conflicts', conflicts, 'rejected', rejected);
END;
$$;
REVOKE ALL ON FUNCTION public.wheel_apply_ops(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wheel_apply_ops(uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.wheel_active_count(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wheel_active_count(jsonb) TO service_role;