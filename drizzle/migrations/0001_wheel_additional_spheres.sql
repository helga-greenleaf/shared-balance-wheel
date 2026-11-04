CREATE OR REPLACE FUNCTION public.wheel_apply_ops(p_id uuid, p_ops jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
 d jsonb; r bigint; op jsonb; k text; sid text; conflicts jsonb := '[]'::jsonb;
 rejected jsonb := '[]'::jsonb; cur jsonb; additional_count integer;
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
   IF d ? ('s:' || sid || ':additional') THEN
    d := d || jsonb_build_object('s:' || sid || ':additional', jsonb_build_object('v', false, 'r', r));
   END IF;
  ELSE
   IF k LIKE 's:%' THEN
    sid := split_part(k, ':', 2);
    IF NOT d ? ('s:' || sid || ':pos') OR coalesce((d->('s:' || sid || ':del')->>'v')::boolean, false) THEN
     rejected := rejected || jsonb_build_array(op); CONTINUE;
    END IF;
    IF split_part(k, ':', 3) = 'additional' AND op->'v' = 'true'::jsonb THEN
     SELECT count(*) INTO additional_count FROM jsonb_each(d) e
      WHERE e.key LIKE 's:%:additional' AND e.value->'v' = 'true'::jsonb
       AND split_part(e.key, ':', 2) <> sid
       AND split_part(e.key, ':', 2) IS DISTINCT FROM d->'primary'->>'v'
       AND d ? ('s:' || split_part(e.key, ':', 2) || ':pos')
       AND coalesce(d->('s:' || split_part(e.key, ':', 2) || ':del')->'v', 'false'::jsonb) <> 'true'::jsonb;
     IF sid = d->'primary'->>'v' OR additional_count >= 2 THEN
      rejected := rejected || jsonb_build_array(op); CONTINUE;
     END IF;
    END IF;
   END IF;
   IF k = 'primary' AND op->'v' <> 'null'::jsonb THEN
    sid := op->>'v';
    IF NOT d ? ('s:' || sid || ':pos') OR coalesce(d->('s:' || sid || ':del')->'v', 'false'::jsonb) = 'true'::jsonb THEN
     rejected := rejected || jsonb_build_array(op); CONTINUE;
    END IF;
   END IF;
   cur := d->k;
   IF op ? 'base' AND jsonb_typeof(op->'base') = 'number' AND cur IS NOT NULL
    AND (cur->>'r')::bigint > (op->>'base')::bigint AND (cur->'v') IS DISTINCT FROM (op->'v') THEN
    conflicts := conflicts || jsonb_build_array(jsonb_build_object('k', k, 'v', cur->'v', 'r', cur->'r', 'mine', op->'v')); CONTINUE;
   END IF;
   r := r + 1;
   d := d || jsonb_build_object(k, jsonb_build_object('v', op->'v', 'r', r));
   IF k = 'primary' AND op->'v' <> 'null'::jsonb AND d ? ('s:' || (op->>'v') || ':additional') THEN
    d := d || jsonb_build_object('s:' || (op->>'v') || ':additional', jsonb_build_object('v', false, 'r', r));
   END IF;
  END IF;
 END LOOP;
 UPDATE wheel_sessions SET data = d, rev = r, updated_at = now() WHERE id = p_id;
 RETURN jsonb_build_object('rev', r, 'data', d, 'conflicts', conflicts, 'rejected', rejected);
END;
$function$;
REVOKE ALL ON FUNCTION public.wheel_apply_ops(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wheel_apply_ops(uuid,jsonb) TO service_role;