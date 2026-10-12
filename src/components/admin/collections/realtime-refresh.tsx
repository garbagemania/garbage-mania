"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase Realtime postgres_changes on public.collections
 * and re-fetches the current route's server data (router.refresh()) on
 * any insert/update - genuinely live collection status without hand-
 * rolling client-side state merging. Renders nothing itself; mount it
 * once per page that should stay live.
 *
 * Requires collections to be added to the supabase_realtime publication
 * (supabase/migrations/012_admin_phase_support.sql) - without that, this
 * subscribes successfully but never receives events, per Supabase's
 * publication-based Realtime model.
 *
 * Realtime respects RLS: a subscriber only receives change events for
 * rows their own session could SELECT anyway (collections_select_staff /
 * collections_select_driver_own / collections_select_own in
 * 011_rls_policies.sql), so this adds no new exposure beyond what the
 * page's own server-side query already allows.
 */
export function RealtimeCollectionsRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("admin-collections-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
