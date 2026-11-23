"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Lock,
  MessageSquarePlus,
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
  const [streamingText, setStreamingText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setMessages(data.messages);
    setActiveConvId(data.activeConversationId);
  }, [data.messages, data.activeConversationId]);

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
    if (!trimmed || busy) return;
    setBusy(true);
    setPrompt("");
    setStreamingText("");

    const optimisticUser: AiMessageItem = {
      id: `local-${Date.now()}`,
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

    // Stream preview from /api/ai/stream while persisting via server action
    try {
      const streamRes = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          conversationId: activeConvId,
          prompt: trimmed,
        }),
      });

      if (streamRes.ok && streamRes.body) {
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStreamingText(acc);
        }
      }
    } catch {
      // Non-fatal: server action below still persists and returns authoritative response
    }

    const res = await sendAiPromptAction({
      familyId,
      conversationId: activeConvId,
      prompt: trimmed,
    });

    setStreamingText("");
    setBusy(false);

    if (!res.ok) {
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
      {/* Conversation History Sidebar */}
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--accent-primary)]" />
            <h1 className="font-heading text-[16px] font-bold">Famora AI</h1>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setActiveConvId(null);
              setMessages([]);
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
                onClick={() =>
                  router.push(`/f/${familyId}/ai?c=${encodeURIComponent(c.id)}`)
                }
                className={cn(
                  "w-full truncate rounded-xl px-2.5 py-2 text-left text-[13px] cursor-pointer",
                  c.id === activeConvId
                    ? "bg-[var(--accent-primary)]/12 font-semibold text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                )}
              >
                {c.title}
              </button>
            ))
          )}
        </div>
      </Card>

      {/* Main Assistant Thread */}
      <Card className="flex min-h-[540px] flex-col justify-between overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && !streamingText ? (
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
                    onClick={() => void submitPrompt(sample)}
                    className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
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
                    "flex flex-col gap-1.5",
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
                      "max-w-[85%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)]"
                    )}
                  >
                    {m.content}
                  </div>

                  {/* Confirmation Card for Consequential Actions */}
                  {m.proposedAction && m.actionStatus === "pending_confirmation" && (
                    <div className="mt-1 w-full max-w-[85%] rounded-2xl border border-[var(--accent-primary)]/40 bg-[var(--tint-sand)]/50 p-3.5 text-[13px]">
                      <p className="font-semibold">
                        {t("ai.confirmRequired", { summary: m.proposedAction.summary })}
                      </p>
                      <div className="mt-2.5 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={async () => {
                            const res = await confirmAiProposedAction({
                              familyId,
                              messageId: m.id,
                            });
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
                          onClick={async () => {
                            await cancelAiProposedAction({
                              familyId,
                              messageId: m.id,
                            });
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

              {streamingText && (
                <div className="flex flex-col items-start gap-1.5">
                  <Badge variant="neutral">{t("ai.streamingBadge")}</Badge>
                  <div className="max-w-[85%] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap">
                    {streamingText}
                  </div>
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
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("ai.inputPlaceholder")}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !prompt.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
