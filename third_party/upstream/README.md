# Photos upstream research mirrors

This directory records upstream references used to research Pocket Earth Photos.
The full source mirrors were archived to SSD during the 2026-08-27 localhost
cleanup; only their original licenses remain here. The mirrors are not imported
as application dependencies and are not bundled into the Android APK.

See [the cleanup record](../../docs/development/LOCALHOST-CLEANUP-20260827.md)
for the retained runtime directories and archive recovery procedure.

## Facet

- Source: `https://github.com/fafacet/facet`
- Archived mirror: `third_party/upstream/facet` (license retained locally)
- License: MIT, preserved in `third_party/upstream/facet/LICENSE`
- Used as a product and algorithm reference for technical-quality signals,
  perceptual-hash grouping, burst representative selection, explicit review
  queues, and user A/B preference updates.
- Not bundled: Python, PyTorch, FastAPI, Angular, server jobs, or upstream model
  weights.

## PicQuery

- Source: `https://github.com/greyovo/PicQuery`
- Archived mirror: `third_party/upstream/picquery` (license retained locally)
- License: MIT, preserved in `third_party/upstream/picquery/LICENSE`
- Used as an Android architecture reference for MediaStore enumeration,
  incremental photo embeddings, local nearest-neighbour search, text-to-photo
  retrieval, and image-to-image retrieval.
- Not bundled: the upstream Android application, ObjectBox database, ML Kit
  translation layer, or upstream model binaries.

Pocket Earth implementations live under `src/app/lib/photo`,
`src/app/components/PhotosTab.tsx`, and the Android `PocketPhotoLibrary` bridge.
They keep Pocket Earth's existing IndexedDB, Capacitor, Qwen3-VL-2B/MNN, and UI
contracts instead of forking either upstream application.
