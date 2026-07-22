import "server-only";
import type { ExtractionResult } from "@/lib/types";
import { serverEnv } from "@/lib/env";
import { extractMock } from "./mock";

// =============================================================================
// Menu extraction dispatch.
//
// The default (no MENU_EXTRACTION_PROVIDER set) is the MOCK extractor, so the
// full workflow works with zero external keys. To turn on live extraction:
//   1. Set MENU_EXTRACTION_PROVIDER = "anthropic" (or "openai")
//   2. Set MENU_EXTRACTION_API_KEY  = your provider key
// and implement the marked section in extractWithAnthropic / extractWithOpenAI.
//
// The extractor returns a normalized ExtractionResult. Prices are integer cents.
// `bottle_price_cents` is optional (used for wines with glass+bottle pricing).
// Anything uncertain should be flagged with `uncertain: true` and/or a note so
// the admin review screen can highlight it.
// =============================================================================

export interface ExtractionInput {
  fileName: string;
  mimeType: string;
  // Raw bytes of the uploaded file, base64-encoded (server-side only).
  base64: string;
}

export async function extractMenu(
  input: ExtractionInput
): Promise<ExtractionResult> {
  const { extractionProvider, extractionApiKey } = serverEnv();

  if (!extractionProvider || extractionProvider === "mock") {
    return extractMock(input.fileName);
  }
  if (!extractionApiKey) {
    // Provider requested but no key — fall back to mock and flag it.
    const result = await extractMock(input.fileName);
    result.notes.unshift(
      `MENU_EXTRACTION_PROVIDER="${extractionProvider}" is set but MENU_EXTRACTION_API_KEY is empty — used the mock extractor instead.`
    );
    return result;
  }

  if (extractionProvider === "anthropic") {
    return extractWithAnthropic(input, extractionApiKey);
  }
  if (extractionProvider === "openai") {
    return extractWithOpenAI(input, extractionApiKey);
  }

  const result = await extractMock(input.fileName);
  result.notes.unshift(`Unknown provider "${extractionProvider}" — used mock.`);
  return result;
}

// The instruction we give a vision model. Keeping it here (not inlined) makes it
// easy to tune extraction quality without touching the request plumbing.
const EXTRACTION_SYSTEM_PROMPT = `You are a menu digitizer for a bar. Extract every drink from the provided menu file into strict JSON matching this TypeScript type:

{
  "categories": [{
    "name": string,
    "items": [{
      "name": string,
      "description"?: string,
      "price_cents": number | null,        // integer cents; null if unreadable
      "bottle_price_cents"?: number | null, // for wines listed as glass/bottle
      "uncertain"?: boolean,               // true if you are unsure of any field
      "modifier_groups"?: [{
        "name": string,
        "selection_type": "single" | "multi",
        "required": boolean,
        "options": [{ "name": string, "price_delta_cents"?: number }]
      }]
    }]
  }],
  "notes": string[]                        // anything uncertain or incomplete
}

Rules: prices are integer cents ($12.50 -> 1250). If a wine shows two prices, the smaller is the glass price (price_cents) and the larger is bottle_price_cents. Never invent prices — use null and set uncertain:true. Respond with ONLY the JSON object, no prose.`;

// --- Anthropic (Claude) vision/document extraction --------------------------
// This is a real, working shape for the Claude Messages API. Verify the model
// name and response parsing against current docs before relying on it in prod.
async function extractWithAnthropic(
  input: ExtractionInput,
  apiKey: string
): Promise<ExtractionResult> {
  const isPdf = input.mimeType === "application/pdf";
  const content: unknown[] = [
    {
      type: isPdf ? "document" : "image",
      source: {
        type: "base64",
        media_type: input.mimeType,
        data: input.base64,
      },
    },
    { type: "text", text: "Digitize this drink menu into the required JSON." },
  ];

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Anthropic extraction failed: ${resp.status}`);
  }
  const json = await resp.json();
  const text: string = json?.content?.[0]?.text ?? "";
  return normalizeModelJson(text, "anthropic");
}

// --- OpenAI vision extraction ----------------------------------------------
// NOTE: OpenAI's vision endpoint accepts images directly; PDFs must be
// converted to images first (not implemented here). Verify against current docs.
async function extractWithOpenAI(
  input: ExtractionInput,
  apiKey: string
): Promise<ExtractionResult> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Digitize this drink menu into the required JSON." },
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mimeType};base64,${input.base64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI extraction failed: ${resp.status}`);
  }
  const json = await resp.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "";
  return normalizeModelJson(text, "openai");
}

// Parse and defensively normalize a model's JSON string into ExtractionResult.
function normalizeModelJson(text: string, provider: string): ExtractionResult {
  let parsed: any;
  try {
    // Strip code fences if the model added them.
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      provider,
      categories: [],
      notes: [
        "The extraction service returned a response we couldn't parse. Please add items manually or try re-uploading.",
      ],
    };
  }
  return {
    provider,
    categories: Array.isArray(parsed?.categories) ? parsed.categories : [],
    notes: Array.isArray(parsed?.notes) ? parsed.notes : [],
  };
}
