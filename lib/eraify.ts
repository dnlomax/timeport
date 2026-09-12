// Server-only: turn a present-day street photo into a period photo of the same
// street with Gemini's image model.
//
// Two backends, same request body and same response shape — only the URL and
// the credential differ:
//   * AI Studio (GEMINI_API_KEY) — image models are paid-tier only there.
//   * Vertex AI express mode (VERTEX_API_KEY) — billed to the Cloud project,
//     so trial credit applies. Set VERTEX_LOCATION for a regional endpoint.

const AI_STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-image";

function endpoint(model: string): { url: string; apiKey: string } {
  const vertexKey = process.env.VERTEX_API_KEY;
  if (vertexKey) {
    const location = process.env.VERTEX_LOCATION;
    const host = location
      ? `https://${location}-aiplatform.googleapis.com`
      : "https://aiplatform.googleapis.com";
    return {
      url: `${host}/v1/publishers/google/models/${model}:generateContent`,
      apiKey: vertexKey,
    };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Neither VERTEX_API_KEY nor GEMINI_API_KEY is set on the server",
    );
  }
  return { url: `${AI_STUDIO_URL}/${model}:generateContent`, apiKey };
}

interface InlineData {
  mimeType: string;
  data: string;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: InlineData }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export interface EraifyResult {
  /** `data:image/png;base64,...`, ready to hand to <img> or fetch(). */
  dataUrl: string;
  mimeType: string;
  base64: string;
  /** Any prose the model returned alongside the image. */
  note?: string;
}

export async function eraifyImage(
  source: { bytes: Buffer; contentType: string },
  instruction: string,
): Promise<EraifyResult> {
  const model = process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;
  const { url, apiKey } = endpoint(model);

  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            // Image first: the edit models follow the instruction more
            // reliably when the source precedes the text.
            {
              inlineData: {
                mimeType: source.contentType,
                data: source.bytes.toString("base64"),
              },
            },
            { text: instruction },
          ],
        },
      ],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });

  const body = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(
      body.error?.message ?? `Image model returned ${res.status}`,
    );
  }
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((p) => p.inlineData)?.inlineData;
  if (!image) {
    const blocked = body.promptFeedback?.blockReason;
    throw new Error(
      blocked
        ? `Gemini refused the edit (${blocked})`
        : "Gemini returned no image",
    );
  }
  return {
    dataUrl: `data:${image.mimeType};base64,${image.data}`,
    mimeType: image.mimeType,
    base64: image.data,
    note: parts.find((p) => p.text)?.text,
  };
}
