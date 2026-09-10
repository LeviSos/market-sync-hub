import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { loose } from "@/lib/supabase-loose";

const supabase = loose(typedSupabase);
import { listChat, sendChat, type ChatMessage } from "@/lib/chat.functions";
import { useMe } from "@/hooks/useAuth";
import { pushLocalMessage, readFlags, usePlay } from "@/lib/local-play";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { signedIn, localMode, data: me } = useMe();
  const play = usePlay();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["chat"],
    queryFn: () => listChat(),
    enabled: open && !localMode,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!open || localMode) return;
    const channel = supabase
      .channel("public-chat")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["chat"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, qc, localMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [data, play.chat, open]);

  const profile = me?.profile as
    { id?: string; username?: string | null; avatar_url?: string | null } | undefined;

  async function submit() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      if (localMode) {
        const id = String(profile?.id ?? "local");
        const flags = readFlags(play, id);
        if (flags.is_banned) throw new Error("Your account is banned");
        if (flags.is_muted) throw new Error("You are muted in chat");
        pushLocalMessage({
          user_id: id,
          username: profile?.username ?? "Player",
          avatar_url: profile?.avatar_url ?? null,
          body,
        });
      } else {
        await sendChat({ data: { body } });
        qc.invalidateQueries({ queryKey: ["chat"] });
      }
      setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send that message");
    } finally {
      setBusy(false);
    }
  }

  const messages = (
    localMode ? play.chat.filter((m) => !m.is_deleted) : (data ?? [])
  ) as ChatMessage[];

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="panel flex h-[420px] w-[320px] flex-col overflow-hidden border bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="font-display text-sm font-bold">Live chat</p>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground">No messages yet. Say hi.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex items-start gap-2">
                {m.avatar_url ? (
                  <img
                    src={m.avatar_url}
                    alt=""
                    className="mt-0.5 size-6 rounded border object-cover"
                  />
                ) : (
                  <span className="mt-0.5 grid size-6 place-items-center rounded border bg-surface text-[10px]">
                    {m.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-primary">{m.username}</p>
                  <p className="break-words text-xs text-foreground/90">{m.body}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="border-t p-2">
            {signedIn ? (
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                  }}
                  maxLength={300}
                  placeholder="Message…"
                  className="min-w-0 flex-1 rounded-md border bg-background/60 px-2 py-1.5 text-xs outline-none focus:border-primary"
                />
                <button
                  onClick={() => void submit()}
                  disabled={busy || !text.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            ) : (
              <p className="px-1 py-1 text-xs text-muted-foreground">Sign in to join the chat.</p>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-primary px-4 py-2 font-display text-sm font-bold text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
      >
        {open ? "Hide chat" : "Chat"}
      </button>
    </div>
  );
}
