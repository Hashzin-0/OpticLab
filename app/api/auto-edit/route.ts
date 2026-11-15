import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EditPlanDeltaSchema, EditPlanSchema } from "@/lib/editing/schema";
import { mergeEditPlan } from "@/lib/editing/refinement";
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

const adjustmentProperties = {
  exposureEv: { type: "NUMBER" },
  contrast: { type: "NUMBER" },
  saturation: { type: "NUMBER" },
  vibrance: { type: "NUMBER" },
  warmth: { type: "NUMBER" },
  highlights: { type: "NUMBER" },
  shadows: { type: "NUMBER" },
  blur: { type: "NUMBER" },
};
const adjustmentRequired = ["exposureEv", "contrast", "saturation", "vibrance", "warmth", "highlights", "shadows", "blur"];
const qualityProperties = {
  denoise: { type: "NUMBER" },
  clarity: { type: "NUMBER" },
  sharpen: { type: "NUMBER" },
  vignette: { type: "NUMBER" },
};
const qualityRequired = ["denoise", "clarity", "sharpen", "vignette"];

const fullRegionSchema = {
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
    adjustments: { type: "OBJECT", properties: adjustmentProperties, required: adjustmentRequired },
  },
  required: ["label", "box_2d", "mask", "feather", "adjustments"],
};

const fullResponseSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    global: { type: "OBJECT", properties: adjustmentProperties, required: adjustmentRequired },
    quality: { type: "OBJECT", properties: qualityProperties, required: qualityRequired },
    regions: { type: "ARRAY", items: fullRegionSchema, maxItems: 8 },
  },
  required: ["summary", "global", "quality", "regions"],
};

const partialAdjustmentSchema = { type: "OBJECT", properties: adjustmentProperties };
const partialQualitySchema = { type: "OBJECT", properties: qualityProperties };
const deltaResponseSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    global: partialAdjustmentSchema,
    quality: partialQualitySchema,
    regionUpdates: {
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
          adjustments: partialAdjustmentSchema,
        },
        required: ["label"],
      },
    },
    regionAdds: { type: "ARRAY", items: fullRegionSchema, maxItems: 8 },
    removeRegions: { type: "ARRAY", items: { type: "STRING" }, maxItems: 8 },
  },
  required: ["summary", "global", "quality", "regionUpdates", "regionAdds", "removeRegions"],
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
  const previousPlan = parsed.data.previousPlan ?? null;
  const retrievedLooks = retrieveCinematicLooks(`${instruction} ${previousPlan?.summary ?? ""}`, 6);
  const cinematicReferences = retrievedLooks.length > 0
    ? retrievedLooks
    : retrieveCinematicLooks("natural editorial low-key noir warm golden hour soft documentary", 6);

  const refinementInstructions = previousPlan
    ? `MODO DE REFINAMENTO INCREMENTAL (obrigatório):
Você recebeu um plano acumulado. NÃO recrie a edição, NÃO devolva um plano completo e NÃO redefina parâmetros que o usuário não pediu para alterar.
Retorne somente um DELTA com estas propriedades:
- summary: resumo curto do resultado acumulado.
- global: somente parâmetros globais que precisam mudar; cada valor é o novo valor absoluto, não um incremento.
- quality: somente parâmetros de qualidade que precisam mudar; cada valor é o novo valor absoluto.
- regionUpdates: somente regiões existentes que precisam mudar. Use exatamente o label da região do plano anterior. Inclua apenas os campos alterados; adjustments também deve ser parcial.
- regionAdds: novas regiões apenas quando o pedido exigir uma nova correção localizada.
- removeRegions: labels existentes que devem ser removidos somente se o usuário pedir explicitamente.
Se o pedido for "mais quente", altere warmth e preserve todos os demais parâmetros, regiões e máscaras. Se pedir para reduzir um efeito, ajuste o valor acumulado correspondente. Se não houver mudança necessária em uma seção, retorne objeto vazio ou lista vazia. Não substitua máscaras existentes sem necessidade.`
    : `MODO DE EDIÇÃO INICIAL:
Crie um plano completo. Não use valores neutros por padrão quando a fotografia apresentar problemas visíveis. Aplique correções suficientemente perceptíveis para melhorar a captura, mas preserve aparência natural, textura, identidade, composição e conteúdo. Não exagere nem crie artefatos.`;

  const systemPrompt = `Você é o analista fotográfico do OpticLab. Analise a imagem e produza parâmetros matemáticos para um pipeline determinístico. Você não gera imagens, não redesenha a fotografia e não inventa detalhes.

Objetivo: produzir uma fotografia tecnicamente mais limpa e visualmente intencional, com aparência cinematográfica coerente com a cena. Faça diagnóstico antes de ajustar: exposição, clipping, contraste, balanço de branco, saturação/vibrance, ruído, nitidez, microcontraste e iluminação por regiões. Evite correções cosméticas quase imperceptíveis quando a imagem realmente precisa de tratamento. Não destrua textura, pele, detalhes finos ou cores relevantes.

Parâmetros globais e regionais:
exposureEv [-2.5,2.5], contrast [0.65,1.5], saturation [0.5,1.5], vibrance [-0.5,0.8], warmth [-0.25,0.25], highlights [-0.6,0.6], shadows [-0.6,0.6], blur [0,8].
Qualidade global:
denoise [0,0.45], clarity [0,0.7], sharpen [0,0.9], vignette [0,0.5].
Use denoise quando houver ruído visível; evite remover textura. Use clarity para microcontraste local moderado e sharpen para recuperar acutância após redução de ruído ou ampliação. Não use nitidez para fabricar detalhe. Vignette deve ser sutil e coerente com a composição. Não aplique blur para simular profundidade de campo.

A saída é ampliada por interpolação de alta qualidade até 1920 px no lado maior, mantendo a proporção. Isso NÃO é super-resolução: não invente detalhes que não existam na fonte. Não prometa recuperar resolução, foco, textura ou informação ausente. A nitidez é uma operação determinística de acutância, não reconstrução de alta frequência real.

Retorne correções globais e até 8 regiões com segmentação automática. Para cada região, gere box_2d como [ymin,xmin,ymax,xmax] normalizado de 0 a 1000 e mask como polígono de pontos [x,y] normalizados de 0 a 1000, seguindo a capacidade de segmentation do Gemini. O polígono deve contornar o objeto/região real, não apenas desenhar um retângulo. Use feather entre 0.005 e 0.12. Escolha regiões úteis como pessoa/rosto, céu, fundo, vegetação ou primeiro plano. Não crie regiões sem benefício claro.

Catálogo cinematográfico versão ${CINEMATIC_CATALOG_VERSION}. Referências recuperadas (use como orientação, não como preset obrigatório): ${JSON.stringify(cinematicReferences)}
Avalie tipo de cena, sujeito, horário provável, luz principal, direção, dureza/difusão, fontes práticas, faixa tonal, paleta e atmosfera. Escolha somente uma referência compatível; se nenhuma combinar, ignore o catálogo. Metadados de grão, halation, lente, névoa, chuva e profundidade são descritivos: não afirme que foram aplicados, pois o renderizador não os implementa. Não copie fotogramas nem LUTs.

Pedido do usuário: ${instruction}
Plano acumulado anterior: ${previousPlan ? JSON.stringify(previousPlan) : "nenhum"}.

${refinementInstructions}
Responda em JSON conforme o schema fornecido. Escreva o resumo em português.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }, { inline_data: { mime_type: image.mimeType, data: image.data } }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: previousPlan ? deltaResponseSchema : fullResponseSchema,
        },
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
    try {
      modelOutput = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "A resposta do Gemini não contém um plano JSON válido." }, { status: 502 });
    }

    if (!previousPlan) {
      const plan = EditPlanSchema.safeParse(modelOutput);
      if (!plan.success) return NextResponse.json({ error: "O plano sugerido não passou pela validação de segurança." }, { status: 502 });
      return NextResponse.json({ plan: plan.data });
    }

    const delta = EditPlanDeltaSchema.safeParse(modelOutput);
    if (!delta.success) return NextResponse.json({ error: "A revisão incremental não passou pela validação de segurança." }, { status: 502 });
    try {
      return NextResponse.json({ plan: mergeEditPlan(previousPlan, delta.data) });
    } catch {
      return NextResponse.json({ error: "A revisão tentou alterar uma região inexistente ou produziu um plano inválido." }, { status: 502 });
    }
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "A análise excedeu o tempo limite. Tente novamente." }, { status: 504 });
    }
    return NextResponse.json({ error: "Falha de comunicação com o serviço de análise." }, { status: 502 });
  }
}
