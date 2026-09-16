// app/admin/instagram-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic";
import { extractEventFromImage, type ExtractedEventFields } from "@/lib/instagram-extract";
import type { EventRow } from "@/lib/supabase/types";
import { parseEventForm, readField, resolveCityId } from "./event-form";
import { resolveVenueByName } from "./venue-resolve";

const EVENT_IMAGES_BUCKET = "event-images";
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export type ExtractState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "extracted"; fields: ExtractedEventFields; imageUrl: string; sourceUrl: string | null };

export type CreateEventState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; eventId: string };

async function uploadEventImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  image: File,
): Promise<string> {
  const extension = image.type.split("/")[1] ?? "jpg";
  const path = `${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(EVENT_IMAGES_BUCKET).upload(path, image, {
    contentType: image.type,
  });

  if (error) {
    throw new Error(`Görsel yüklenemedi: ${error.message}`);
  }

  const { data } = supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Phase 1: upload the image, call the AI, return the proposal as plain
 * state — does NOT write to `events`. `events.start_at` is NOT NULL and is
 * exactly the field extraction is least reliable at, so nothing is
 * committed until a human confirms a real value in the phase-2 form (see
 * createEventFromInstagram below and
 * docs/design/instagram-assisted-entry.md).
 * Shaped for React 19's `useActionState` (components/admin/InstagramImportForm.tsx).
 */
export async function extractFromInstagram(
  _prevState: ExtractState,
  formData: FormData,
): Promise<ExtractState> {
  const caption = readField(formData, "caption");
  const sourceUrl = readField(formData, "source_url") || null;
  const image = formData.get("image");

  if (!caption) {
    return { status: "error", message: "Post metni (caption) zorunludur." };
  }
  if (!(image instanceof File) || image.size === 0) {
    return { status: "error", message: "Bir görsel dosyası yüklemelisin." };
  }
  if (!ACCEPTED_IMAGE_TYPES.has(image.type)) {
    return { status: "error", message: `Desteklenmeyen görsel türü: ${image.type || "bilinmiyor"}` };
  }

  const supabase = await createClient();

  let imageUrl: string;
  try {
    imageUrl = await uploadEventImage(supabase, image);
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }

  let fields: ExtractedEventFields;
  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    fields = await extractEventFromImage(getAnthropicClient(), {
      captionText: caption,
      imageBase64: buffer.toString("base64"),
      imageMediaType: image.type,
    });
  } catch (err) {
    // getAnthropicClient()'s missing-config error, or anything else
    // extractEventFromImage's own internal try/catch didn't already reduce
    // to EMPTY_EXTRACTED_FIELDS. The image is already uploaded at this
    // point — re-running this step re-uploads it, which is an accepted v1
    // limitation (see the spec's "Out of scope" section).
    return {
      status: "error",
      message: `AI çıkarımı başlatılamadı: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { status: "extracted", fields, imageUrl, sourceUrl };
}

/**
 * Phase 2: the admin has reviewed/corrected the proposed fields in the same
 * EventFormFields component new/edit use — this actually inserts the row,
 * always as status "pending" (never auto-approved, unlike createEvent) so
 * it lands in the existing /admin "Onay bekleyen" queue for a final check.
 * Shaped for React 19's `useActionState`, same as extractFromInstagram
 * above — a validation/DB failure (missing venue, duplicate title+start_at)
 * returns an error state instead of throwing, so the admin doesn't lose the
 * already-uploaded image and the paid AI extraction behind Next's generic
 * production error page (there is no error.tsx in this repo).
 */
export async function createEventFromInstagram(
  _prevState: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  try {
    const supabase = await createClient();
    const fields = parseEventForm(formData);
    const venueName = readField(formData, "venue_name");
    const sourceUrl = readField(formData, "source_url") || null;

    if (!fields.title || !fields.start_at) {
      throw new Error("Başlık ve başlangıç tarihi zorunludur.");
    }

    let venueId = fields.venue_id;
    if (!venueId && venueName) {
      venueId = await resolveVenueByName(supabase, venueName);
    }

    const city_id = await resolveCityId(supabase, venueId);

    const insertRow: Partial<EventRow> = {
      title: fields.title,
      description: fields.description,
      start_at: fields.start_at,
      end_at: fields.end_at,
      city_id,
      venue_id: venueId,
      category_id: fields.category_id,
      price: fields.price,
      image_url: fields.image_url,
      source_type: "manual",
      source_url: sourceUrl,
      status: "pending",
    };

    const { data, error } = await supabase
      .from("events")
      .insert(insertRow as never)
      .select("id")
      .returns<Pick<EventRow, "id">[]>();

    const inserted = data?.[0];
    if (error || !inserted) {
      throw new Error(`Etkinlik oluşturulamadı: ${error?.message ?? "bilinmeyen hata"}`);
    }

    revalidatePath("/admin");
    return { status: "success", eventId: inserted.id };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
