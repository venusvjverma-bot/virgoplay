/*
# Add saved_prompt column to master_ai_characters

1. Purpose
   - Stores the Prompt Builder output (a complete ZenCreator by_prompt request as JSON)
     that was reviewed and saved by the creator in Character Studio.
   - This saved prompt becomes the canonical generation source for that character.
   - The Character Generation page will load this saved prompt instead of rebuilding
     from the Universal Prompt Schema fields.

2. New Columns
   - `master_ai_characters.saved_prompt` (jsonb, nullable)
     Stores the full by_prompt request object:
       { tool: "by_prompt", input: { model, positive_prompt, ratio, batch_size } }
     NULL means no prompt has been saved yet; the generation page falls back to
     rebuilding from the schema in that case.

3. Security
   - No changes to RLS policies. The existing owner-scoped CRUD policies on
     master_ai_characters already cover the new column since it is on the same table.
*/

ALTER TABLE master_ai_characters
  ADD COLUMN IF NOT EXISTS saved_prompt jsonb;