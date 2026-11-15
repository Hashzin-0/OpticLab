# Cinematic knowledge catalog

## Purpose

The catalog is a structured knowledge base for translating visual references into reproducible photographic parameters. It is not a folder of copied film frames and it is not a collection of one-click LUT presets.

## Record shape

Each reference record should contain:

- Stable identifier and title.
- Film/work title, year, cinematographer and source provenance where known.
- Rights status and permitted use of any reference image.
- Scene conditions: interior/exterior, day/night, weather, practical lighting.
- Color palette descriptors and measured color statistics where licensed source imagery exists.
- Tonal response: black level, highlight roll-off, contrast distribution.
- Lighting descriptors: key/fill ratio estimate, direction, softness, color temperature estimate.
- Lens/depth-of-field observations only when supported by reliable source data.
- A parameter recipe expressed in the application's bounded edit-plan schema.
- Confidence, evidence, reviewer and catalog version.

## Retrieval and analysis

1. Analyze the uploaded photo's visual characteristics.
2. Retrieve candidate records by semantic description and measurable feature similarity.
3. Compare the photo's lighting, palette, contrast, and scene context.
4. Ask Gemini to recommend a bounded parameter plan based on retrieved metadata.
5. Validate the plan and render deterministically.
6. Evaluate the rendered result against the requested reference characteristics.

## Rights and provenance

Do not scrape or redistribute copyrighted film frames. Prefer licensed stills, public-domain material, user-provided references with appropriate rights, and independently authored technical descriptions. Store source URLs, rights basis, attribution requirements, and review status. A film title alone does not establish permission to copy its imagery.

## Expansion

The catalog should be data-driven and versioned. It can grow through curated research, user-contributed references, and measured open datasets. Avoid fabricated lens metadata, invented cinematography credits, and recipes unsupported by a source or reproducible analysis.
