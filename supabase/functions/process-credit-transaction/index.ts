import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CREDIT_COSTS: Record<string, number> = {
  image: 4,
  video: 10,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { client_id, session_token, creator_id, action, media_url } = await req.json() as {
      client_id?: string;
      session_token?: string;
      creator_id?: string;
      action?: "image" | "video";
      media_url?: string;
    };

    if (!client_id || !creator_id || !action) {
      return respond({ error: "client_id, creator_id, and action are required" }, 400);
    }

    if (!session_token) {
      return respond({ error: "session_token is required" }, 400);
    }

    if (!media_url) {
      return respond({ error: "media_url is required" }, 400);
    }

    const cost = CREDIT_COSTS[action];
    if (cost === undefined) {
      return respond({ error: `Invalid action. Must be 'image' or 'video'.` }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Atomically check client balance and deduct ──────────────────────────
    // Use a transaction via RPC to ensure atomicity.
    const { data: txResult, error: txError } = await admin.rpc("process_credit_transaction", {
      p_client_id: client_id,
      p_session_token: session_token,
      p_creator_id: creator_id,
      p_amount: cost,
      p_action: action,
      p_media_url: media_url,
    });

    if (txError) {
      console.error("[process-credit-transaction] RPC error:", txError.message);
      return respond({ error: "Transaction failed." }, 500);
    }

    if (!txResult || txResult.success === false) {
      const reason = txResult?.reason ?? "Insufficient credits.";
      return respond({ error: reason, insufficient_credits: txResult?.insufficient_credits ?? false }, 402);
    }

    return respond({
      success: true,
      already_unlocked: txResult.already_unlocked ?? false,
      client_balance: txResult.client_balance,
      creator_earnings: txResult.creator_earnings,
      cost: txResult.cost ?? cost,
      action,
    });
  } catch (err) {
    console.error("[process-credit-transaction] Unhandled error:", (err as Error).message);
    return respond({ error: "An unexpected error occurred." }, 500);
  }
});
