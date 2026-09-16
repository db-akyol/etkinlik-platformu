"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventRow } from "@/lib/supabase/types";
import { parseEventForm, resolveCityId } from "./event-form";

// NOTE: lib/supabase/types.ts's `Database` type is missing the `Relationships`
// field on each table (and `Views`/`Functions` on the schema) that
// @supabase/postgrest-js's generics expect. Without them, every `.select()`/
// `.insert()`/`.update()` call infers as `never` instead of the real row
// type. Until that shared file is fixed, writes are cast through `as never`
// and reads use `.returns<T[]>()` (chained after all filters, never after
// `.single()`, which does not survive the override) as a local workaround.

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function approveEvent(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ status: "approved" } as never)
    .eq("id", id);

  if (error) {
    throw new Error(`Etkinlik onaylanamadı: ${error.message}`);
  }

  revalidatePath("/admin");
}

export async function rejectEvent(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ status: "rejected" } as never)
    .eq("id", id);

  if (error) {
    throw new Error(`Etkinlik reddedilemedi: ${error.message}`);
  }

  revalidatePath("/admin");
}

export async function createEvent(formData: FormData) {
  const supabase = await createClient();
  const fields = parseEventForm(formData);

  if (!fields.title || !fields.start_at) {
    throw new Error("Başlık ve başlangıç tarihi zorunludur.");
  }

  const city_id = await resolveCityId(supabase, fields.venue_id);

  const insertRow: Partial<EventRow> = {
    title: fields.title,
    description: fields.description,
    start_at: fields.start_at,
    end_at: fields.end_at,
    city_id,
    venue_id: fields.venue_id,
    category_id: fields.category_id,
    price: fields.price,
    image_url: fields.image_url,
    source_type: "manual",
    source_url: null,
    // The admin is adding this directly, so it does not need self-approval.
    status: "approved",
  };

  const { error } = await supabase.from("events").insert(insertRow as never);

  if (error) {
    throw new Error(`Etkinlik oluşturulamadı: ${error.message}`);
  }

  revalidatePath("/admin");
  redirect("/admin");
}

export async function updateEvent(id: string, formData: FormData) {
  const supabase = await createClient();
  const fields = parseEventForm(formData);

  if (!fields.title || !fields.start_at) {
    throw new Error("Başlık ve başlangıç tarihi zorunludur.");
  }

  const city_id = await resolveCityId(supabase, fields.venue_id);

  const updateRow: Partial<EventRow> = {
    title: fields.title,
    description: fields.description,
    start_at: fields.start_at,
    end_at: fields.end_at,
    city_id,
    venue_id: fields.venue_id,
    category_id: fields.category_id,
    price: fields.price,
    image_url: fields.image_url,
  };

  const { error } = await supabase
    .from("events")
    .update(updateRow as never)
    .eq("id", id);

  if (error) {
    throw new Error(`Etkinlik güncellenemedi: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/events/${id}/edit`);
  redirect("/admin");
}
