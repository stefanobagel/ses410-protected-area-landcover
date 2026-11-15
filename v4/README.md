# GEE Hammer v4.0.1

One maintained protected-area mapping workflow: annual Google Satellite Embeddings,
site-specific Random Forest models, traceable labels, honest evaluation and exports.
User alias v0.4 refers to this same integration; paths, GEE module names and reference
schema identities remain v4, without a parallel implementation.
Demonstration sites: Skeleton Coast, Namibia, and Salonga, DRC.

## Launch

Open [APP_HAMMER_v4 in Code Editor](https://code.earthengine.google.com/?scriptPath=users/arisol/protected-area-landcover-ses410:APP_HAMMER_v4),
using an authorized Earth Engine account/project, and press **Run**. The versioned
entrypoint imports `users/arisol/protected-area-landcover-ses410:HAMMER_CORE_v4`.
Earlier v0.2 deployments retain their original names for recovery. For a personal
installation, save the generated core and UI in your authorized GEE repository
and change that single require path. GEE access/deployment and GitHub publication
are separate; GitHub access alone does not grant writer access to the GEE repo.

Use Setup -> Queue -> Review -> Train -> Evaluate -> Export/resume. Available
years are queried from the catalog. Choose an explicit baseline or detailed
legend and spatial profile; accepted labels need dated evidence. Missing real
references do not prevent the clearly labelled WorldCover2021 diagnostic.

Press Enter to commit text-box changes before loading/running. The named
`diagnostic_2021` profile preserves original preparation (40/class at100m,
200 holdouts, seeds410/411/412, pre-sampling exclusion100m). Positive additional
post-sampling gates may reject historical cohorts. An explicitly selected0m
additional gate may reproduce the old diagnostic while retaining literal overlap
checks and reporting actual distances; it is not a scientifically justified
minimum. General100m and block500m remain provisional.

See [OPERATIONS.md](OPERATIONS.md), [MIGRATION.md](MIGRATION.md), and the
[effective parameter register](PARAMETERS.md) before working with real references.
Results are unweighted sample summaries; WorldCover agreement is not independent
map accuracy. Detailed presets and all proposed targets require scientific review.

## Canonical source and build

- `APP_HAMMER_v4.js`: one editable operating UI.
- `contracts.js`: authoritative configuration/legends, repaired migration,
  evidence checks, metric definitions and run lifecycle.
- `workflow.js`: shared draft/checkpoint identity, atomic commit and output-request contracts.
- `core.js`: shared GEE boundary, imagery, queue, sampling, geodesic audit,
  reference fitting and export services.
- `baseline/`: frozen v0.2 engine/UI build and comparison inputs, without private
  REVIEW_V1 point fixtures. It is not a second maintained app.
- `tools/build.py`: deterministic guarded bundle/derivation. Removes unused legacy
  CONFIG, wires explicit RF settings, actual sampled checks and run timing. JS
  source is normalized to ASCII escapes for reliable Git-backed GEE loading.
- `HAMMER_CORE_v4.js`: generated module; rebuild instead of hand-editing.

From GitHub repository root:

```
python v4/tools/build.py
node v4/tests/contracts.cjs
node v4/tests/migration.cjs
node v4/tests/application.cjs
node v4/tests/core.cjs
node v4/tests/workflow.cjs
node v4/baseline/tests/verify_v0_2.cjs
```

The local SES410 workspace uses the prefix `code/v4/`. Node tests use synthetic
state/mocked service boundaries where stated. Exact exporter excerpts test real
legacy formats without publishing private source fixtures. Native GEE runs and
export readback are separate evidence; tests alone do not establish accuracy.

## Integration decisions and shared development

Original v0.2 supplies the core, reference integrity, missing-class metrics,
configuration snapshots/callback guards and GIS/provenance exports. Vedant's v3.2
at `b10d328eec2285a5d7b1cc6dbb6b8f42482a69c9` supplies the integrated workflow,
cluster-distributed incremental queues, manual additions, review ergonomics,
saved-label workflow, imagery/year controls and provisional detailed presets.
Anthony's supplied U1.1.2 (SHA256 `ee2a8c52b7daf94b0bc6b8f771f93c0c32c321423e26d8b202d22214667d9a1d`)
contributes dated scene browsing/evidence capture, class save-and-next controls,
protected blind preparation, review recovery, area/archive outputs and output retries.
Its U1.1 guide and U1.1.3 faults PDF are different revisions; no absent source/tests
were invented. Confirmed draft/undo, optional-message and ambiguous-probe defects
were avoided or repaired in the shared architecture. All three sources were adapted deliberately to the common schema/core. v0.2b and v0.2c retain
their separate historical/experimental identities and are not v4 dependencies.

See [RELEASE.md](RELEASE.md) for actual engineering verification and limits.

The team develops **main**. Pull current main; make a small tested change in v4/;
rebuild and run the suites; inspect the diff; fetch again and reconcile concurrent
work before an ordinary history-preserving commit/push. Never discard another
teammate's work with a force push. Record scientific setting/schema changes and
comparison implications. Use configuration profiles for development experiments,
not another maintained integration branch. Deployment to GEE is a separate step:
save the module/UI, reload imports, exercise normal entrypoints and verify source
identity. Keep earlier working deployments recoverable.

Publish only source/tests/team docs. Keep labels, coursework, memory, credentials,
backups and private verification packages outside GitHub. Root historical scripts
remain recoverable; this directory is the single maintained implementation.

Jiwei/team decisions still needed: final detailed legend definitions, approved
review/reference protocols and assets, reviewers, sampling population/design and
weights, accepted year-comparison scope and justified sample/score/coverage targets.
The completed November2 exclusion study established no optimum/minimum distance,
independent accuracy or causal inflation estimate.

## Review and delivery safeguards

Use a wide browser, or the stack-controls/map button in narrow panes. Dated scenes
are point/year-specific; annual composites are orientation. Attach evidence explicitly,
commit the reviewed draft, and save checkpoints externally. Displaying imagery does
not change labels. GeoJSON is the resumable checkpoint; CSV is its audit companion.
Versioned label assets need task completion and a fresh-session reload check. No
automatic durable save or browser-close protection is claimed.

Blind review starts in a fresh unexposed session, uses geometry-only reservations
and dated imagery, and excludes proposals/model views. A newly generated frame is
unapproved proposed material, never a replacement for frozen REVIEW_V1. Human
exposure, sampling design and independence still require coordinator governance.

Canonical exports now use an aligned rectangle around the masked park, retaining
NoData255 outside the park and valid class0. Earlier v4 polygon-region TIFFs were
found to store outside pixels as0: their assessment predictions remain regression
evidence, but those TIFFs are superseded for delivery. Per-output creation ledgers
allow safe missing-request retries; submitted/running/completed are distinct remote
states. Optional area is projected-grid mapped hectares, without error adjustment.
