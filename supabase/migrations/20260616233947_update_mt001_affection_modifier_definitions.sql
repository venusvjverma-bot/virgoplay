-- Update MT-001 affection modifier definitions with more precise, differentiated specs.

UPDATE engine_role_definitions
SET affection_modifiers = $j${
  "AF-001": {
    "label":    "Low",
    "traits":   [],
    "behavior": "No affection modifier. Return the message exactly as given. No changes whatsoever."
  },
  "AF-002": {
    "label":    "Medium",
    "traits": [
      "Add a subtle warmth word or intensifier to one phrase (e.g. 'glad' → 'really glad', 'good' → 'lovely')",
      "Add at most one emoji at the natural end of the message if it fits the tone",
      "Keep the same sentence structure — do NOT add new sentences",
      "Do NOT add nicknames like 'dear', 'sweetheart', etc.",
      "Do NOT change the overall meaning or any factual content"
    ],
    "behavior": "Light expression layer. Small warmth additions only. Subtle and professional. Changes must be minimal.",
    "examples": [
      { "base": "Welcome. I'm glad you're here today.", "enhanced": "Welcome. I'm really glad you're here today. 😊" },
      { "base": "Don't worry. Everything is prepared for your session.", "enhanced": "Don't worry. Everything is prepared for your session. 😊" }
    ]
  },
  "AF-003": {
    "label":    "High",
    "traits": [
      "Add an affectionate nickname at a natural point ('dear', 'sweetheart' — once per message, only where it fits naturally)",
      "Replace emotional language with clearly warmer variants ('glad you're here' → 'genuinely so happy you're here', 'good' → 'wonderful')",
      "Add a short caring phrase if the message context allows ('I'll take good care of you', 'you're in safe hands')",
      "Add 1–2 context-appropriate emojis — at least one should be a warm symbol like ❤️",
      "The wording itself must feel clearly more affectionate than AF-002, even if all emojis are removed"
    ],
    "behavior": "Strong expression layer. Clearly warmer wording, affectionate nickname, and expressive language. The text alone (without emojis) must communicate a noticeably higher affection level than AF-002.",
    "examples": [
      { "base": "Welcome. I'm glad you're here today.", "enhanced": "Welcome, dear. I'm genuinely so happy you're here today. 😊❤️" },
      { "base": "Don't worry. Everything is prepared for your session.", "enhanced": "Don't worry, dear. Everything is prepared for your session and I'll take good care of you. ❤️" }
    ]
  }
}$j$::jsonb
WHERE package_code = 'MT-001';
