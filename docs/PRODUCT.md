# Product contract

## Product definition

OpticLab is an autonomous photo-processing application, not a conventional manual editor. The user uploads a photograph and receives a corrected result without configuring sliders, tools, layers, lens profiles, or masks.

The user may then describe a desired change in natural language. OpticLab interprets that request, updates the mathematical edit plan, and re-renders from the preserved original.

## Non-negotiable UX

- One upload action.
- Automatic analysis and correction.
- One finished preview with original/result comparison.
- Natural-language refinement.
- Download of the processed result.
- No exposed manual editing panels or mask painting workflow.
- Internal masks are generated and managed automatically.

## Fidelity contract

- Gemini is an analyst/planner, never the pixel renderer.
- The actual pixel transformation is deterministic and schema-bounded.
- The source image remains immutable.
- Every refinement is replayed from the original to avoid cumulative degradation.
- The system must disclose when data cannot be recovered (clipped highlights, missing detail, unknown capture parameters).
- No generative fill, image synthesis, face replacement, object replacement, or content invention in the correction path.

## Automatic analysis scope

- Exposure and tonal distribution.
- White balance and color cast estimates.
- Contrast and saturation.
- Highlight/shadow balance.
- Noise and sharpness assessment (future processing stages).
- Optical distortion and vignetting when metadata/profile evidence exists.
- Semantic regions and internal soft masks.
- Cinematic reference matching through a curated, rights-aware knowledge catalog.

## Refinement semantics

The user's latest instruction is interpreted against the original image and the current edit plan. The model returns a complete bounded plan, not imperative code or tool calls. The app validates every field and only then runs the deterministic pipeline.

## Current implementation boundary

The bootstrap implements a first-pass browser pipeline: global tonal/color adjustments and feathered rectangular region masks. These are not production-grade semantic segmentation or optical correction. The next iterations must replace coarse region boxes with real segmentation masks and add measured noise, lens, and color-science algorithms without changing the simple user workflow.
