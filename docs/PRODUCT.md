# Product contract

## Product definition

OpticLab is an autonomous photo-processing application, not a conventional manual editor. The user uploads a photograph and receives a corrected result without configuring sliders, tools, layers, lens profiles, or masks.

The user may then describe a desired change in natural language. OpticLab interprets that request as an incremental change to the accumulated edit plan. The renderer rebuilds the final image from the preserved original and the updated plan.

## Non-negotiable UX

- One upload action.
- Automatic analysis and correction.
- One finished preview with original/result comparison.
- Natural-language refinement that preserves prior changes.
- Download of the processed result.
- No exposed manual editing panels or mask painting workflow.
- Internal masks are generated and managed automatically.

## Fidelity contract

- Gemini is an analyst/planner, never the pixel renderer.
- The actual pixel transformation is deterministic and schema-bounded.
- The source image remains immutable.
- Every refinement updates the accumulated plan; unchanged values and regions remain intact.
- The final raster is reconstructed from the original plus the accumulated plan to avoid cumulative compression and processing artifacts.
- Upscaling preserves aspect ratio and does not crop. It is interpolation, not AI super-resolution, and does not recreate missing detail.
- The system must disclose when data cannot be recovered (clipped highlights, missing detail, unknown capture parameters, or out-of-focus source).
- No generative fill, image synthesis, face replacement, object replacement, or content invention in the correction path.

## Automatic analysis scope

- Exposure and tonal distribution.
- White balance and color cast estimates.
- Contrast, saturation, and vibrance.
- Highlight/shadow balance.
- Noise and sharpness assessment.
- Edge-aware noise reduction when warranted.
- Local clarity and edge sharpening.
- Aspect-ratio-preserving output enlargement to a 1920px long edge for smaller sources.
- Semantic regions and internal soft masks.
- Cinematic reference matching through a curated, rights-aware knowledge catalog.

## Refinement semantics

The first analysis returns a complete bounded plan. Later refinements return a typed delta. The server merges only the changed fields into the previous plan, preserving untouched parameters, masks, and regions. Values in a delta are absolute target values, not arithmetic increments.

The browser always renders the merged plan from the original source. It does not repeatedly edit the last PNG, which would accumulate compression, resampling, and rounding errors.

## Current implementation boundary

The renderer now includes linear-light sRGB tonal/color operations, vibrance, a small edge-aware denoise pass, tiled unsharp-mask clarity/sharpening, restrained vignette, and high-quality Canvas interpolation. It is still not a RAW developer, neural super-resolution engine, professional color-managed finishing system, or calibrated lens-correction suite. The interpolation output may have Full-HD-class dimensions, but its real detail remains bounded by the source photograph.
