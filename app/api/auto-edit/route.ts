import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EditPlanSchema } from "@/lib/editing/schema";
import { CINEMATIC_CATALOG_VERSION, retrieveCinematicLooks } from "@/lib/cinematic/catalog";

export const runtime = "nodejs";
export const maxDuration = 30;

const RequestSchema = z.object({
  image: z.string().min(1),
  instruction: z.string().trim().min(1).max(500),
  previousPlan: EditPlanSchema.nullable().optional(),
}).strict();

const MAX_DATA_URL_LENGTH = 4_300_000;
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
          box_2d: { type: "ARRAY", items: { type: "INTEGER" }, minItems: 4, maxItems: 4 },
          mask: {
            type: "ARRAY",
            items: { type: "ARRAY", items: { type: "INTEGER" }, minItems: 2, maxItems: 2 },
            minItems: 3,
            maxItems: 128,
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
        required: ["label", "box_2d", "mask", "feather", "adjustments"],
      },
    },
  },
  required: ["summary", "global", "regions"],
};
async function readLimitedBody(request: NextRequest): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DATA_URL_LENGTH + 20_000) {
      await reader.cancel();
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

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
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_DATA_URL_LENGTH + 20_000) {
      return NextResponse.json({ error: "Imagem muito grande para o limite atual." }, { status: 413 });
    }
    raw = JSON.parse(await readLimitedBody(request));
  } catch (error) {
    if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
      return NextResponse.json({ error: "Imagem muito grande para o limite atual." }, { status: 413 });
    }
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Dados de edição inválidos." }, { status: 400 });
  if (parsed.data.image.length > MAX_DATA_URL_LENGTH) return NextResponse.json({ error: "Imagem excede o limite de processamento." }, { status: 413 });

  const image = parseDataUrl(parsed.data.image);
  if (!image) return NextResponse.json({ error: "Formato de imagem inválido." }, { status: 415 });

  const model = process.env.GEMINI_MODEL || "gemini-4-hydrogen";
  const instruction = parsed.data.instruction;
  const previousPlan = parsed.data.previousPlan;
  const retrievedLooks = retrieveCinematicLooks(`${instruction} ${previousPlan?.summary ?? ""}`, 6);
  const cinematicReferences = retrievedLooks.length > 0
    ? retrievedLooks
    : retrieveCinematicLooks("natural editorial low-key noir warm golden hour soft documentary", 6);

  const systemPrompt = `Você é o analista fotográfico do OpticLab. Analise a imagem e produza SOMENTE um plano de parâmetros matemáticos para um pipeline determinístico. Você não gera imagens e não deve pedir que outro modelo redesenhe a fotografia.

Objetivo: melhorar a qualidade fotográfica de forma natural, preservando identidade, composição, objetos e conteúdo. Não invente dados EXIF, abertura, obturador, ISO ou lente. Não tente recuperar informação fisicamente ausente em áreas totalmente estouradas ou pretas.

Retorne correções globais e até 8 regiões com segmentação automática. Para cada região, gere box_2d como [ymin,xmin,ymax,xmax] normalizado de 0 a 1000 e mask como um polígono de pontos [x,y] normalizados de 0 a 1000, seguindo a capacidade de segmentation do Gemini. O polígono deve contornar o objeto/região real, não apenas desenhar um retângulo. Use feather entre 0.005 e 0.12. Escolha regiões úteis como pessoa/rosto, céu, fundo, vegetação ou primeiro plano. Não crie regiões sem benefício claro. Não invente pixels nem áreas fora da imagem.

Parâmetros permitidos:
exposureEv [-2.5,2.5], contrast [0.65,1.5], saturation [0.5,1.5], warmth [-0.25,0.25], highlights [-0.6,0.6], shadows [-0.6,0.6], blur [0,8].
Neutral values: exposureEv 0, contrast 1, saturation 1, warmth 0, highlights 0, shadows 0, blur 0.
Use mudanças pequenas. Não use blur para esconder defeitos, exceto se o usuário solicitar.

Catálogo cinematográfico versão ${CINEMATIC_CATALOG_VERSION}. Referências recuperadas (use como orientação, não como preset obrigatório): ${JSON.stringify(cinematicReferences)}

Avalie a fotografia antes de escolher uma referência: tipo de cena, sujeito, horário provável, luz principal, dureza/difusão, direção da luz, fontes práticas, faixa tonal, paleta dominante e atmosfera. Escolha somente uma referência compatível entre as candidatas; se nenhuma combinar, ignore o catálogo e faça uma correção natural. Use as notas e cautelas de cada registro. Os metadados de grão, halation, lente, névoa, chuva e profundidade são referências descritivas: não afirme que foram aplicados, pois o renderizador atual não os implementa. Não copie uma cena, fotograma ou LUT; traduza apenas princípios visuais em parâmetros suportados.

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
        generationConfig: { responseMimeType: "application/json", responseSchema },
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