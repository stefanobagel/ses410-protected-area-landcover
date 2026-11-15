# Operation, review and reproducibility

## Collection and evidence

Load site/year/legend before collecting. Sentinel-2 true color is a calendar-year
clear-pixel median using Cloud Score+ cs_cdf >= .6 by default, not one dated scene.
Record actual supporting scene IDs/dates, with semicolon-separated valid YYYY-MM-DD acquisition dates (at least one in the reference year),
reviewer, confidence, protocol and notes. A composite alone does not prove flooded
forest, wet sand or substrate. Boundary fills are transparent; the current marker
is above imagery at the per-site review zoom.

Queue strata distribute surface variation, not actual classes. Requested,
proposed, sampled/lost, eligible and achieved counts are reported separately.
Pending actual points/IDs are retained with accepted/uncertain/rejected records.
Use navigation, uncertain flags, undo and resume unresolved reviews. New manual
rare-class examples are training/development only. A different final sampling
design cannot be invented by changing a role selector.

Save checkpoints before closing a session. Browser collections are separated by
site/year/legend; persistence across sessions needs a new saved asset or copied
GeoJSON checkpoint or CSV audit companion. GeoJSON preserves resumable decisions and drafts; a CSV alone is not a supported restore format. Press Enter after typing controls. Save to a unique asset name,
submit its task, and verify completion; existing assets are not overwritten.
For resume, load into a fresh collection. Loading the same observations atop the
same collection deliberately reports duplicates. Import errors/conflicts are
inspectable and never silently overwritten or treated as independent observations.

Use the source-schema selector and explicit versioned mapping from MIGRATION.md.
Salonga original1 means water, detailed1 means flooded forest; broad forest cannot
be split by a lookup. Accept/labeled statuses do not invent evidence, approval or
independence. Wrong-year observations must be opened in their original collection,
not silently reassigned. Review history, original records and source identity travel
through save/load; unresolved cases remain excluded until explicit evidence review.

## Detailed ambiguity guide

Skeleton: vegetated dry riverbeds use visible dominant vegetation, with channel
context in notes. Dry channel substrate needs channel morphology. Dune sand needs
aeolian/sandy morphology; distinguish pavement/gravel and exposed rock using actual
evidence. Shadow alone is not rock/water. Wet sand and open water share a provisional
class, but record subtype and wetness evidence; dry beach is excluded. Leave
ambiguous mixed or shadowed cases unresolved.

Salonga: terra firme requires non-inundated forest evidence; swamp/flooded forest
requires forest plus inundation/wetland evidence. Dark canopy alone is insufficient.
Open water excludes forest canopy over water. Record subtype/mixing for nonforest.
Detailed presets remain provisional and must retain every declared class. Every
training class needs the engineering floor before fitting; no low-count class is
dropped to display a passing score. Select the distinct coarser baseline explicitly
when scientifically appropriate, with a documented mapping/review.

## Spatial roles and final assessment

General distance checks actual geodesic training-to-assessment separation after
10m sampling/snapping, separately from shared IDs, reference units, coordinates
and analysis pixels. Neither profile establishes a universal within-training or
within-assessment spacing rule. The block profile proposes70/30 roles using10km
site UTM cells and251m edge margins; the actual500m geodesic gate must still pass.
Imported roles never change to fit blocks; incompatible records or infeasible
support require an explicit revision. Guard strips remain in the prediction domain;
assessment that excludes them does not validate that whole domain.

The optional reserved-assessment geometry asset excludes new candidates around
protected locations without loading labels. Use the coordinator's approved
geometry reservations for existing final samples. No private REVIEW_V1 locations
are embedded in the public app. Final reference assets use the dedicated workflow,
schema selector, independence/unused-for-tuning attestation, sampling design,
protocol and destination. Ordinary review queues never expose those records.
Access permissions, actual blinding and scientific approval remain coordinator
responsibilities; a checkbox cannot prove label truth.

## Evaluation, export and years

The named2021 diagnostic retains the original three-class WorldCover remaps,
40 proposals/class at100m,200 product holdouts(seed411), separate unlabelled
reservation(seed412) and RF200(seed410). Inherited diagnostic predictors remain
sampled at100m; geometry is snapped for canonical pixel/distance auditing without
changing those predictor values. Reviewed extraction is10m. Positive additional
gates can reject historical nominal100m cohorts. An explicitly selected0m
additional gate can reproduce old preparation with literal checks and actual
distance reporting; this is not independent accuracy or an optimal buffer.

Reference rows/prediction columns, OA, precision/recall/F1/support and the full
matrix are unweighted sample summaries. WorldCover runs report product agreement.
Missing assessment classes are explicit; full-legend macroF1 is withheld and
undefined denominators are null. No design-weighted estimator, unimplemented
confidence interval or target-based scientific acceptance is implied.

The package includes canonical10m Byte GeoTIFF, NoData255 with valid class0,
legend definitions/colors/version, exact training pixels/features, permitted
references/evidence, assessment predictions/features, summary/per-class/confusion,
provenance and uncertain records. Optional30/60m derivatives use categorical MODE
and separate filenames;10m metrics do not validate the coarser products. Unique
run IDs carry year/datasets, source hash, boundary metadata/geometry/area, actual
cohorts/counts/distance audit, grid, RF settings, protocol and limitations.

Changing relevant inputs/labels invalidates results, old displayed metrics/maps,
attestation and export eligibility. Old callbacks are ignored. Per-output request creation is tracked. Use the missing-request retry after a partial creation failure; already-created requests stay protected. Record actual remote task IDs/states before explicitly retrying a failed remote output. Task creation,
metric evaluation, rendered tiles and completed GeoTIFFs are different endpoints.
Elapsed callbacks include service/queue/transfer; EECU is unavailable unless
explicitly exposed and is never inferred from elapsed time.

For year comparisons preserve boundary geometry, class definitions and pixel grid;
use appropriately dated references and export each run's actual cohort/provenance.
Setup queries supported embedding years. WorldCover2021 is not silently used as
another-year truth. Year controls do not establish transition accuracy, change
uncertainty or causal inference; those remain separate scientific work.

## Dated scenes and committed drafts

On a review point, search dated scenes, select natural/false colour and verify the
acquisition date/ID. The configurable search examines up to reviewSceneLimit low-cloud
scenes and requires the Cloud Score+ threshold at the target pixel. An empty bounded
result is different from a service failure; both retain a retry path. Use other dated
archives or field evidence when appropriate. Do not infer forest inundation from
darkness alone. The orientation circle diameter is not label support.

Use displayed scene as evidence deduplicates IDs/dates into the draft. The display
and committed evidence labels are separate. Enter commits text changes to GEE
widgets. New edits invalidate results/exports and remain in a separate pending
draft during navigation. Accept or class save-and-next commits atomically; uncertain
and reject require reasons. Undo restores the exact previous committed observation
and history. Explicit draft discard retains the prior observation and still requires
a deliberate refit. No unresolved record is forced into a class.

Setup changes are guarded when work is unsaved. Save/download externally, or use
the explicit saved/discard acknowledgement before changing setup. This is an
operator acknowledgement, not software proof that a file was saved. Browser close
is not intercepted. Store GeoJSON/CSV files with their hashes; import only trusted
checkpoints or coordinator assets. Identity anchors catch inconsistent IDs/geometry/
roles but are not signatures or protection against wholesale fabrication.

Paste checkpoint JSON as one line in the Code Editor text field. Commit a text
edit with Enter or by leaving the field, then inspect the resulting message.
Use a complete current-project asset path such as
`projects/YOUR_PROJECT/assets/labels_SITE_YEAR_UNIQUE_VERSION`; confirm the same
root in the native export dialog. Completing a task is required before reload.
Saved coordinates are also JSON properties: EE asset geometry can round its last
floating-point digit. Reload restores the exact recorded coordinates only when
geometry differs by at most1e-12 degrees; larger differences are conflicts.

## Queues, blind review and missing outcomes

Embedding strata remain the default queue source. Optional WorldCover proposals
are baseline2021 only and remain visibly product proposals until reviewed; they
are not independent references. Select a role for NEW points in Queue. Existing
roles are fixed; block settings cannot reassign them. Imported pending/uncertain/
rejected decisions and original history remain in adjudication exports. Accepted
training subsets may fit only when every declared class meets the engineering
floor. An incomplete assessment set requires an explicit nonresponse/domain
rationale; never replace missing assessment points or silently report the retained
subset as representative of the whole park.

Blind final review must start before this session exposes proposals, strata or
models. Supply coordinator geometry-only reservations with original sample/unit
IDs, or explicitly prepare a NEW UNAPPROVED frame. Only dated/plain imagery is
shown. Saved decisions remain blind_reference_unqualified until an external
reference protocol/provenance process establishes qualification. Final evaluation
occurs in a separate appropriate workflow/session and destination, with explicit
checks. Fresh sessions and checkboxes cannot erase a human's previous exposure,
guarantee access restrictions or establish independence. Do not use real final
labels for engineering tests.

## Audit and export completion

The main package has one10m TIFF and nine CSVs. Optional exact-boundary/input
GeoJSON snapshots and mapped-grid hectares supplement it. Mapped hectares are
valid10m projected-grid pixel counts times0.01ha, not geodesic park area or
error-adjusted land-cover area. The boundary is masked before unmasking255; the
export request uses a10m-aligned projected rectangle to avoid polygon-cutline
zero fill. Optional30/60m derivatives use MODE and their own aligned extents.

The request ledger starts at NOT_REQUESTED, then REQUEST_CREATED or
CREATION_FAILED. It cannot automatically observe Code Editor task submission.
Record explicit observed output key/task_id/state/observed_utc receipts as needed:
SUBMITTED, RUNNING, COMPLETED or FAILED. Operator-entered receipts remain operator
reports; official API task receipts/readback establish release evidence. A FAILED
retry must name that failed task; it preserves earlier attempts. Never retry
completed outputs or treat a link/request as a completed file. Optional messages
have their own display and cannot overwrite the main failure.

Metrics evaluate first, followed by canonical raster predictions at ALL assessment
locations, joined by stable sample ID. Missing/mismatched counts and examples stop
completion. Preview tiles remain display-scale dependent; zoom changes can change
exploratory rendering. Canonical10m sampling and completed exports are the quantitative
products. A successful point audit does not certify every map pixel or its truth.

Code Editor Run/reload can clear unsubmitted task requests. Within a live run,
the output ledger safely retries missing creation requests. After a fresh session,
reconcile actual remote task IDs/states before creating anything: a stale local
REQUEST_CREATED ledger is not proof that the native task still exists. Do not
resubmit completed outputs. Free noncommercial quota restrictions can reduce
throughput; do not enable billing or switch projects to bypass a quota.

For a cheap native service test, paste tests/native_engineering.js in a temporary
Code Editor script. It imports the same core and exports a SYNTHETIC200m triangle,
not an ecological model: expected valid class0=210pixels, NoData255=190pixels and
2.1 projected-grid hectares. Submit/read back its tasks. Never merge those fixtures
into real references.

`tests/native_reviewed_fixture.js` separately exercises the shared reviewed/final
calculation with synthetic predictors and conspicuously synthetic records only.
Normal park fitting rejects these records. It is a software integration check,
not approved reference data, ecological labeling or independent accuracy.
