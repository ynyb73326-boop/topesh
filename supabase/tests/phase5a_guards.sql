-- Phase 5A constraint / RPC / privacy tests.
-- Run as postgres (via npm run test:db). Aborts on failure.

BEGIN;

DO $$
DECLARE
  v_company uuid;
  v_customer uuid;
  v_site uuid;
  v_leader uuid;
  v_manager uuid;
  v_person uuid := gen_random_uuid();
  v_system uuid;
  v_component uuid;
  v_checkbox uuid;
  v_diary uuid;
  v_worker uuid;
  v_item uuid;
  v_check uuid;
  v_row public.work_diaries;
  v_cols text;
  v_blocked boolean;
BEGIN
  INSERT INTO public.companies (name) VALUES ('Test Company Ltd') RETURNING id INTO v_company;
  INSERT INTO public.customers (name, company_id) VALUES ('Test Customer', NULL) RETURNING id INTO v_customer;
  INSERT INTO public.sites (customer_id, name) VALUES (v_customer, 'Test Site') RETURNING id INTO v_site;

  INSERT INTO public.profiles (person_id, full_name, identity_number, phone, role)
  VALUES (v_person, 'Dual Role Leader', '123456789', '050-0000000', 'team_leader')
  RETURNING id INTO v_leader;

  INSERT INTO public.profiles (person_id, full_name, email, role)
  VALUES (v_person, 'Dual Role Manager', 'dual.manager@example.test', 'manager')
  RETURNING id INTO v_manager;

  INSERT INTO public.systems (name, sort_order) VALUES ('אזעקה', 1) RETURNING id INTO v_system;
  INSERT INTO public.components (system_id, name, unit, sort_order)
  VALUES (v_system, 'גלאי נפח', 'יח''', 1) RETURNING id INTO v_component;
  INSERT INTO public.checkbox_definitions (label, sort_order)
  VALUES ('עבודה בגובה', 1) RETURNING id INTO v_checkbox;

  INSERT INTO public.work_diaries (
    team_leader_id, work_date, company_id, customer_id, site_id,
    sub_site_name, project_name, work_order_number, notes
  ) VALUES (
    v_leader, CURRENT_DATE, v_company, v_customer, v_site,
    'קומה 1', 'פרויקט בדיקה', 'WO-TEST-1', 'טיוטה'
  ) RETURNING id INTO v_diary;

  INSERT INTO public.work_diary_workers (diary_id, full_name)
  VALUES (v_diary, 'עובד א') RETURNING id INTO v_worker;

  INSERT INTO public.work_diary_items (diary_id, component_id, quantity)
  VALUES (v_diary, v_component, 3) RETURNING id INTO v_item;

  INSERT INTO public.work_diary_checkbox_selections (diary_id, checkbox_id, checked)
  VALUES (v_diary, v_checkbox, true) RETURNING id INTO v_check;

  -- Pending edit allowed
  UPDATE public.work_diaries SET notes = 'טיוטה מעודכנת' WHERE id = v_diary;
  UPDATE public.work_diary_items SET quantity = 4 WHERE id = v_item;

  -- Submit
  SELECT * INTO v_row FROM public.submit_work_diary(v_diary);
  IF v_row.status <> 'submitted' OR v_row.submitted_at IS NULL THEN
    RAISE EXCEPTION 'submit failed';
  END IF;

  -- Double submit rejected
  BEGIN
    PERFORM public.submit_work_diary(v_diary);
    RAISE EXCEPTION 'double submit should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'double submit should fail' THEN RAISE; END IF;
  END;

  -- Direct content update rejected
  BEGIN
    UPDATE public.work_diaries SET notes = 'hack' WHERE id = v_diary;
    RAISE EXCEPTION 'notes update should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'notes update should fail' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.work_diaries SET work_order_number = 'WO-HACK' WHERE id = v_diary;
    RAISE EXCEPTION 'work order update should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'work order update should fail' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.work_diaries SET signature_capture_only = true WHERE id = v_diary;
    RAISE EXCEPTION 'flag toggle should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'flag toggle should fail' THEN RAISE; END IF;
  END;

  -- Child mutations rejected
  BEGIN
    UPDATE public.work_diary_items SET quantity = 99 WHERE id = v_item;
    RAISE EXCEPTION 'item update should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'item update should fail' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.work_diary_workers SET full_name = 'hack' WHERE id = v_worker;
    RAISE EXCEPTION 'worker update should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'worker update should fail' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.work_diary_checkbox_selections SET checked = false WHERE id = v_check;
    RAISE EXCEPTION 'checkbox update should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'checkbox update should fail' THEN RAISE; END IF;
  END;

  -- Delete submitted rejected
  BEGIN
    DELETE FROM public.work_diaries WHERE id = v_diary;
    RAISE EXCEPTION 'delete submitted should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'delete submitted should fail' THEN RAISE; END IF;
  END;

  -- Signature RPC allowed; status remains submitted
  SELECT * INTO v_row FROM public.update_work_diary_signature(
    v_diary, 'מנהל אתר', 'data:image/png;base64,aaa'
  );
  IF v_row.status <> 'submitted'
     OR v_row.site_manager_name <> 'מנהל אתר'
     OR v_row.notes <> 'טיוטה מעודכנת'
     OR v_row.work_order_number <> 'WO-TEST-1' THEN
    RAISE EXCEPTION 'signature rpc failed integrity check';
  END IF;

  -- Leader view omits work_order_number
  SELECT string_agg(column_name, ',' ORDER BY ordinal_position) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'work_diaries_for_leader';

  IF v_cols LIKE '%work_order_number%' THEN
    RAISE EXCEPTION 'leader view must not include work_order_number';
  END IF;
  IF v_cols LIKE '%company_id%' OR v_cols LIKE '%customer_id%' THEN
    RAISE EXCEPTION 'leader view must not include company_id/customer_id';
  END IF;

  -- Pending diary can be deleted
  INSERT INTO public.work_diaries (
    team_leader_id, work_date, company_id, customer_id, site_id,
    sub_site_name, project_name, work_order_number
  ) VALUES (
    v_leader, CURRENT_DATE, v_company, v_customer, v_site,
    'ב', 'פ', 'WO-DEL'
  ) RETURNING id INTO v_diary;

  DELETE FROM public.work_diaries WHERE id = v_diary;
  IF EXISTS (SELECT 1 FROM public.work_diaries WHERE id = v_diary) THEN
    RAISE EXCEPTION 'pending delete failed';
  END IF;

  -- Cancel preserves row
  INSERT INTO public.work_diaries (
    team_leader_id, work_date, company_id, customer_id, site_id,
    sub_site_name, project_name, work_order_number
  ) VALUES (
    v_leader, CURRENT_DATE, v_company, v_customer, v_site,
    'ג', 'פ', 'WO-CANCEL'
  ) RETURNING id INTO v_diary;

  SELECT * INTO v_row FROM public.cancel_work_diary(v_diary);
  IF v_row.status <> 'cancelled' OR v_row.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'cancel failed';
  END IF;

  RAISE NOTICE 'phase5a_guards: all assertions passed';
END $$;

ROLLBACK;
