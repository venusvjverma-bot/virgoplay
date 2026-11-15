/*
# Revert: Remove authenticated Chat Library read policies (Version 617)

## Purpose
Remove the four authenticated SELECT policies added by migration
20260923120000_add_authenticated_chat_library_read_policies.sql
that caused a regression in Mother Account → Role Studio → Dev OFF.

## Policies removed
1. authenticated_select_role_images_for_chat_library (on role_image_productions)
2. authenticated_select_chat_library_selections (on character_studio_v2_selections)
3. authenticated_select_chat_library_my_ai_overrides (on character_studio_v2_my_ai_overrides)
4. authenticated_select_chat_library_customize_ai_overrides (on customize_ai_overrides)

## What is NOT changed
- All pre-existing RLS policies remain unchanged.
- No tables, columns, or data are modified.
- No replacement policies are created.
*/

DROP POLICY IF EXISTS "authenticated_select_role_images_for_chat_library" ON role_image_productions;

DROP POLICY IF EXISTS "authenticated_select_chat_library_selections" ON character_studio_v2_selections;

DROP POLICY IF EXISTS "authenticated_select_chat_library_my_ai_overrides" ON character_studio_v2_my_ai_overrides;

DROP POLICY IF EXISTS "authenticated_select_chat_library_customize_ai_overrides" ON customize_ai_overrides;
