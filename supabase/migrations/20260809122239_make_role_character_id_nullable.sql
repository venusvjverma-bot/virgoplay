-- Allow Role Templates to be created without a linked character.
-- character_id becomes nullable; identity is applied at generation time
-- from the currently selected Character Studio V2 character.
ALTER TABLE character_roles ALTER COLUMN character_id DROP NOT NULL;