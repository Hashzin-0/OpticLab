import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EditPlanSchema, DEFAULT_ADJUSTMENT } from "@/lib/editing/schema";

export const runtime = "nodejs";
export const maxDuration = 30;

const RequestSchema = z.object({
  image: z.string().min(1),
  instruction: z.string().trim().min(1).max(500),
  previousPlan: EditPlanSchema.nullable().optional(),
}).strict();

const MAX_DATA_URL_LENGTH = 8_500_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const responseSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    global: {
      type: "OBJECT",
      properties: {
        exposureEv: { type: "NUMBER" }, contrast: { type: "NUMBER" }, saturation: { type: "NUMBER" },
        warmth: { type: "NUMBER" }, highlights: { type: "NUMBER" }, shadows: { type: "NUMBER" }, blur: { type: "NUMBER" },
      },
      required: ["exposureEv", "contrast", "saturation", "warmth", "highlights", "shadows", "blur"],
    },
    regions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          bounds: {
            type: "OBJECT",
            properties: { x: { type: "NUMBER" }, y: { type: "NUMBER" }, width: { type: "NUMBER" }, height: { type: "NUMBER" } },
            required: ["x", "y", "width", "height"],
          },
          feather: { type: "NUMBER" },
          adjustments: {
            type: "OBJECT",
            properties: {
              exposureEv: { type: "NUMBER" }, contrast: { type: "NUMBER" }, saturation: { type: "NUMBER" },
              warmth: { type: "NUMBER" }, highlights: { type: "NUMBER" }, shadows: { type: "NUMBER" }, blur: { type: "NUMBER" },
            },
            required: ["exposureEv", "contrast", "saturation", "warmth", "highlights", "shadows", "blur"],
          },
        },
        required: ["label", "bounds", "feather", "adjustments"],
      },
    },
  },
  required: ["summary", "global", "regions"],
};

function parseDataUrl(value: string): { mimeType: string; data: string } | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || !ALLOWED_MIME.has(match[1])) return null;
  return { mimeType: match[1], data: match[2] };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "A análise está indisponível: configure GEMINI_API_KEY no servidor." }, { status: 503 });

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_DATA_URL_LENGTH + 20_000) return NextResponse.json({ error: "Imagem muito grande para o limite atual." }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Dados de edição inválidos." }, { status: 400 });
  if (parsed.data.image.length > MAX_DATA_URL_LENGTH) return NextResponse.json({ error: "Imagem excede o limite de processamento." }, { status: 413 });

  const image = parseDataUrl(parsed.data.image);
  if (!image) return NextResponse.json({ error: "Formato de imagem inválido." }, { status: 415 });

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const instruction = parsed.data.instruction;
  const previousPlan = parsed.data.previousPlan;

  const systemPrompt = `Você é o analista fotográfico do OpticLab. Analise a imagem e produza SOMENTE um plano de parâmetros matemáticos para um pipeline determinístico. Você não gera imagens e não deve pedir que outro modelo redesenhe a fotografia.

Objetivo: melhorar a qualidade fotográfica de forma natural, preservando identidade, composição, objetos e conteúdo. Não invente dados EXIF, abertura, obturador, ISO ou lente. Não tente recuperar informação fisicamente ausente em áreas totalmente estouradas ou pretas.

Retorne correções globais e até 8 regiões. Cada região é uma máscara INTERNA aproximada por bounding box normalizada (x,y,width,height entre 0 e 1) com feather. Escolha caixas pequenas e conservadoras para áreas semanticamente distintas, como pessoa/rosto, céu, fundo, vegetação ou primeiro plano. Não crie regiões sem benefício claro. Os limites de caixa não são segmentação pixel-perfect; evite alegar precisão que não tem.

Parâmetros permitidos:
exposureEv [-2.5,2.5], contrast [0.65,1.5], saturation [0.5,1.5], warmth [-0.25,0.25], highlights [-0.6,0.6], shadows [-0.6,0.6], blur [0,8].
Neutral values: exposureEv 0, contrast 1, saturation 1, warmth 0, highlights 0, shadows 0, blur 0.
Use mudanças pequenas. Não use blur para esconder defeitos, exceto se o usuário solicitar.

Pedido do usuário: ${instruction}
Plano anterior (se houver): ${previousPlan ? JSON.stringify(previousPlan) : "nenhum"}.

A resposta deve obedecer exatamente ao schema. O resumo deve ser curto, em português.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }, { inline_data: { mime_type: image.mimeType, data: image.data } }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.2 },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return NextResponse.json({ error: "Limite temporário de análise atingido. Tente novamente mais tarde." }, { status: 429 });
      if (status === 401 || status === 403) return NextResponse.json({ error: "A credencial Gemini não foi aceita pelo provedor." }, { status: 502 });
      return NextResponse.json({ error: "O serviço de análise não conseguiu processar a imagem." }, { status: 502 });
    }

    const result: unknown = await response.json();
    const text = (result as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      .candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
    if (!text) return NextResponse.json({ error: "O Gemini retornou uma resposta vazia." }, { status: 502 });

    let modelOutput: unknown;
    try { modelOutput = JSON.parse(text); } catch { return NextResponse.json({ error: "A resposta do Gemini não contém um plano JSON válido." }, { status: 502 }); }

    const plan = EditPlanSchema.safeParse(modelOutput);
    if (!plan.success) {
      // Safe fallback: return a neutral, valid plan rather than execute untrusted parameters.
      return NextResponse.json({ error: "O plano sugerido não passou pela validação de segurança." }, { status: 502 });
    }

    return NextResponse.json({ plan: plan.data });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "A análise excedeu o tempo limite. Tente novamente." }, { status: 504 });
    }
    return NextResponse.json({ error: "Falha de comunicação com o serviço de análise." }, { status: 502 });
  }
}