/**
 * AES-256-GCM helpers for API key encryption / decryption.
 *
 * The encryption key is derived from a caller-supplied secret (SUPABASE_SERVICE_ROLE_KEY)
 * using SHA-256. Only edge functions that have access to that secret can decrypt.
 *
 * Wire format (base64-encoded):
 *   [ 12-byte IV ][ ciphertext + 16-byte GCM auth tag ]
 */

const CONTEXT = new TextEncoder().encode("provider-api-key-v1");

async function deriveKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [usage]);
}

export async function encryptApiKey(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret, "encrypt");
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: CONTEXT },
    key,
    new TextEncoder().encode(plaintext),
  );
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptApiKey(ciphertext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret, "decrypt");
  const buf = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv  = buf.slice(0, 12);
  const ct  = buf.slice(12);
  const pt  = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: CONTEXT },
    key,
    ct,
  );
  return new TextDecoder().decode(pt);
}
