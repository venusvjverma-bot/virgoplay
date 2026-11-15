-- Smoke test: verify the query that was producing infinite recursion
-- now returns rows without error.
-- We use a DO block so we can assert success without needing a specific uid.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.creators;
  RAISE NOTICE 'creators row count: %', v_count;

  SELECT count(*) INTO v_count FROM public.creator_profiles;
  RAISE NOTICE 'creator_profiles row count: %', v_count;

  SELECT count(*) INTO v_count FROM public.verification_documents;
  RAISE NOTICE 'verification_documents row count: %', v_count;

  -- Confirm is_admin() function exists and is callable
  PERFORM public.is_admin();
  RAISE NOTICE 'is_admin() callable: OK';
END;
$$;
