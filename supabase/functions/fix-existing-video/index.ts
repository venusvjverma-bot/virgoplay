import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error } = await admin
      .from("scene_image_productions")
      .select("id, video_url")
      .eq("video_status", "Ready")
      .not("video_url", "is", null);

    if (error) throw new Error(`DB error: ${error.message}`);

    const results: string[] = [];

    for (const row of rows ?? []) {
      try {
        const url = row.video_url as string;
        const match = url.match(/generation-outputs\/(.+)$/);
        if (!match) { results.push(`${row.id}: skip (no path)`); continue; }
        const path = match[1];

        const { data: fileData, error: dlErr } = await admin.storage
          .from("generation-outputs")
          .download(path);

        if (dlErr) { results.push(`${row.id}: download failed: ${dlErr.message}`); continue; }

        const buf = await fileData.arrayBuffer();
        results.push(`${row.id}: downloaded ${buf.byteLength} bytes`);
        const fixed = moveMoovToStart(buf);

        if (fixed === buf) {
          results.push(`${row.id}: moov already at front, no change`);
          continue;
        }

        const { error: upErr } = await admin.storage
          .from("generation-outputs")
          .upload(path, fixed, { contentType: "video/mp4", upsert: true });

        if (upErr) { results.push(`${row.id}: re-upload failed: ${upErr.message}`); continue; }
        results.push(`${row.id}: fixed and re-uploaded`);
      } catch (e) {
        results.push(`${row.id}: error: ${(e as Error).message}`);
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function moveMoovToStart(data: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);

  let pos = 0;
  let moovPos = -1;
  let moovSize = 0;
  let mdatPos = -1;
  let mdatSize = 0;
  const otherBoxes: { offset: number; size: number }[] = [];

  while (pos < bytes.length - 8) {
    const size = view.getUint32(pos);
    const type = String.fromCharCode(bytes[pos+4], bytes[pos+5], bytes[pos+6], bytes[pos+7]);
    if (size < 8 || pos + size > bytes.length) break;

    if (type === "moov") {
      moovPos = pos;
      moovSize = size;
    } else if (type === "mdat") {
      if (mdatPos === -1) { mdatPos = pos; mdatSize = size; }
    } else {
      otherBoxes.push({ offset: pos, size });
    }
    pos += size;
  }

  if (moovPos === -1 || mdatPos === -1 || moovPos < mdatPos) return data;

  const result = new Uint8Array(bytes.length);
  let wp = 0;
  for (const box of otherBoxes) {
    result.set(bytes.subarray(box.offset, box.offset + box.size), wp);
    wp += box.size;
  }
  result.set(bytes.subarray(moovPos, moovPos + moovSize), wp);
  wp += moovSize;
  result.set(bytes.subarray(mdatPos, mdatPos + mdatSize), wp);

  return result.buffer;
}
