/**
 * merge-duplicate-events.ts — ONE-OFF cleanup tool, not part of the regular
 * scrape pipeline (not in `run-all.ts`'s `PARSERS`, no cron runs it).
 *
 * `upsert-event.ts`'s fallback lookup (see that file's header) only stops
 * NEW near-duplicate rows from being created going forward — it does
 * nothing about rows that were already inserted before that fallback
 * existed (the exact situation adding bubilet.ts produced in production on
 * 2026-09-16: e.g. "Büyük Afrika Sirki" and "Büyük Afrika Sirki Oyunu" as
 * two separate live rows). This finds those existing clusters using the
 * same `titlesMatchForDedup` the live fallback uses — so "what counts as a
 * duplicate" can't drift between the two — and, same precedent as
 * supabase/migrations/0003_dedup_by_title_start_at.sql's one-time merge,
 * keeps the OLDEST row per cluster and removes the rest.
 * `favorites.event_id references events(id) on delete cascade` (see
 * supabase/migrations/0002_admin_users_and_favorites.sql) means a duplicate
 * someone favorited just quietly loses that one favorite, not an error.
 *
 * Defaults to a DRY RUN — prints every cluster it would merge and does
 * nothing else. Pass --apply to actually delete.
 *
 *   npx tsx scripts/scrapers/merge-duplicate-events.ts            # report only
 *   npx tsx scripts/scrapers/merge-duplicate-events.ts --apply    # deletes
 *
 * Uses whatever NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * .env.local (or the shell environment) resolves to — point those at
 * production deliberately to clean up the live duplicates; there is no
 * separate "prod mode" flag here on purpose, to keep this obvious rather
 * than magic.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getSupabaseAdmin } from "./lib/supabase-admin";
import { titlesMatchForDedup } from "./lib/normalize";

export interface DuplicateCandidateEvent {
  id: string;
  title: string;
  start_at: string;
  created_at: string;
  source_url: string | null;
}

/** Groups events sharing a `start_at` into clusters of mutually
 *  dedup-matching titles (transitive closure — see this file's header for
 *  why plain pairwise containment isn't guaranteed transitive on its own). */
export function clusterDuplicates(events: DuplicateCandidateEvent[]): DuplicateCandidateEvent[][] {
  const byStartAt = new Map<string, DuplicateCandidateEvent[]>();
  for (const event of events) {
    const bucket = byStartAt.get(event.start_at);
    if (bucket) bucket.push(event);
    else byStartAt.set(event.start_at, [event]);
  }

  const clusters: DuplicateCandidateEvent[][] = [];

  for (const group of byStartAt.values()) {
    if (group.length < 2) continue;

    const assigned = new Set<string>();
    for (const seed of group) {
      if (assigned.has(seed.id)) continue;

      const cluster = [seed];
      assigned.add(seed.id);

      // BFS so a chain (A matches B, B matches C) clusters together even if
      // A and C don't directly match each other.
      let frontier = [seed];
      while (frontier.length > 0) {
        const next: DuplicateCandidateEvent[] = [];
        for (const candidate of group) {
          if (assigned.has(candidate.id)) continue;
          if (frontier.some((member) => titlesMatchForDedup(member.title, candidate.title))) {
            cluster.push(candidate);
            assigned.add(candidate.id);
            next.push(candidate);
          }
        }
        frontier = next;
      }

      if (cluster.length > 1) clusters.push(cluster);
    }
  }

  return clusters;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("events")
    .select("id, title, start_at, created_at, source_url")
    .order("start_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch events:", error);
    process.exit(1);
  }

  const events = (data ?? []) as DuplicateCandidateEvent[];
  console.log(`Fetched ${events.length} event(s).`);

  const clusters = clusterDuplicates(events);
  if (clusters.length === 0) {
    console.log("No duplicate clusters found.");
    return;
  }

  console.log(`\nFound ${clusters.length} duplicate cluster(s):\n`);

  let totalToDelete = 0;
  for (const cluster of clusters) {
    const [canonical, ...rest] = [...cluster].sort((a, b) =>
      a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at),
    );

    console.log(`[${canonical.start_at}]`);
    console.log(`  KEEP   "${canonical.title}" (${canonical.id}) — ${canonical.source_url}`);
    for (const dup of rest) {
      console.log(`  DELETE "${dup.title}" (${dup.id}) — ${dup.source_url}`);
      totalToDelete++;
    }
    console.log("");

    if (apply) {
      const { error: deleteError } = await supabase
        .from("events")
        .delete()
        .in(
          "id",
          rest.map((r) => r.id),
        );
      if (deleteError) {
        console.error(`  Failed to delete duplicates for "${canonical.title}":`, deleteError);
      }
    }
  }

  if (apply) {
    console.log(`Deleted ${totalToDelete} duplicate row(s).`);
  } else {
    console.log(
      `Dry run — ${totalToDelete} row(s) would be deleted. Re-run with --apply to actually delete them.`,
    );
  }
}

// Only run when invoked directly — importing this module (e.g. from
// merge-duplicate-events.test.ts, to unit-test clusterDuplicates) must not
// kick off a real Supabase connection/query.
const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
