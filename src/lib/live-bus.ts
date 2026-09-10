/**
 * Cross-player bus for the live drop feed.
 *
 * A drop must only reach other players once the opener's roulette animation
 * has finished, so the opener announces it explicitly instead of letting the
 * database insert drive the feed.
 */
import { supabase } from "@/integrations/supabase/client";

const TOPIC = "live-drops-bus";
const listeners = new Set<() => void>();

let channel: ReturnType<typeof supabase.channel> | null = null;

function bus() {
  if (channel) return channel;
  channel = supabase.channel(TOPIC, { config: { broadcast: { self: false } } });
  channel.on("broadcast", { event: "drop" }, () => {
    listeners.forEach((l) => l());
  });
  channel.subscribe();
  return channel;
}

/** Called by the opener after the reel has stopped and the result is visible. */
export function announceLiveDrop() {
  try {
    void bus().send({ type: "broadcast", event: "drop", payload: { at: Date.now() } });
  } catch {
    /* feed will catch up on its next refetch */
  }
}

export function onLiveDropAnnounce(cb: () => void) {
  listeners.add(cb);
  bus();
  return () => {
    listeners.delete(cb);
  };
}
