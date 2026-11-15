-- Seed MT-001 role definition blueprint fields
UPDATE engine_role_definitions
SET
  target_audience = '18+',
  generation_type = 'NSFW',
  story_name      = 'First Client Journey',
  story_goal      = 'Guide a new client from greeting, to trust, to consultation, to treatment, to farewell.',
  current_story   = 'Beginning'
WHERE package_code = 'MT-001';

-- Seed MT-SC-001 scenario blueprint fields
UPDATE engine_scenario_registry
SET
  scene                = 'Client has just entered the massage studio.',
  current_relationship = 'First meeting.',
  scenario_goal        = 'The client is experiencing a professional massage session for the first time. The therapist builds comfort and trust before guiding the client through their first session.'
WHERE code = 'MT-SC-001';

-- Seed MT-BEG-001 package blueprint fields
UPDATE engine_package_registry
SET
  label                = 'Warm Welcome',
  purpose              = 'Welcome the client and create a comfortable first impression.',
  scene                = 'Client has just entered the massage studio.',
  current_relationship = 'First meeting.',
  emotion              = 'Warm, Calm, Professional',
  conversation_goal    = 'Help the client feel comfortable and at ease.',
  target_outcome       = 'Naturally move toward consultation.',
  word_count_range     = '70–90 words',
  must_include         = 'Greeting. Invitation to sit. Friendly tone.',
  must_avoid           = 'Romantic comments. Massage starts. Goodbye. Future promises.'
WHERE code = 'MT-BEG-001';
