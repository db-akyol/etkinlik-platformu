import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EventListing, { parseListingParams, type SearchParams } from "@/components/EventListing";
import { categoryPageCopy } from "@/lib/category-pages";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/supabase/types";

// Same reason as the home page: the scraper writes straight to Supabase, so
// every request has to read current data.
export const dynamic = "force-dynamic";

type PageParams = { slug: string };

async function getCategory(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select<"id, name, slug", Category>("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (error) console.error(`[kategori/${slug}] category lookup failed:`, error);
  return { category: data, error };
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { slug } = await params;
  const { category } = await getCategory(decodeURIComponent(slug));
  if (!category) return { title: "Kategori bulunamadı" };

  const copy = categoryPageCopy(category.slug, category.name);
  const path = `/kategori/${category.slug}`;
  // Filtered views of this page (?gun=, ?q=, ?fiyat=, ?gorunum=) all point
  // back to it, as the home page's do to "/". `openGraph` and `twitter` are
  // repeated in full because Next merges metadata shallowly.
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName: "Diyarbakır Etkinlik",
      url: path,
      title: copy.title,
      description: copy.description,
      images: [{ url: "/og-default.png", width: 1200, height: 630, alt: "Diyarbakır Etkinlik" }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: ["/og-default.png"],
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const { category, error } = await getCategory(decodeURIComponent(slug));
  // As on the event page: a failed lookup is an outage, not a missing page.
  if (error) throw error;
  if (!category) notFound();

  const copy = categoryPageCopy(category.slug, category.name);
  return (
    <EventListing
      params={{ ...parseListingParams(await searchParams), kategori: category.slug }}
      heading={copy.heading}
      intro={copy.description}
    />
  );
}
