"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
  MessageSquare,
  ChevronLeft,
  Trash2,
  Send,
  Loader2,
  User,
  Bot,
  Hand,
  FileText,
  UserCheck,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type { ConversationWithLastMessage, Message } from "@/lib/types";

// The caller's own connected Instagram accounts (from /api/account).
// access_token is never sent to the browser.
type ConnectedAccount = {
  id: string;
  ig_account_id: string;
  username: string | null;
  name: string | null;
  profile_picture_url: string | null;
  status: string;
  script_id: string | null;
  businesses: { name: string; default_script_id: string | null } | null;
};

type ScriptRow = { id: string; name: string };

export default function InboxPage() {
  // Session-aware client (reads the auth cookie), not a bare anon client. Realtime
  // enforces RLS per event, and the messages/conversations policies are
  // `to authenticated` keyed on auth.uid() — an unauthenticated socket matches
  // zero rows, which is why live updates never arrived. setAuth() below hands the
  // connection the user's JWT so auth.uid() resolves.
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createBrowserClient(url, key);
  }, []);

  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConversationWithLastMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [activeAccount, setActiveAccount] = useState<string>("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Read by the Realtime handlers so the channel can subscribe ONCE and still see
  // the latest selected conversation / account-scoped refetch, instead of being
  // torn down and rebuilt on every click (which drops events during the gap).
  const selectedIdRef = useRef(selectedId);
  const fetchConversationsRef = useRef<() => void>(() => {});

  const selected = conversations.find((c) => c.id === selectedId);

  const fetchConversations = useCallback(async () => {
    const qs = activeAccount === "all" ? "" : `?account_id=${activeAccount}`;
    const res = await fetch(`/api/conversations${qs}`);
    const data = await res.json();
    setConversations(Array.isArray(data) ? data : []);
  }, [activeAccount]);

  const fetchMessages = useCallback(async (convoId: string) => {
    const res = await fetch(`/api/conversations/${convoId}/messages`);
    const data = await res.json();
    setMessages(data);
  }, []);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/account");
      const data = await res.json();
      if (!res.ok) {
        setAccounts([]);
        setAccountError(data?.error || "Couldn't load your connected accounts.");
        return;
      }
      setAccounts(Array.isArray(data) ? data : []);
      setAccountError(null);
    } catch {
      setAccounts([]);
      setAccountError("Couldn't reach the server.");
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    fetchAccount();
    fetch("/api/scripts")
      .then((r) => (r.ok ? r.json() : []))
      .then(setScripts)
      .catch(() => {});
  }, [fetchAccount]);

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keep the refs the Realtime handlers read in sync with the latest state.
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  }, [fetchConversations]);

  // Subscribe ONCE per client. Deps are [supabase] only — the handlers read
  // selectedId / fetchConversations from refs, so switching conversations or
  // accounts no longer tears down and rebuilds the socket.
  useEffect(() => {
    if (!supabase) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Hand the Realtime connection the user's JWT before subscribing, or RLS
      // (to authenticated, auth.uid()) drops every event and nothing arrives.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      channel = supabase
        .channel("realtime-instagram-messages")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "instagram_messages" },
          (payload) => {
            const newMsg = payload.new as Message;
            if (newMsg.conversation_id === selectedIdRef.current) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
            }
            fetchConversationsRef.current();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "instagram_conversations" },
          () => fetchConversationsRef.current()
        )
        .subscribe();
    })();

    // The access token expires (~1h); re-auth the socket on refresh or it goes
    // quiet with no error.
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      supabase.realtime.setAuth(session?.access_token ?? null);
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function toggleMode() {
    if (!selected) return;
    const newMode = selected.mode === "agent" ? "human" : "agent";
    const res = await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    // Only reflect the flip once the server accepted it — this used to update
    // unconditionally, so a failed PATCH left the UI claiming the agent was off
    // while it was still replying.
    if (!res.ok) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, mode: newMode } : c))
    );
  }

  async function handleSend() {
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    await fetch(`/api/conversations/${selectedId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input.trim() }),
    });
    setInput("");
    setSending(false);
    fetchMessages(selectedId);
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const id = deleteTarget.id;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setMessages([]);
    }
    setDeleteTarget(null);
    setDeleting(false);
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getInitials(name: string | null, igsid: string) {
    if (name) return name.slice(0, 2).toUpperCase();
    return igsid.slice(-2);
  }

  function Avatar({
    src,
    name,
    igsid,
    size,
  }: {
    src: string | null;
    name: string | null;
    igsid: string;
    size: number;
  }) {
    const cls = "rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold overflow-hidden";
    const style = { width: size, height: size, minWidth: size, fontSize: size * 0.3 };
    if (src) {
      return (
        <div className={cls} style={style}>
          <Image
            src={src}
            alt={name || igsid}
            width={size}
            height={size}
            className="h-full w-full rounded-full object-cover"
            unoptimized
          />
        </div>
      );
    }
    return (
      <div className={cls} style={{ ...style, background: "var(--brand-gradient)" }}>
        {getInitials(name, igsid)}
      </div>
    );
  }

  // Which script is answering this conversation — the same resolution order the
  // webhook uses (tenant.ts:68): the account's own script, else the business
  // default. Real, unlike the reference design's "85% confidence" figure.
  const selectedAccount = selected
    ? accounts.find((a) => a.id === selected.instagram_account_id)
    : undefined;
  const activeScriptId = selectedAccount
    ? (selectedAccount.script_id ?? selectedAccount.businesses?.default_script_id ?? null)
    : null;
  const activeScript = scripts.find((s) => s.id === activeScriptId);

  return (
    <div className="flex min-h-0 flex-1">
      {/* Conversation list — full screen on mobile; hidden once a chat is open */}
      <div
        className={`${
          selectedId ? "hidden md:flex" : "flex"
        } w-full flex-col border-r border-[var(--border)] md:w-[300px] md:flex-shrink-0`}
        style={{ background: "var(--panel-bg)" }}
      >
        <div className="border-b border-[var(--border)] px-4 py-3.5">
          <h1 className="text-lg font-extrabold tracking-tight text-[var(--text-1)]">Inbox</h1>
          <p className="text-[11px] text-[var(--text-4)]">
            {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Account switcher — only meaningful with more than one connected account */}
        {accounts.length > 1 && (
          <div className="px-3 pt-3">
            <select
              value={activeAccount}
              onChange={(e) => {
                setActiveAccount(e.target.value);
                setSelectedId(null);
              }}
              aria-label="Filter by account"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-2 text-xs font-semibold text-[var(--text-2)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.username ? `@${a.username}` : a.ig_account_id}
                </option>
              ))}
            </select>
          </div>
        )}

        {accountError && (
          <p className="mx-3 mt-3 flex items-start gap-1.5 rounded-lg bg-[var(--danger-soft)] px-2.5 py-2 text-[11px] font-semibold text-[var(--danger)]">
            <AlertTriangle size={12} className="mt-px flex-shrink-0" />
            {accountError}
          </p>
        )}

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="flex h-48 flex-col items-center justify-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-1)]">
                <MessageSquare size={18} className="text-[var(--text-5)]" />
              </div>
              <p className="text-xs text-[var(--text-5)]">No conversations yet</p>
            </div>
          )}
          {conversations.map((convo) => {
            const isSelected = selectedId === convo.id;
            return (
              <button
                key={convo.id}
                onClick={() => setSelectedId(convo.id)}
                className={`relative w-full px-4 py-3.5 text-left transition-colors ${
                  isSelected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-1)]"
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-0 h-full w-0.5 bg-[var(--accent)]" />
                )}
                <div className="flex items-center gap-3">
                  <Avatar src={convo.profile_pic} name={convo.name} igsid={convo.igsid} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-bold text-[var(--text-1)]">
                        {convo.name || convo.username || convo.igsid}
                      </span>
                      <span className="flex-shrink-0 text-[10px] text-[var(--text-5)]">
                        {formatTime(convo.updated_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--text-4)]">
                      {convo.last_message || (convo.username ? `@${convo.username}` : "")}
                    </p>
                    <span
                      className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                        convo.mode === "agent"
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "bg-[var(--warn-soft)] text-[var(--warn)]"
                      }`}
                    >
                      {convo.mode === "agent" ? "AI handled" : "Human active"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat panel — on mobile only rendered once a conversation is selected */}
      <div className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-1)]">
              <MessageSquare size={26} className="text-[var(--text-6)]" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-bold text-[var(--text-3)]">Select a conversation</p>
              <p className="mt-1 text-xs text-[var(--text-5)]">
                Choose from the list to start chatting
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div
              className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 md:px-5"
              style={{ background: "var(--panel-bg)" }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => setSelectedId(null)}
                  aria-label="Back to conversations"
                  className="-ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] md:hidden"
                >
                  <ChevronLeft size={19} />
                </button>
                <Avatar src={selected.profile_pic} name={selected.name} igsid={selected.igsid} size={38} />
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] font-bold text-[var(--text-1)]">
                    {selected.name || selected.username || selected.igsid}
                  </h2>
                  <p className="truncate text-[11px] text-[var(--text-4)]">
                    {selected.username ? `@${selected.username}` : selected.igsid}
                  </p>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  onClick={toggleMode}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                    selected.mode === "agent"
                      ? "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--warn)]/25 bg-[var(--warn-soft)] text-[var(--warn)]"
                  }`}
                >
                  {selected.mode === "agent" ? <Bot size={12} /> : <Hand size={12} />}
                  <span className="hidden sm:inline">
                    {selected.mode === "agent" ? "AI mode" : "Human mode"}
                  </span>
                </button>
                <button
                  onClick={() => setDeleteTarget(selected)}
                  aria-label="Delete conversation"
                  title="Delete conversation"
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-4)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] md:h-8 md:w-8"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-5">
              {messages.map((msg, i) => {
                const isUser = msg.role === "user";
                const showTime = i === messages.length - 1 || messages[i + 1]?.role !== msg.role;
                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${isUser ? "justify-start" : "justify-end"}`}
                  >
                    {isUser && (
                      <Avatar src={selected.profile_pic} name={selected.name} igsid={selected.igsid} size={24} />
                    )}
                    <div
                      className={`flex max-w-[80%] flex-col md:max-w-[65%] ${
                        isUser ? "items-start" : "items-end"
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                          isUser
                            ? "rounded-tl-sm border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)]"
                            : "rounded-tr-sm text-white"
                        }`}
                        style={!isUser ? { background: "var(--accent)" } : undefined}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {showTime && (
                        <p className="mt-1.5 px-1 text-[10px] text-[var(--text-5)]">
                          {formatTime(msg.created_at)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div
              className="border-t border-[var(--border)] px-4 py-3 md:px-5"
              style={{ background: "var(--panel-bg)" }}
            >
              <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 transition-colors focus-within:border-[var(--accent)]">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder={`Reply to ${selected.name?.split(" ")[0] || "customer"}…`}
                  className="flex-1 bg-transparent text-base text-[var(--text-1)] placeholder:text-[var(--text-6)] focus:outline-none md:text-[13px]"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-30 md:h-8 md:w-8"
                  aria-label="Send"
                >
                  {sending ? (
                    <Loader2 size={14} className="animate-spin text-white" />
                  ) : (
                    <Send size={14} className="text-white" />
                  )}
                </button>
              </div>
              {selected.mode === "agent" && (
                <p className="mt-1.5 text-[10px] text-[var(--text-5)]">
                  The agent is answering this conversation. Sending a reply yourself
                  doesn&apos;t stop it — switch to Human mode for that.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Context panel — every field here is real. The reference design's
          "data captured" (product interest, budget, extracted email) and its
          confidence score have no backing data and no extraction pipeline, so
          they are absent rather than mocked. */}
      {selected && (
        <aside
          className="hidden w-[280px] flex-shrink-0 flex-col overflow-y-auto border-l border-[var(--border)] xl:flex"
          style={{ background: "var(--panel-bg)" }}
        >
          <div className="flex flex-col items-center border-b border-[var(--border)] px-5 py-6 text-center">
            <Avatar src={selected.profile_pic} name={selected.name} igsid={selected.igsid} size={72} />
            <h3 className="mt-3 text-[15px] font-bold text-[var(--text-1)]">
              {selected.name || selected.username || selected.igsid}
            </h3>
            {selected.username && (
              <p className="text-[11px] text-[var(--text-4)]">@{selected.username}</p>
            )}
            <p className="mt-1 text-[11px] text-[var(--text-5)]">
              In touch since {formatDate(selected.created_at)}
            </p>
            <button
              onClick={toggleMode}
              className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-bold transition-colors ${
                selected.mode === "agent"
                  ? "border-[var(--warn)]/30 text-[var(--warn)] hover:bg-[var(--warn-soft)]"
                  : "border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent-soft)]"
              }`}
            >
              {selected.mode === "agent" ? <Hand size={12} /> : <Bot size={12} />}
              {selected.mode === "agent" ? "Take over" : "Give back to AI"}
            </button>
          </div>

          {/* AI context */}
          <div className="border-b border-[var(--border)] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-5)]">
              AI context
            </p>
            <div className="mt-2.5 rounded-xl bg-[var(--accent-soft)] p-3">
              <div className="flex items-start gap-2">
                <FileText size={13} className="mt-0.5 flex-shrink-0 text-[var(--accent)]" />
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-[var(--accent)]">
                    {activeScript ? activeScript.name : "No script resolved"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[var(--text-4)]">
                    {selectedAccount?.script_id
                      ? "Account's own script"
                      : activeScript
                        ? `${selectedAccount?.businesses?.name ?? "Business"} default`
                        : "This conversation has no script attached"}
                  </p>
                </div>
              </div>
              {activeScript && (
                <Link
                  href={`/scripts?script=${activeScript.id}`}
                  className="mt-2.5 block text-[11px] font-bold text-[var(--accent)] hover:underline"
                >
                  Edit script →
                </Link>
              )}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--text-5)]">
              <Clock size={10} />
              Last activity {formatTime(selected.updated_at)} · {messages.length} message
              {messages.length === 1 ? "" : "s"}
            </p>
          </div>

          {/* Profile — straight from the Instagram Graph API, stored per conversation */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-5)]">
              Profile
            </p>
            <div className="mt-2.5 space-y-2.5">
              {selected.follower_count !== null && (
                <Row
                  icon={<User size={12} />}
                  label="Followers"
                  value={selected.follower_count.toLocaleString()}
                />
              )}
              {selected.is_user_follow_business !== null && (
                <Row
                  icon={<UserCheck size={12} />}
                  label="Follows you"
                  value={selected.is_user_follow_business ? "Yes" : "No"}
                />
              )}
              {selected.is_business_follow_user !== null && (
                <Row
                  icon={<UserCheck size={12} />}
                  label="You follow"
                  value={selected.is_business_follow_user ? "Yes" : "No"}
                />
              )}
              {selectedAccount && (
                <Row
                  icon={<MessageSquare size={12} />}
                  label="Received on"
                  value={selectedAccount.username ? `@${selectedAccount.username}` : selectedAccount.ig_account_id}
                />
              )}
            </div>
          </div>
        </aside>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-[340px] rounded-2xl border border-[var(--border-strong)] bg-[var(--modal-bg)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--danger-soft)]">
                <Trash2 size={15} className="text-[var(--danger)]" />
              </div>
              <h3 className="text-[14px] font-bold text-[var(--text-1)]">Delete conversation?</h3>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--text-4)]">
              This permanently removes{" "}
              <span className="font-bold text-[var(--text-2)]">
                {deleteTarget.name || deleteTarget.username || deleteTarget.igsid}
              </span>{" "}
              and all its messages. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg bg-[var(--danger)] px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {deleting && <Loader2 size={12} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-4)]">
        {icon}
        {label}
      </span>
      <span className="truncate text-[11px] font-bold text-[var(--text-2)]">{value}</span>
    </div>
  );
}
