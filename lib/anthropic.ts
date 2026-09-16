/**
 * Thin wrapper around the Anthropic SDK for the Instagram-assisted event
 * entry flow (app/admin/instagram-actions.ts) — see
 * docs/design/instagram-assisted-entry.md.
 * Mirrors scripts/scrapers/lib/supabase-admin.ts's "throw a dedicated error
 * class only for the missing-env-var case" shape, memoizing the client
 * across calls within one server process.
 */
import Anthropic from "@anthropic-ai/sdk";

export class MissingAnthropicConfigError extends Error {}

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new MissingAnthropicConfigError(
      "ANTHROPIC_API_KEY ortam değişkeni ayarlanmamış. .env.local dosyasına " +
        "ve Vercel proje ayarlarına eklenmesi gerekiyor (bkz. .env.example).",
    );
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}
