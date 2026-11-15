-- MT-BEG-001 Base Dialogue Records (20 records, neutral tone)
-- No modifier variants. FL / AL modifiers will enhance these in a future pass.
--
-- Path map:
--   all              = shared / converged records
--   stressed         = "I feel stressed" branch
--   pain             = "I have some pain" branch
--   relax            = "I just want to relax" branch
--   about_therapist  = "Tell me about yourself" branch (re-branches at seq 14)
--
-- Fetch Engine resolution: (package_code, seq, path) with 'all' fallback.

INSERT INTO engine_dialogue_records
  (package_code, seq, path, message, choices, next_seq, next_path, is_terminal, transition_to)
VALUES

-- ── Shared Opening ────────────────────────────────────────────────────────────

(
  'MT-BEG-001', 1, 'all',
  'Welcome! I''m so glad you''re here today. I''m your therapist for this session, and my whole focus is on making sure you feel completely comfortable and cared for. How are you feeling right now?',
  $j$[
    {"id": "nervous",  "label": "A little nervous, to be honest",      "next_seq": 2, "next_path": "all"},
    {"id": "excited",  "label": "Good — excited to be here!",          "next_seq": 2, "next_path": "all"},
    {"id": "tired",    "label": "Tired and really ready to relax",      "next_seq": 2, "next_path": "all"}
  ]$j$::jsonb,
  2, 'all', false, null
),

(
  'MT-BEG-001', 2, 'all',
  'That''s completely understandable. You''re in a safe and relaxing space here — there''s nothing to worry about. My whole focus today is on making sure you feel comfortable, cared for, and at ease from the moment we begin.',
  $j$[
    {"id": "sounds_good", "label": "That sounds wonderful", "next_seq": 3, "next_path": "all"}
  ]$j$::jsonb,
  3, 'all', false, null
),

(
  'MT-BEG-001', 3, 'all',
  'Before we get started, I''d love to understand what brought you in today. What would you most like to focus on during your session?',
  $j$[
    {"id": "stressed",         "label": "I''ve been feeling really stressed",       "next_seq": 4,  "next_path": "stressed"},
    {"id": "pain",             "label": "I have some pain I''d like help with",     "next_seq": 7,  "next_path": "pain"},
    {"id": "relax",            "label": "I just want to relax and unwind",          "next_seq": 10, "next_path": "relax"},
    {"id": "about_therapist",  "label": "Tell me a little about yourself first",    "next_seq": 13, "next_path": "about_therapist"}
  ]$j$::jsonb,
  null, 'all', false, null
),

-- ── Path: Stressed ────────────────────────────────────────────────────────────

(
  'MT-BEG-001', 4, 'stressed',
  'I''m really glad you told me that — and I''m sorry you''ve been carrying that with you. Stress can build up so much in the body without us even realising it. Can I ask — has it been more physical, like tight muscles and tension, or more of a mental and emotional weight?',
  $j$[
    {"id": "physical",  "label": "More physical — I have a lot of tension in my body", "next_seq": 5, "next_path": "stressed"},
    {"id": "mental",    "label": "More mental — I just need to switch off",             "next_seq": 5, "next_path": "stressed"},
    {"id": "both",      "label": "Honestly, a bit of both",                             "next_seq": 5, "next_path": "stressed"}
  ]$j$::jsonb,
  5, 'stressed', false, null
),

(
  'MT-BEG-001', 5, 'stressed',
  'Thank you for sharing that with me. We''re going to work on releasing all of that today. I''ll pay special attention to the areas where stress tends to hold on the most — your neck, shoulders, and upper back. By the end, I want you to feel like you''ve genuinely put that weight down for a while.',
  $j$[
    {"id": "perfect", "label": "That sounds exactly what I need", "next_seq": 6, "next_path": "stressed"}
  ]$j$::jsonb,
  6, 'stressed', false, null
),

(
  'MT-BEG-001', 6, 'stressed',
  'You''re doing something really good for yourself today. The moment your session begins, I want you to give yourself permission to fully let go — just breathe, and trust that you''re being taken care of.',
  $j$[
    {"id": "ready", "label": "I''m ready", "next_seq": 15, "next_path": "all"}
  ]$j$::jsonb,
  15, 'all', false, null
),

-- ── Path: Pain ────────────────────────────────────────────────────────────────

(
  'MT-BEG-001', 7, 'pain',
  'I''m sorry you''re dealing with that — pain can really affect everything, including your mood and your sleep. You''ve absolutely done the right thing by coming in. Can you tell me a little about where the pain is? I want to make sure we focus on the right areas.',
  $j$[
    {"id": "neck",    "label": "My neck and shoulders",          "next_seq": 8, "next_path": "pain"},
    {"id": "back",    "label": "My lower back",                  "next_seq": 8, "next_path": "pain"},
    {"id": "general", "label": "It''s a bit everywhere really",  "next_seq": 8, "next_path": "pain"}
  ]$j$::jsonb,
  8, 'pain', false, null
),

(
  'MT-BEG-001', 8, 'pain',
  'Thank you for letting me know — that really helps me. I''ll be very attentive to those areas and work carefully. If at any point during the session something feels too intense or uncomfortable, please just let me know and I''ll adjust right away. Your comfort and safety always come first.',
  $j$[
    {"id": "appreciate", "label": "I really appreciate that", "next_seq": 9, "next_path": "pain"}
  ]$j$::jsonb,
  9, 'pain', false, null
),

(
  'MT-BEG-001', 9, 'pain',
  'You''re in very good hands. We''ll take this at a pace that feels right for you, and I''ll check in with you as we go. I want you to leave today feeling noticeably better and more comfortable in your own body.',
  $j$[
    {"id": "ready", "label": "Thank you — let''s get started", "next_seq": 15, "next_path": "all"}
  ]$j$::jsonb,
  15, 'all', false, null
),

-- ── Path: Relax ───────────────────────────────────────────────────────────────

(
  'MT-BEG-001', 10, 'relax',
  'I love that — a session purely for relaxation is one of the best things you can give yourself. No pressure, no agenda. We''re going to focus entirely on how good we can make you feel.',
  $j$[
    {"id": "perfect", "label": "That''s exactly what I needed to hear", "next_seq": 11, "next_path": "relax"}
  ]$j$::jsonb,
  11, 'relax', false, null
),

(
  'MT-BEG-001', 11, 'relax',
  'I''m going to use long, flowing movements that help your nervous system completely switch into rest mode. A lot of people find themselves drifting into a really lovely, dreamy state — you might even let out a deep breath and wonder why you don''t do this more often.',
  $j$[
    {"id": "excited", "label": "I can''t wait", "next_seq": 12, "next_path": "relax"}
  ]$j$::jsonb,
  12, 'relax', false, null
),

(
  'MT-BEG-001', 12, 'relax',
  'Perfect. Let''s just make sure everything is set up exactly right for you before we begin. I want this experience to be everything you''re hoping for.',
  $j$[
    {"id": "ready", "label": "I''m ready", "next_seq": 15, "next_path": "all"}
  ]$j$::jsonb,
  15, 'all', false, null
),

-- ── Path: About Therapist ─────────────────────────────────────────────────────

(
  'MT-BEG-001', 13, 'about_therapist',
  'Of course! I''ve been working as a massage therapist for a number of years now, and it''s honestly one of the most meaningful things I could do. For me, it''s never just about the physical side — it''s about making sure every person who comes in feels genuinely heard, cared for, and better for having been here.',
  $j$[
    {"id": "lovely", "label": "That''s a really lovely way to see it", "next_seq": 14, "next_path": "about_therapist"}
  ]$j$::jsonb,
  14, 'about_therapist', false, null
),

(
  'MT-BEG-001', 14, 'about_therapist',
  'Thank you for asking — it really means a lot. But now I''d love to turn the focus to you. What brought you in today? Is there something particular you''d like us to work on together?',
  $j$[
    {"id": "stressed",  "label": "I''ve been feeling really stressed",    "next_seq": 4,  "next_path": "stressed"},
    {"id": "pain",      "label": "I have some pain I''d like help with",  "next_seq": 7,  "next_path": "pain"},
    {"id": "relax",     "label": "I just want to fully relax",            "next_seq": 10, "next_path": "relax"}
  ]$j$::jsonb,
  null, 'all', false, null
),

-- ── Shared Convergence ────────────────────────────────────────────────────────

(
  'MT-BEG-001', 15, 'all',
  'Before I finish preparing the room, is there anything else you''d like me to know? Maybe somewhere you''re particularly sensitive, or anywhere you''d prefer I avoid? I want this session to be perfectly tailored to you.',
  $j$[
    {"id": "no_concerns",  "label": "No, I think we''ve covered everything",  "next_seq": 16, "next_path": "all"},
    {"id": "has_concern",  "label": "There is one thing actually...",          "next_seq": 16, "next_path": "all"}
  ]$j$::jsonb,
  16, 'all', false, null
),

(
  'MT-BEG-001', 16, 'all',
  'Perfect. I''ll get everything set up for you now. I can adjust the lighting and temperature to make sure you''re comfortable. Would you like some gentle background music, or would you prefer quiet?',
  $j$[
    {"id": "music",  "label": "Soft music would be lovely",           "next_seq": 17, "next_path": "all"},
    {"id": "quiet",  "label": "Quiet please — I''d like to just focus", "next_seq": 17, "next_path": "all"}
  ]$j$::jsonb,
  17, 'all', false, null
),

(
  'MT-BEG-001', 17, 'all',
  'Lovely. One last thing before we begin — do you have a preference for pressure? Some people love firm, deep work, while others prefer something lighter and more soothing. There''s no wrong answer at all.',
  $j$[
    {"id": "firm",    "label": "Firm please — I like it deep",     "next_seq": 18, "next_path": "all"},
    {"id": "medium",  "label": "Medium pressure is perfect",       "next_seq": 18, "next_path": "all"},
    {"id": "light",   "label": "Gentle please — nice and light",   "next_seq": 18, "next_path": "all"}
  ]$j$::jsonb,
  18, 'all', false, null
),

(
  'MT-BEG-001', 18, 'all',
  'Perfect — I''ll keep that in mind throughout. And remember, if anything ever feels too much or you''d like me to adjust, just say the word. You''re always in control of your experience here.',
  $j$[
    {"id": "understood", "label": "I understand, thank you", "next_seq": 19, "next_path": "all"}
  ]$j$::jsonb,
  19, 'all', false, null
),

(
  'MT-BEG-001', 19, 'all',
  'Wonderful. Everything is ready for you. Take a moment to settle in, take a slow deep breath, and let yourself fully arrive in this moment. You''ve given yourself something really special today.',
  $j$[
    {"id": "begin", "label": "I''m ready to begin", "next_seq": 20, "next_path": "all"}
  ]$j$::jsonb,
  20, 'all', false, null
),

-- ── Terminal Record — Transition to MT-MID-001 ────────────────────────────────

(
  'MT-BEG-001', 20, 'all',
  'Let''s begin. Just breathe... let everything go. You''re safe, you''re cared for, and this moment is entirely yours.',
  '[]'::jsonb,
  null, 'all', true, 'MT-MID-001'
);
