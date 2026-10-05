# SES 410 protected-area land cover FOR AI HANDOFF.

This repository preserves the current development version of a reusable Google Earth Engine (GEE) land-cover workflow. Its shared JavaScript module accepts a protected-area boundary, year, class legend, reviewed training points, and a separate independently interpreted validation collection. Skeleton Coast and Salonga are test configurations, not park-specific branches inside the classifier. The current park runs are computational pilots; neither park has independently validated land-cover results yet.

This package is a source snapshot from the Earth Engine repository `users/arisol/protected-area-landcover-ses410`. The `.js` filenames make the files clear in GitHub. The active GEE script names omit that extension, and the `require(...)` calls intentionally name those existing GEE scripts. If the team imports the files under different GEE names or a different repository, update the `require(...)` strings in the four adapter scripts.

## Files and dependencies

```text
.
├── README.md
├── SES410_landcover.js
├── TEST_skeleton_coast_SMOKE_ONLY.js
├── TEST_salonga_SMOKE_ONLY.js
├── REVIEW_skeleton_coast_2021.js
├── REVIEW_salonga_2021.js
└── APP_REFERENCE_REVIEW_2021.js
```

| File | Role | Required? | Depends on |
| --- | --- | --- | --- |
| `SES410_landcover.js` | Site-agnostic embedding, Random Forest, metrics, exports, reference checks, and pilot/reference-frame functions. | Yes | Earth Engine datasets and JavaScript API. |
| `TEST_skeleton_coast_SMOKE_ONLY.js` | Intentional Skeleton Coast regression/pilot configuration. | Yes, to retain this test case | `SES410_landcover.js`; WDPA, Satellite Embeddings, ESA WorldCover. |
| `TEST_salonga_SMOKE_ONLY.js` | Equivalent Salonga regression/pilot configuration. | Yes, to retain this test case | Same as the Skeleton Coast test. |
| `REVIEW_skeleton_coast_2021.js` | Prepares 2021 training proposals and an unlabelled blind validation frame for Skeleton Coast. | Yes, for continued reference-data development | `SES410_landcover.js`; WDPA, Satellite Embeddings, ESA WorldCover. |
| `REVIEW_salonga_2021.js` | Equivalent Salonga reference-preparation configuration. | Yes, for continued reference-data development | Same as the Skeleton Coast review script. |
| `APP_REFERENCE_REVIEW_2021.js` | Maintained human review interface with the four frozen `REVIEW_V1` point frames embedded in source. | Yes, for the current review workflow | Earth Engine UI and Sentinel-2; no classifier import. |
| `README.md` | Architecture, execution, scientific status, and handover instructions. | Yes | The six scripts above. |

The review app's embedded 120 training proposals and 200 blind validation locations per site are unreviewed fixtures needed for its current operation. They are not accepted labels or model outputs. Keep downloaded reviewed CSV/GeoJSON files, checkpoints, reviewer notes, and imagery evidence in a separately controlled reference archive; do not commit them here.

## Architecture and status

`SES410_landcover.js` loads the 64 bands of `GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL` for the selected year and boundary. Its production function `runWorkflow(config)` samples labeled point references on an explicit 10 m grid, trains a seeded 200-tree Random Forest by default, classifies the boundary, and evaluates predictions against a separate validation collection. The console reports a confusion matrix with reference classes in rows, prediction classes in columns, overall accuracy, kappa, per-class producer recall, user precision, F1, and class support. Missing denominators produce undefined per-class metrics. The six optional Drive tasks are a classified GeoTIFF (255 = NoData), validation predictions, summary metrics, per-class metrics, confusion cells, and provenance. Tasks must be started in the Code Editor and checked after completion.

The same module exposes `runPilot(config)`, `resolveWdpa`, `prepareCandidates`, `validationFrame`, and `validateConfig`. `runPilot` is a development path: it queries WDPA by protected-area name and country, checks the expected WDPA site ID, reserves separate validation locations, uses ESA WorldCover 2021 to propose training classes, and excludes candidate locations near the reserved frames. In `smoke_test` mode it also labels a separate holdout from WorldCover to exercise classification and metric code. Those metrics are **agreement with a product, not independent validation accuracy**. In `candidate_preparation` mode it stops before training and prepares training proposals plus an unlabelled blind validation frame. Its export tasks are separate CSV and GeoJSON copies of each frame.

The two `TEST_*` scripts are maintained regression harnesses with `mode: 'smoke_test'` and `createExportTasks: false`. The two `REVIEW_*` scripts are maintained reference-preparation configurations with `mode: 'candidate_preparation'` and `exportReferencePreparation: true`. They contain the site names, WDPA identifiers, 2021 legends, class mappings, CRS, seeds, and preliminary point budgets. Skeleton Coast uses `NAM`, WDPA ID `885`, EPSG:32733 and classes water / bare or sparse cover / natural vegetation. Salonga uses `COD`, WDPA ID `555697863`, EPSG:32734 and classes tree-cover forest candidate / water / nonforest natural vegetation. The WorldCover mappings are proposals that require review, and the three-class legends remain provisional.

`APP_REFERENCE_REVIEW_2021.js` is a separate human review interface. It shows individual points and dated Sentinel-2 imagery, lets reviewers enter a class, confidence, decision, source/date, and notes, and provides per-dataset CSV and GeoJSON checkpoint downloads with restoration. Training proposals appear only in training datasets. Blind validation records start without a class and the app does not import the classifier or show predictions. The app keeps edits in the browser session until downloaded; it has no shared review database. The four-dataset selector is not access control: coordinators must keep validation reviewers blind to training proposals, product labels, and model outputs outside the app as well.

## Running the current scripts

1. Open the separate GEE repository `users/arisol/protected-area-landcover-ses410` in the Code Editor. The shared module is the script `SES410_landcover`; the four adapters import it using that exact path. In a new GEE repository, save the module under the same script name and change the adapter import paths to that repository.
2. Run either `TEST_*_SMOKE_ONLY` script to test WDPA lookup, embeddings, candidate sampling, the Random Forest, map rendering, and diagnostic product-agreement metrics. The pilot uses 2021 imagery and preliminary 40-proposals-per-class, 200-holdout-location and 100 m exclusion settings. These are computation budgets, not a scientific claim about sample sufficiency. Exports are off by default.
3. Run a `REVIEW_*_2021` script to prepare or inspect reference frames. It does not train or classify. Its tasks must be started manually if new export copies are needed. Avoid changing the existing frozen `REVIEW_V1` seeds or IDs during an active review batch.
4. Use `APP_REFERENCE_REVIEW_2021` for the current human review batch. Save/download both formats for each dataset before closing or reloading the app. Treat the frozen embedded frames as original proposals/locations and keep review decisions in separate controlled files.
5. After coordinator review and an explicit independent validation design, upload approved training and locked validation point files as separate GEE assets. Create a new site production runner that calls `hammer.runWorkflow(config)` with that site's boundary, year, full legend, assets, 10 m projected CRS, documented `validationDesign` and `referenceProtocol`, and `validationUsedForTuning: false`. Set `independentReferencesConfirmed: true` only when the reference protocol supports that statement. See `validateConfig` and `runWorkflow` in the shared module for the exact input checks. A direct run of the module with its null inputs only prints that the core is ready.

Production points need numeric `class` codes in the declared legend, unique `sample_id`, meaningful `unit_id`, `role`, `reviewed=1`, `reference_year` matching the selected year, and a truthful `label_source`. Training permits `manual_reference` or `reviewed_product_candidate`; validation requires `independent_reference`. The workflow checks required metadata, points and bounds, distinct IDs and reference units, spatial collisions/separation, duplicate analysis pixels, class support, and missing validation imagery before reporting metrics. These checks detect common data leakage, but cannot prove that a human label is correct or independent.

## Scientific limits and next work

- No accepted reviewed training assets or independently interpreted validation assets are connected to either park. No scientifically valid site accuracy claim is available.
- WorldCover proposal labels and pilot holdouts can share errors; holding out locations does not make product labels independent truth. Sentinel-2 used for human interpretation may also share information with the embedding inputs. Record evidence dates, resolution, uncertainty, and interpretation decisions; seek stronger field or dated finer-resolution evidence where possible.
- The current metric outputs are unweighted sample summaries. They do not estimate area-weighted park accuracy or uncertainty for a stratified, clustered, convenience, or capped sample. A final probability design needs inclusion probabilities, appropriate estimators, uncertainty intervals, and a documented nonresponse protocol.
- WDPA `current` can change and does not reconstruct a 2021 legal boundary. Pin and document the protected-area boundary release for reproducible scientific work. Audit omitted land-cover classes and temporal mismatch before using the provisional legends as final classes.
- The inherited 200-tree setting, class caps, spacing, and review counts are preliminary. Tune using development data only; keep the final validation set locked. Investigate cloud gaps, mixed pixels, shoreline/seasonal-water ambiguity, and masked imagery. A successful map preview does not prove that a full-park export completed.

Future teammates should keep the core site-agnostic, retain the smoke tests as diagnostics, preserve frozen review-batch IDs and coordinates, and document any new sampling or legend version. Make changes in a branch or separate GEE script, review the effects on both parks, and do not overwrite completed review exports or the active reference archive. Keep credentials, private reviewer records, checkpoint files, and generated maps/CSVs/GeoJSON outside source control.

## Source datasets

- [Google Satellite Embedding V1](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_SATELLITE_EMBEDDING_V1_ANNUAL): 10 m annual predictors; attribution required: “The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.”
- [WDPA current polygons](https://developers.google.com/earth-engine/datasets/catalog/WCMC_WDPA_current_polygons): protected-area queries; check the dataset's use and attribution terms before redistribution.
- [ESA WorldCover v200](https://developers.google.com/earth-engine/datasets/catalog/ESA_WorldCover_v200): 2021 pilot/proposal source, never independent reference truth.
- [Sentinel-2 surface reflectance](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED): dated imagery viewed in the human review app.

This snapshot intentionally contains no generated rasters, review exports, checkpoints, screenshots, or older drafts. The JavaScript sources are copied from the live GEE repository without functional edits; this README replaces its long-running session log with a source-control handover guide.
