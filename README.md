# OpticLab

Autonomous computational photography. Upload a photo; OpticLab analyzes it, builds a validated edit plan, applies deterministic image processing and returns a finished image. Users can request natural-language refinements without operating manual editing controls.

## Product principle

**One user-facing engine, one automated workflow.** Internal algorithms are implementation details coordinated by a single orchestration pipeline. This is not a traditional manual photo editor.

Gemini analyzes the image and translates user intent into a typed edit plan. It does not generate, repaint, or replace the photograph. Pixel changes are performed by deterministic, testable image operations. Semantic masks are generated automatically and used internally; users do not need to paint or manage masks.

## Current status

The application includes Gemini image analysis, validated contour segmentation, a versioned 75-study cinematic catalog, incremental plan refinement, and a deterministic browser renderer. The image pipeline now includes linear-light color transforms, vibrance, edge-aware denoising, local clarity, sharpening, vignette, and aspect-ratio-preserving interpolation to a 1920px long edge for smaller images.

The output enlargement is not neural super-resolution and does not recover details absent from the source. Production-grade RAW decoding, optical calibration, advanced color management, professional denoising, true film-stock emulation, vector catalog retrieval, rate limiting, authentication, and persistence are not implemented yet. See `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/CINEMATIC-CATALOG.md`, and `docs/IMAGE-QUALITY.md`.

## Development

Requirements: Node.js 20.9+ and npm.

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
```

Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`. Never commit secrets.

## Safety and fidelity

- Preserve the uploaded original.
- Never claim to recover clipped highlights, missing detail, true shutter speed, or real lens metadata when they were not captured.
- Validate every model-produced parameter against application-owned schemas and bounds.
- No generative image editing in the correction pipeline.
- Refinements update the accumulated plan; final pixels are rendered from the original plus that plan.
