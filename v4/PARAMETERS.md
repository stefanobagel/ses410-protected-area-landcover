# v4.0.1 effective parameter register

Derived from original v0.2, Vedant v3.2 and selectively adapted Anthony U1.1.2 behavior. Values below are read directly from contracts.js DEFAULTS; config(), SITES, core.js and the UI are the effective implementation. Every run exports its frozen configuration. All scientific optimality/acceptance claims remain unapproved; the user authorized these as engineering defaults.

| Setting (contracts.js DEFAULTS/config) | Default | Source | Rationale | Change / comparison effect |
|---|---|---|---|---|
|year|2021|v0.2 + Vedant|Match embeddings, imagery and reference dates|Changes data/evidence; invalidate comparison|
|profile|"baseline"|v0.2 + Vedant|Explicit baseline3 or detailed6/4 conservation legend|Changes class meaning; explicit migration/new evidence|
|spatialProfile|"distance"|combined|distance /spatial_blocks /diagnostic_2021|Changes collection/evaluation domain; roles preserved|
|separationMeters|100|v0.2|Provisional general cross-set distance, checked after snapping|Changes eligibility and training geography; not an optimum|
|scale|10|v0.2|Canonical10m features/evaluation/raster; site UTM explicit transform|Changing analysis scale rejected; derivatives separate|
|trees|200|v0.2 explicit API defaults|Site-specific Smile RF; null maxNodes means unlimited|Changes model; preserve same cohorts/settings for comparisons|
|seed|410|v0.2 explicit API defaults|Site-specific Smile RF; null maxNodes means unlimited|Changes model; preserve same cohorts/settings for comparisons|
|variablesPerSplit|8|v0.2 explicit API defaults|Site-specific Smile RF; null maxNodes means unlimited|Changes model; preserve same cohorts/settings for comparisons|
|minLeafPopulation|1|v0.2 explicit API defaults|Site-specific Smile RF; null maxNodes means unlimited|Changes model; preserve same cohorts/settings for comparisons|
|bagFraction|0.5|v0.2 explicit API defaults|Site-specific Smile RF; null maxNodes means unlimited|Changes model; preserve same cohorts/settings for comparisons|
|maxNodes|null|v0.2 explicit API defaults|Site-specific Smile RF; null maxNodes means unlimited|Changes model; preserve same cohorts/settings for comparisons|
|tileScale|4|v0.2|Sampling/reduction operational tiling|May affect computation; record value and verify semantic equivalence|
|clusters|8|Vedant|Spread review effort across eight embedding strata|Changes candidate allocation, not accepted class counts|
|blockMeters|10000|Vedant adapted|Site UTM10km allocation, not Web Mercator edge guarantees|Changes roles of NEW candidates; imported roles never reassigned|
|blockSeparationMeters|500|Vedant adapted|Projected guard proposal plus actual500m geodesic cross-set check|Changes guard/evaluation domain; no universal within-role rule|
|cloudScoreMinimum|0.6|Vedant|Cloud Score+ cs_cdf filter for annual Sentinel2 median|Changes review view/evidence; does not establish truth|
|coverageThreshold|0.99|Vedant provisional|Preliminary all64 mask area screen|Coarse screen cannot certify10m classification/accuracy|
|candidateScale|100|v0.2|100m diagnostic candidate predictors; reviewed extraction10m|Changes pixels/features; not comparable without fixed cohort|
|candidateCapPerClass|40|v0.2|40 diagnostic proposals per WorldCover class|Changes sample/training support; not statistical sufficiency|
|holdoutSeed|411|v0.2|411 separate product holdout draw|Changes assessment cohort; save actual points|
|reservedSeed|412|v0.2|412 separate unlabelled reserved frame|Changes reservations; never reassign frozen references|
|diagnosticExclusionMeters|100|v0.2|100m pre-sampling exclusion independent of additional post gate|Keep100 for original regression; positive post gate may reject old cohort|
|diagnosticValidationLocations|200|v0.2|200 product holdout locations, not50 independent/class|Changes assessment sample; preserve cohorts|
|reviewFloor|10|Vedant corrected|Engineering floor for EVERY declared training class|Stops deficient profile; never silently drops a class|
|proposedTrainingTarget|100|Historical planning, UNAPPROVED|Configurable proposed target; no automatic acceptance|A changed target does not change measured performance or prove sufficiency|
|proposedAssessmentTarget|50|Historical planning, UNAPPROVED|Configurable proposed target; no automatic acceptance|A changed target does not change measured performance or prove sufficiency|
|proposedMacroF1|0.8|Historical planning, UNAPPROVED|Configurable proposed target; no automatic acceptance|A changed target does not change measured performance or prove sufficiency|
|proposedClassScore|0.75|Historical planning, UNAPPROVED|Configurable proposed target; no automatic acceptance|A changed target does not change measured performance or prove sufficiency|
|reviewSceneLimit|30|Anthony U1.1.2 adapted|Bound low-cloud Sentinel2 search per point/year; clear-score screen at target pixel|More queries/candidates; empty bounded search is not proof of no evidence|
|reviewCircleDiameter|100|Anthony adapted|Geodesic orientation diameter, not ecological label support|Changes orientation only; canonical sample remains10m|

## Fixed versioned behaviors

* Annual embeddings: GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL, A00–A63. Setup queries available catalog years; baseline2021 diagnostic rejects other years instead of inventing temporal truth.
* Site grids: Skeleton EPSG:32733; Salonga EPSG:32734; transform[10,0,0,0,-10,0]. Canonical class0 remains valid and NoData255 is Byte; optional30/60m exports use categorical MODE and separate filenames.
* Boundary: WDPA/current national polygons, ISO3/name/English-name query and expected SITE_ID885/555697863. Multiple records are allowed; actual geometry(10), metadata, query, IDs and area are retained in provenance for reproducibility despite mutable collection.
* Baseline legend: SES410_INITIAL_2021_V1 with original site meanings/remaps. Detailed: SES410_SKELETON_COAST_DETAILED_V1 (6) and SES410_SALONGA_DETAILED_V1 (4), provisional and evidence-dependent. Explicit mapping is required across meanings.
* Candidate strata vs accepted classes are separate. Queue proposals use100m for bounded computation and are sampled at10m; actual requested/proposed/lost/eligible/achieved counts and points are retained. Manual additions are training/development only.
* Guard margins are proposals in local UTM; actual geodesic cross-set checks provide the distance check. Excluded strips remain in prediction domain. No universal training-training/assessment-assessment spacing rule or optimal distance is established.
* IDs/units/positions/analysis pixels are checked separately from proximity. Imported roles/coordinates/years are preserved; incompatible block roles or deficient support require an explicit revision, not silent reassignment or shrinking.
* Metrics: reference rows/prediction columns, full confusion matrix, OA, precision/recall/F1/support, absent-class warnings; full macroF1 withheld when a reference class is absent; undefined denominators null. Unweighted sample interpretation, no automatic scientific certification or unimplemented confidence intervals.
* Final evaluation needs separate references, independence/unused-for-tuning attestation, protocol, design and destination. Software metadata checks do not prove real blinding or label truth. No final labels enter ordinary review queues.
* All relevant input/label changes invalidate current results, displayed classification/metrics, attestation and export eligibility; every async continuation checks its run identity. Repeated/partial duplicate export creation is blocked.
* Exports carry source hash, year/datasets, boundary geometry, actual cohorts, counts, distance audit, model/grid settings and limitations. Timing is callback elapsed; rendering/full exports are separate. Interactive EECU is unavailable unless exposed; never inferred from runtime.
* Original2021 diagnostic preparation is named diagnostic_2021. A positive post-sampling gate can correctly reject historical nominal100m cohorts; an explicitly selected0m additional gate reproduces old preparation without claiming scientific independence. The November2 study established no minimum/optimum or causal inflation.

## v4.0.1 reference and delivery corrections

* Scene searches use the selected year, a configurable bounded low-cloud search and Cloud Score+ at the point. Displaying a scene never changes recorded evidence; attaching creates a draft. Acquisitions require real YYYY-MM-DD calendar dates and at least one matching-year date. Review timestamps are checked separately.
* Committed records and pending drafts are separate. Edits revoke current results/export eligibility, exact prior committed observations survive undo, and checkpoints retain drafts plus immutable identity anchors. These checks detect inconsistent/tampered fields; checkpoints are not cryptographically authenticated.
* Blind sessions accept geometry-only coordinator frames or explicitly NEW UNAPPROVED frames; no proposal/stratum/model views. Sessions cannot erase previous human exposure or prove access-controlled blinding.
* Optional mapped area is unadjusted projected10m pixel count times0.01ha, with no error adjustment. Aligned rectangular export extent preserves explicit255 outside the clipped park; polygon export cutlines were shown to zero-fill outside their polygon. Class0 stays valid.
* Per-output request ledgers distinguish creation from observed remote task states. Missing requests alone are retried; a remote failed task needs an explicit observed task-ID retry record. Optional messages do not replace main errors.
* Source input hashes use normalized UTF8/LF; generated UI/core use ASCII JS escapes and LF. Exact deployed byte hashes are separate deployment receipts. Native mosaic order is preserved with ordered tile IDs; no new sorting or predictor-support change is hidden.
* All-point canonical raster/table comparisons supplement metric counts. A successful point audit is not full-map certification. Preview is display-dependent; completed10m files govern GIS delivery.
