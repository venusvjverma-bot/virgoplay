import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ALLOWED_CATEGORIES = [
  "new_idea",
  "website_feedback",
  "roleplay_suggestion",
  "bug_report",
  "general",
];

function genericError(status = 500) {
  return respond({ error: "Something went wrong. Please try again later." }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !supabaseUrl) return genericError();

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Forward the visitor IP so the RPC can fingerprint it for rate
    // limiting and duplicate-vote prevention.
    const forwardedFor =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("cf-connecting-ip") ??
      "";
    const rpcHeaders = { "X-Forwarded-For": forwardedFor };

    if (req.method === "GET") {
      const { data, error } = await supabase.rpc("promo_get_ideas")
        .select("id, title, details, category, vote_count, created_at")
        .abortSignal(AbortSignal.timeout(8000));
      if (error) {
        console.error("promo_get_ideas failed:", error.message);
        return genericError();
      }
      return respond({ ideas: data ?? [] });
    }

    if (req.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    let body: { action?: string; category?: unknown; message?: unknown; email?: unknown; idea_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return respond({ error: "Invalid request" }, 400);
    }

    if (body.action === "vote") {
      const ideaId = typeof body.idea_id === "string" ? body.idea_id : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ideaId)) {
        return respond({ error: "Invalid idea" }, 400);
      }
      const { data, error } = await supabase.rpc("promo_vote_idea", { p_idea_id: ideaId })
        .abortSignal(AbortSignal.timeout(8000));
      if (error) {
        console.error("promo_vote_idea failed:", error.message);
        return respond({ error: "Could not register your vote. Please try again." }, 400);
      }
      return respond({ vote_count: data });
    }

    if (body.action === "feedback") {
      const category = typeof body.category === "string" ? body.category : "";
      const message = typeof body.message === "string" ? body.message : "";
      const email = typeof body.email === "string" && body.email.trim().length > 0
        ? body.email.trim()
        : null;

      if (!ALLOWED_CATEGORIES.includes(category)) {
        return respond({ error: "Please choose a feedback category." }, 400);
      }
      if (message.trim().length < 10 || message.trim().length > 2000) {
        return respond({ error: "Your message must be between 10 and 2000 characters." }, 400);
      }
      if (email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
        return respond({ error: "Please enter a valid email address or leave it empty." }, 400);
      }

      const { error } = await supabase.rpc("promo_submit_feedback", {
        p_category: category,
        p_message: message,
        p_email: email,
      }).abortSignal(AbortSignal.timeout(8000));
      if (error) {
        console.error("promo_submit_feedback failed:", error.message);
        if (error.message.includes("Too many submissions")) {
          return respond({ error: "You have sent several messages already. Please try again tomorrow." }, 429);
        }
        return respond({ error: "Your message could not be sent. Please try again." }, 400);
      }

      // A "new idea" message also becomes a public, votable idea so the
      // Community Ideas section is driven by real submissions.
      if (category === "new_idea") {
        const trimmed = message.trim();
        const title = trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
        const { data: ideaData, error: ideaError } = await supabase
          .from("promo_ideas")
          .insert({ title, details: trimmed, category, status: "approved" })
          .select("id")
          .abortSignal(AbortSignal.timeout(8000));
        if (ideaError) {
          console.error("promo_ideas insert failed:", ideaError.message);
        } else if (ideaData && ideaData.length > 0) {
          await supabase.rpc("promo_vote_idea", {
            p_idea_id: (ideaData[0] as { id: string }).id,
          }).abortSignal(AbortSignal.timeout(8000));
        }
      }

      return respond({ ok: true });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("promo-feedback error:", e instanceof Error ? e.message : String(e));
    return genericError();
  }
});
