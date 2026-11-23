"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Lock,
  MessageSquarePlus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import {
  cancelAiProposedAction,
  confirmAiProposedAction,
  sendAiPromptAction,
} from "../actions";
import type { AiAssistantPageData, AiMessageItem } from "../types";
import { AiMarkdown } from "./ai-markdown";

export function FamilyAiView({
  familyId,
  data,
}: {
  familyId: string;
  data: AiAssistantPageData;
}) {
  const router = useRouter();
  const { t, te } = useLocale();
  const suggestedPrompts = React.useMemo(
    () => [
      t("ai.prompt1"),
      t("ai.prompt2"),
      t("ai.prompt3"),
      t("ai.prompt4"),
      t("ai.prompt5"),
    ],
    [t]
  );
  const [prompt, setPrompt] = React.useState("");
  const [messages, setMessages] = React.useState<AiMessageItem[]>(data.messages);
  const [activeConvId, setActiveConvId] = React.useState<string | null>(
    data.activeConversationId
  );
  const [busy, setBusy] = React.useState(false);
  const [actionBusyId, setActionBusyId] = React.useState<string | null>(null);
  const [failedPrompt, setFailedPrompt] = React.useState<string | null>(null);
  const threadRef = React.useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = React.useRef(true);
  const quotaExhausted = data.rateLimitRemaining <= 0;

  React.useEffect(() => {
    setMessages(data.messages);
    setActiveConvId(data.activeConversationId);
  }, [data.messages, data.activeConversationId]);

  React.useEffect(() => {
    const el = threadRef.current;
    if (!el || !isNearBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  if (!data.canUse) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title={t("ai.restrictedTitle")}
          description={t("ai.restrictedDesc")}
        />
      </Card>
    );
  }

  const submitPrompt = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || busy || quotaExhausted) return;
    setBusy(true);
    setFailedPrompt(null);
    setPrompt("");
    isNearBottomRef.current = true;

    const optimisticId = `local-${Date.now()}`;
    const optimisticUser: AiMessageItem = {
      id: optimisticId,
      conversationId: activeConvId ?? "new",
      role: "user",
      content: trimmed,
      toolCalls: [],
      proposedAction: null,
      actionStatus: "none",
      providerName: "user",
      modelName: "user",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    const res = await sendAiPromptAction({
      familyId,
      conversationId: activeConvId,
      prompt: trimmed,
    });

    setBusy(false);

    if (!res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setFailedPrompt(trimmed);
      setPrompt(trimmed);
      toast.error(te(res.error));
      return;
    }

    if (res.conversationId) {
      setActiveConvId(res.conversationId);
    }
    router.refresh();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
      {/* Conversation History Sidebar (below thread on mobile so composer is above the fold) */}
      <Card className="order-2 lg:order-1 flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--accent-primary)]" />
            <h1 className="font-heading text-[16px] font-bold">Famora AI</h1>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setActiveConvId(null);
              setMessages([]);
              setFailedPrompt(null);
              router.push(`/f/${familyId}/ai`);
            }}
          >
            <MessageSquarePlus className="h-4 w-4" />
            {t("ai.newBtn")}
          </Button>
        </div>

        <div className="rounded-xl bg-[var(--tint-sage)]/50 p-3 text-[12px] text-[var(--text-secondary)]">
          <p className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            {t("ai.scopedTitle")}
          </p>
          <p className="mt-1">
            {t("ai.scopedDesc")}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {t("ai.quotaRemaining", { count: data.rateLimitRemaining })}
          </p>
        </div>

        <div className="space-y-1">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {t("ai.historyTitle")}
          </p>
          {data.conversations.length === 0 ? (
            <p className="px-1 text-[12.5px] text-[var(--text-muted)]">
              {t("ai.historyEmpty")}
            </p>
          ) : (
            data.conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() =>
                  router.push(`/f/${familyId}/ai?c=${encodeURIComponent(c.id)}`)
                }
                className={cn(
                  "flex min-h-11 sm:min-h-0 w-full items-center truncate rounded-xl px-3 py-2 text-left text-[13px] cursor-pointer disabled:opacity-50",
                  c.id === activeConvId
                    ? "bg-[var(--accent-primary)]/12 font-semibold text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                )}
              >
                <span className="truncate">{c.title}</span>
              </button>
            ))
          )}
        </div>
      </Card>

      {/* Main Assistant Thread */}
      <Card className="order-1 lg:order-2 flex h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-8rem)] min-h-[420px] flex-col justify-between overflow-hidden">
        <div
          ref={threadRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            isNearBottomRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          }}
          className="flex-1 space-y-4 overflow-y-auto overscroll-y-contain p-4 sm:p-5"
        >
          {messages.length === 0 && !busy ? (
            <div className="space-y-6 py-8">
              <EmptyState
                icon={<Sparkles className="h-6 w-6" />}
                title={t("ai.emptyTitle")}
                description={t("ai.emptyDesc")}
              />
              <div className="flex flex-wrap justify-center gap-2">
                {suggestedPrompts.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    disabled={quotaExhausted}
                    onClick={() => void submitPrompt(sample)}
                    className="min-h-11 sm:min-h-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer disabled:opacity-50"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex flex-col gap-1.5 min-w-0",
                    m.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  {m.role === "assistant" && (
                    <Badge variant="neutral">
                      {t("ai.generatedBadge", { provider: m.providerName })}
                    </Badge>
                  )}
                  <div
                    className={cn(
                      "max-w-[90%] sm:max-w-[85%] min-w-0 rounded-2xl px-4 py-3 text-[14px] leading-relaxed break-words [overflow-wrap:anywhere]",
                      m.role === "user"
                        ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] whitespace-pre-wrap"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)]"
                    )}
                  >
                    {m.role === "assistant" ? (
                      <AiMarkdown content={m.content} />
                    ) : (
                      m.content
                    )}
                  </div>

                  {/* Confirmation Card for Consequential Actions */}
                  {m.proposedAction && m.actionStatus === "pending_confirmation" && (
                    <div className="mt-1 w-full max-w-[90%] sm:max-w-[85%] rounded-2xl border border-[var(--accent-primary)]/40 bg-[var(--tint-sand)]/50 p-3.5 text-[13px]">
                      <p className="font-semibold">
                        {t("ai.confirmRequired", { summary: m.proposedAction.summary })}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={actionBusyId === m.id}
                          isLoading={actionBusyId === m.id}
                          onClick={async () => {
                            setActionBusyId(m.id);
                            const res = await confirmAiProposedAction({
                              familyId,
                              messageId: m.id,
                            });
                            setActionBusyId(null);
                            if (!res.ok) {
                              toast.error(te(res.error));
                              return;
                            }
                            toast.success(t("ai.actionConfirmedToast"));
                            router.refresh();
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {t("ai.confirmActionBtn")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={actionBusyId === m.id}
                          onClick={async () => {
                            setActionBusyId(m.id);
                            const res = await cancelAiProposedAction({
                              familyId,
                              messageId: m.id,
                            });
                            setActionBusyId(null);
                            if (!res.ok) {
                              toast.error(te(res.error));
                              return;
                            }
                            router.refresh();
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                  {m.actionStatus === "confirmed" && (
                    <span className="text-[11.5px] font-medium text-[var(--accent-primary)]">
                      {t("ai.actionConfirmedLabel")}
                    </span>
                  )}
                  {m.actionStatus === "cancelled" && (
                    <span className="text-[11.5px] text-[var(--text-muted)]">
                      {t("ai.actionCancelledLabel")}
                    </span>
                  )}
                </div>
              ))}

              {busy && (
                <div className="flex flex-col items-start gap-1.5">
                  <Badge variant="neutral">{t("ai.streamingBadge")}</Badge>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-3 text-[13.5px] text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="h-4 w-4 animate-pulse text-[var(--accent-primary)]" />
                      {t("ai.streamingBadge")}...
                    </span>
                  </div>
                </div>
              )}

              {failedPrompt && !busy && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void submitPrompt(failedPrompt)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("chat.failedRetry")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitPrompt(prompt);
          }}
          className="flex items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"
        >
          <div className="min-w-0 flex-1">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("ai.inputPlaceholder")}
              disabled={busy || quotaExhausted}
            />
          </div>
          <Button
            type="submit"
            isLoading={busy}
            disabled={busy || quotaExhausted || !prompt.trim()}
            aria-label={t("chat.sendAria")}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
