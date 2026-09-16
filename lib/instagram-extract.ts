/**
 * Turns an Instagram post (caption text + poster image) into candidate
 * `events` fields via Claude's vision API. Used only by
 * app/admin/instagram-actions.ts — see
 * docs/design/instagram-assisted-entry.md.
 *
 * `parseExtractionResponse` is the one piece worth unit-testing: it must
 * NEVER throw (a malformed/unparseable model response degrades to
 * all-null fields, same as "couldn't determine this field") and must
 * NEVER coerce a wrong-shaped value into looking valid — a start_at that
 * isn't exactly "YYYY-MM-DDTHH:mm" is nulled out rather than guessed at,
 * because a wrong stored date is worse than a blank one a human then fills
 * in. `extractEventFromImage` (the actual network call) is NOT unit-tested
 * here, matching every other source in this repo that calls a live network
 * API — see lib/instagram-extract.test.ts's header.
 */
import type Anthropic from "@anthropic-ai/sdk";

export interface ExtractedEventFields {
  title: string | null;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  venue_name: string | null;
  price: string | null;
}

export const EMPTY_EXTRACTED_FIELDS: ExtractedEventFields = {
  title: null,
  description: null,
  start_at: null,
  end_at: null,
  venue_name: null,
  price: null,
};

const DATETIME_LOCAL_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function readStringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readDateTimeField(value: unknown): string | null {
  const str = readStringField(value);
  return str && DATETIME_LOCAL_SHAPE.test(str) ? str : null;
}

/**
 * Parses the model's raw text response into `ExtractedEventFields`. Strips
 * a ```json fence if the model added one despite the prompt saying not to,
 * then validates each expected key individually — never throws.
 */
export function parseExtractionResponse(raw: string): ExtractedEventFields {
  const withoutFences = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFences);
  } catch {
    return { ...EMPTY_EXTRACTED_FIELDS };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ...EMPTY_EXTRACTED_FIELDS };
  }

  const obj = parsed as Record<string, unknown>;
  return {
    title: readStringField(obj.title),
    description: readStringField(obj.description),
    start_at: readDateTimeField(obj.start_at),
    end_at: readDateTimeField(obj.end_at),
    venue_name: readStringField(obj.venue_name),
    price: readStringField(obj.price),
  };
}

/**
 * Builds the prompt sent alongside the poster image. Requests a bare JSON
 * object (no markdown, no prose) matching ExtractedEventFields exactly, in
 * Turkey local wall-clock time — matches `<input type="datetime-local">`'s
 * "YYYY-MM-DDTHH:mm" shape so the extracted value can go straight into
 * EventFormFields' defaultValue with no further conversion.
 */
export function buildExtractionPrompt(captionText: string): string {
  return `Bu bir Instagram etkinlik duyurusu. Ekli görseli (poster) ve aşağıdaki caption metnini incele, etkinlik bilgilerini SADECE aşağıdaki JSON şemasıyla, başka hiçbir açıklama veya markdown olmadan döndür:

{"title": string|null, "description": string|null, "start_at": string|null, "end_at": string|null, "venue_name": string|null, "price": string|null}

Kurallar:
- start_at ve end_at, "YYYY-MM-DDTHH:mm" formatında Türkiye yerel saatiyle olmalı (örnek: "2026-09-18T20:00"). Tarih veya saat net değilse null bırak, TAHMİN ETME.
- Bir alanı görselden veya metinden net olarak çıkaramıyorsan null bırak, uydurma.
- price sadece görsel veya metinde açıkça yazıyorsa doldur (örnek: "150 TL", "Ücretsiz"); yoksa null.
- description, caption'ın kısa bir özeti olabilir; caption boşsa null.
- Yıl belirtilmemişse ve tarih geçmişte kalıyor gibi görünüyorsa, önümüzdeki en yakın uygun yılı varsay.

Caption metni:
"""
${captionText}
"""`;
}

const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";
type SupportedImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/**
 * Calls Claude with the poster image + caption and returns validated
 * fields. Any failure (network error, API error, an unreadable response)
 * is caught here and degrades to EMPTY_EXTRACTED_FIELDS — the caller
 * (app/admin/instagram-actions.ts) must be able to fall through to "admin
 * fills the form in by hand" without losing the image they already
 * uploaded, even if the AI call itself is down.
 */
export async function extractEventFromImage(
  anthropic: Anthropic,
  params: { captionText: string; imageBase64: string; imageMediaType: string },
): Promise<ExtractedEventFields> {
  try {
    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: params.imageMediaType as SupportedImageMediaType,
                data: params.imageBase64,
              },
            },
            { type: "text", text: buildExtractionPrompt(params.captionText) },
          ],
        },
      ],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock) return { ...EMPTY_EXTRACTED_FIELDS };

    return parseExtractionResponse(textBlock.text);
  } catch (err) {
    console.error("Instagram extraction call failed:", err);
    return { ...EMPTY_EXTRACTED_FIELDS };
  }
}
