import type { Adjustment } from "@/lib/editing/schema";

export interface CinematicLook {
  id: string;
  name: string;
  intent: string;
  visualTraits: string[];
  globalBias: Partial<Adjustment>;
  caution: string;
}

/**
 * Authored technical look studies. These are descriptive recipes, not copied LUTs
 * or redistributed film frames. Expand only with documented provenance and review.
 */
export const CINEMATIC_CATALOG: CinematicLook[] = [
  {
    id: "natural-editorial",
    name: "Natural editorial",
    intent: "Fotografia editorial realista, pele natural e contraste moderado.",
    visualTraits: ["natural light", "neutral whites", "controlled highlights", "subtle contrast", "skin tones"],
    globalBias: { contrast: 1.06, saturation: 0.98, highlights: 0.12, shadows: 0.05, warmth: 0.01 },
    caution: "Não neutralizar a atmosfera de luz original nem exagerar a nitidez.",
  },
  {
    id: "low-key-noir",
    name: "Low-key noir",
    intent: "Cena noturna de baixo preenchimento, sombras profundas e luz localizada.",
    visualTraits: ["low key", "deep shadows", "cool blacks", "selective highlights", "night scene"],
    globalBias: { exposureEv: -0.18, contrast: 1.16, saturation: 0.88, highlights: 0.18, shadows: -0.08, warmth: -0.04 },
    caution: "Preservar detalhe útil nas sombras e não escurecer rostos automaticamente.",
  },
  {
    id: "cool-urban",
    name: "Cool urban",
    intent: "Ambiente urbano frio, cores contidas e contraste controlado.",
    visualTraits: ["cool palette", "urban night", "cyan shadows", "muted saturation", "hard practical lights"],
    globalBias: { contrast: 1.1, saturation: 0.9, warmth: -0.08, highlights: 0.12 },
    caution: "Não deslocar tons de pele para ciano; aplicar qualquer separação cromática de forma localizada.",
  },
  {
    id: "warm-golden-hour",
    name: "Warm golden hour",
    intent: "Luz quente de fim de tarde com realces suaves e sombras preservadas.",
    visualTraits: ["golden hour", "warm highlights", "soft contrast", "amber light", "outdoor portrait"],
    globalBias: { warmth: 0.09, contrast: 1.04, saturation: 1.03, highlights: 0.14, shadows: 0.08 },
    caution: "Não transformar balanço de branco neutro em dominante laranja.",
  },
  {
    id: "earth-atmospheric",
    name: "Earth atmospheric",
    intent: "Paleta terrosa, atmosfera suave e saturação moderada.",
    visualTraits: ["earth tones", "dusty palette", "soft haze", "muted greens", "warm neutrals"],
    globalBias: { contrast: 1.05, saturation: 0.88, warmth: 0.05, highlights: 0.1, shadows: 0.04 },
    caution: "Não criar névoa artificial nem apagar detalhes de textura.",
  },
  {
    id: "vivid-romantic",
    name: "Vivid romantic",
    intent: "Cores expressivas, luminosidade e contraste sem clipping.",
    visualTraits: ["vivid color", "bright practical lights", "warm skin", "color separation", "high energy"],
    globalBias: { contrast: 1.08, saturation: 1.12, warmth: 0.03, highlights: 0.08, shadows: 0.04 },
    caution: "Proteger canais saturados e tons de pele.",
  },
  {
    id: "monochrome-dramatic",
    name: "Monochrome dramatic",
    intent: "Estética monocromática com hierarquia tonal e textura.",
    visualTraits: ["black and white", "monochrome", "tonal separation", "dramatic lighting", "texture"],
    globalBias: { saturation: 0.5, contrast: 1.18, highlights: 0.1, shadows: -0.02 },
    caution: "O motor ainda não oferece conversão monocromática calibrada; tratar como orientação parcial.",
  },
  {
    id: "soft-documentary",
    name: "Soft documentary",
    intent: "Tratamento discreto, luz ambiente e cores fiéis.",
    visualTraits: ["documentary", "available light", "natural color", "low processing", "balanced exposure"],
    globalBias: { contrast: 1.02, saturation: 0.97, highlights: 0.08, shadows: 0.1 },
    caution: "Evitar aparência de preset e preservar diferenças reais de iluminação.",
  },
];

export function retrieveCinematicLooks(query: string, limit = 3): CinematicLook[] {
  const tokens = new Set(query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean));
  return CINEMATIC_CATALOG
    .map((look) => ({
      look,
      score: [look.name, look.intent, ...look.visualTraits].join(" ").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/)
        .filter((token) => tokens.has(token)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ look }) => look);
}
