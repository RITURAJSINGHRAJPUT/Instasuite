import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

type ChatMessage = { role: "user" | "assistant"; content: string };

export type AIOptions = {
  /** The tenant's script, resolved by the caller from account -> business. */
  systemPrompt: string;
  model?: string;
};

export type AIResult = {
  text: string;
  /** Which provider actually answered — callers meter usage off this. */
  provider: "claude" | "openrouter" | "none";
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// The Anthropic and OpenRouter keys are PLATFORM credentials (we pay, then bill the
// tenant), not per-tenant — so these clients hold no tenant state and are safe to
// share. What must never be module-scope is the system prompt: that is per-tenant
// and is now always passed in.
const anthropic = new Anthropic();
const DEFAULT_CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const FALLBACK_MODELS = [
  process.env.AI_MODEL,
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-4-31b-it:free",
  "meta-llama/llama-3.2-3b-instruct:free",
].filter(Boolean) as string[];

// Conversation-hygiene rules appended to EVERY tenant's system prompt, for both the
// Claude path and the OpenRouter fallback (they share the `system` string below). The
// weaker fallback models otherwise treat each turn fresh — re-asking for details the
// guest already gave and glitching stray foreign tokens into replies. These rules pull
// any model back toward tracking state and staying coherent.
const REPLY_GUARD = [
  "Reply with only the message to send to the guest — no preamble, no quotes, no explanation of your reasoning.",
  "Track what the guest has already told you. Never ask again for a detail they have already given (name, date, time, party size, contact, outlet, or order items). Acknowledge what you have and ask only for what is still missing.",
  "Once you have everything needed to place a reservation or takeaway order, confirm it back to the guest and proceed to the hand-off — do not repeat the request for details.",
  "Write only in clear, natural English (or the language the guest is writing in). Never insert stray words or characters from an unrelated language mid-message.",
].join("\n");

export async function getAIResponse(
  messages: ChatMessage[],
  options: AIOptions
): Promise<AIResult> {
  const system = `${options.systemPrompt}\n\n${REPLY_GUARD}`;
  const claudeModel = options.model || DEFAULT_CLAUDE_MODEL;

  // --- Primary: Claude ---
  // The API rejects a history that opens with an assistant turn, which is reachable
  // when a human starts the thread from the dashboard's send route.
  const history = [...messages];
  while (history.length && history[0].role !== "user") history.shift();

  if (history.length) {
    try {
      const res = await anthropic.messages.create({
        model: claudeModel,
        max_tokens: 1024,
        system,
        messages: history,
      });

      if (res.stop_reason === "refusal") {
        return {
          text: "Our team will be happy to help! Let me connect you.",
          provider: "claude",
          model: claudeModel,
          inputTokens: res.usage?.input_tokens ?? null,
          outputTokens: res.usage?.output_tokens ?? null,
        };
      }

      const text = res.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      if (text) {
        return {
          text,
          provider: "claude",
          model: claudeModel,
          inputTokens: res.usage?.input_tokens ?? null,
          outputTokens: res.usage?.output_tokens ?? null,
        };
      }
      console.warn("Claude returned no text, falling back to OpenRouter");
    } catch (err) {
      console.warn(
        "Claude call failed, falling back to OpenRouter:",
        (err as Error).message
      );
    }
  }

  // --- Fallback: OpenRouter free models ---
  const payload = [{ role: "system" as const, content: system }, ...messages];

  for (const model of FALLBACK_MODELS) {
    try {
      const completion = await openrouter.chat.completions.create({ model, messages: payload });
      const content = completion.choices[0]?.message?.content;
      if (content) {
        return {
          text: content,
          provider: "openrouter",
          model,
          inputTokens: completion.usage?.prompt_tokens ?? null,
          outputTokens: completion.usage?.completion_tokens ?? null,
        };
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      // Only fall through on rate-limit (429) or not-found (404), throw everything else
      if (status !== 429 && status !== 404) throw err;
      console.warn(`Model ${model} failed with ${status}, trying next...`);
    }
  }

  return {
    text: "Sorry, I'm temporarily unavailable. Please try again shortly.",
    provider: "none",
    model: null,
    inputTokens: null,
    outputTokens: null,
  };
}

// Reshape arbitrary business notes (uploaded doc) into the app's DM-agent script
// format. Claude-only and NOT via getAIResponse: that path caps output at 1024
// tokens (a full script is larger) and its OpenRouter fallback would produce a
// poor system prompt. Fills the editor for human review — never auto-saved.
const REFORMAT_SYSTEM = (businessName: string) => `You convert a business's raw notes into a system-prompt "script" that governs an AI assistant answering that business's Instagram DMs. The business is "${businessName}".

Reshape the user's content into a clear Markdown script with these sections:
- **Persona** — who the assistant is (the voice of ${businessName}) and its goal.
- **What it can help with** — the topics it should handle.
- **Facts it may state** — menu, prices, hours, locations, booking/links, policies. Use ONLY facts present in the source. Never invent a price, item, hour, address, or link. If the source lacks something, omit it (or note the assistant should offer to connect a human).
- **Rules** — always include: never volunteer prices unless the customer explicitly asks (then answer); never make up facts; hand off to a human when unsure or asked something out of scope; stay in character.
- **Tone** — concise, warm, on-brand.

Preserve every real detail from the source; reorganize, don't discard. Output ONLY the script in Markdown — no preamble, no commentary, no code fences around the whole thing.`;

export async function reformatToScript(sourceText: string, businessName: string): Promise<string> {
  const res = await anthropic.messages.create({
    model: DEFAULT_CLAUDE_MODEL,
    max_tokens: 8192,
    system: REFORMAT_SYSTEM(businessName),
    messages: [{ role: "user", content: sourceText }],
  });

  if (res.stop_reason === "refusal") {
    throw new Error("The model declined to reformat this file.");
  }
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("The model returned an empty script.");
  return text;
}
