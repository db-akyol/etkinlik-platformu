"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// See app/admin/actions.ts for why reads/writes here go through
// `.returns<T[]>()` / `as never` — lib/supabase/types.ts's Database type
// doesn't yet satisfy postgrest-js's stricter generics.

export async function signOutPublic() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * Adds or removes the current user's favorite for an event. Throws if the
 * caller isn't logged in — FavoriteButton only invokes this after checking
 * `isLoggedIn`, so this is a defensive backstop, not the primary UX guard.
 */
export async function toggleFavorite(eventId: string): Promise<{ favorited: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Favorilere eklemek için giriş yapmalısınız.");
  }

  const { data: existing } = await supabase
    .from("favorites")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .returns<{ event_id: string }[]>();

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", user.id);

    if (error) throw new Error(`Favori kaldırılamadı: ${error.message}`);

    revalidatePath("/favoriler");
    revalidatePath("/");
    revalidatePath(`/etkinlik/${eventId}`);
    return { favorited: false };
  }

  const { error } = await supabase
    .from("favorites")
    .insert({ event_id: eventId, user_id: user.id } as never);

  if (error) throw new Error(`Favorilere eklenemedi: ${error.message}`);

  revalidatePath("/favoriler");
  revalidatePath("/");
  revalidatePath(`/etkinlik/${eventId}`);
  return { favorited: true };
}
