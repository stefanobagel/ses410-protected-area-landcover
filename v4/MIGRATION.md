# Reference migration V4_IMPORT_2

Use `importRecords(input, sourceSchema, config, mapping, options)` as the single
batch import boundary. It accepts a parsed GeoJSON/EE-evaluated FeatureCollection,
an array of Features/flat property rows, or one Feature/row. `migrate` is the
single-record conversion used internally; it does not detect batch conflicts.
No raw CSV parsing is implemented: pass already parsed rows. `.geo` JSON is
supported. Feature geometry must be WGS84 Point; geometry and property coordinate
fields must agree exactly after numeric conversion. Non-Point/unsupported CRS,
unknown sites, class ranges and invalid numeric types are rejected explicitly.

```javascript
var cfg = hammer.config({site: 'salonga', profile: 'detailed'});
var result = hammer.importRecords(evaluatedFeatureCollection, 'vedant_v32', cfg,
  null, {sourceAsset: 'projects/your-project/assets/original_labels'});
// Inspect errors, duplicates, conflicts, restrictedFinalCount and every record's
// migration.reasons. Never fit unresolved records or bypass final-role restrictions.
```

`ready` reports clean migration structure, not fitting eligibility, reference
independence or scientific acceptance. In particular a clean pending or uncertain
record is not an accepted fitting record. Future app code must separately select
accepted evidence-complete records and perform sampling/geometry checks.

## Source semantics

| Schema | Class | Role | Site / legend | Status |
|---|---|---|---|---|
| `v02` | `reviewed_class` (including0), otherwise existing `class`; never candidate_class | candidate_training→training; validation→locked final_validation; recognized roles preserved | canonical site keys; original baseline `SES410_INITIAL_2021_V1` | accept→accepted; reject→rejected; unresolved/pending preserved |
| `vedant_v32` | `label_id` is the class, including0; -1 uncertain sentinel→null | actual dataset training→training; validation→development_assessment | Salonga National Park→salonga; Skeleton Coast Park→skeleton_coast; respective detailedV1 preset | labeled→unresolved pending evidence; uncertain preserved |
| `v4_schema1` | canonical `class` | role retained; original locked-final reassignment rejected | explicit canonical legend retained | existing status retained unless validation/conflicts require unresolved |

Explicit role/dataset conflicts are reported and quarantined, preserving the
explicit recognized role (including locked final). Unknown role/dataset/site
values fail; block settings never choose or recompute imported roles. Recorded
legacy legends contradicting the verified source schema are rejected. An existing
v4 record must explicitly declare `HAMMER_REFERENCE_V4_1`.

The actual original v0.2 review app calls `outputProperties` and serializes Point
Features; its reviewed archive deliberately retains original role/label_source.
It does not itself add approved scientific provenance. Migration therefore retains
reviewer/confidence/scene/date/notes/year/source metadata without inventing a
reference protocol or promoting a candidate source to independent truth. An accept
decision missing the stronger v4 evidence requirements becomes unresolved with
each reason, such as `Acceptance requires reference_protocol`. Complete synthetic
reference records verify the accepted path; no real labels are manufactured.

## Stable observation identity

Genuine nonempty string sample_id/unit_id values survive unchanged. `label_id`
is NEVER an identifier. Missing sample IDs use a lossless deterministic tuple:

`legacy-observation-v1:` + percent-encoded JSON of
`[source_asset, canonical_site, reference_year, exact_WGS84_coordinates, original_feature_id_or_null]`.

The original feature ID is Feature.id or system:index. Class/status/role and list
ordering are absent from the tuple. Changing a label never creates a new ID.
Coordinates are not rounded. Explicit source asset and reference year are required
to generate IDs; unknown provenance is not silently filled in. Missing unit IDs
inherit the point observation ID and are recorded as generated; that does not
establish independent ecological sampling units. For existing v4 records, loading
from a new saved asset retains original source_asset and IDs, adding the container
to a deduplicated migration.import_assets list.

All inputs/config/mappings remain unmodified. original_record retains the complete
first source Feature/row, including its original site, label_id, decision,
coordinates and properties. Subsequent v4 imports retain that root and generated
IDs, without nesting provenance repeatedly or growing repeated decisions/reasons.
Previous unresolved reasons persist until a separate explicit review/reconciliation
operation addresses them; migration is not adjudication. Defective older draft-v4
records with numeric class-derived IDs should be reimported from their preserved
original source using its real schema; the adapter does not silently repair or
certify a malformed v4 record.

## Class compatibility and conflicts

Same-legend imports need no mapping. Different legends require
`{id: 'mapping-version', sourceLegend: '...', targetLegend: '...', classes: {...}}`.
Unmapped/invalid conversions remain unresolved. Original Salonga1 is water; the
Vedant detailed1 is flooded forest. An explicit original-water1→detailed-open-water2
mapping is possible. Broad original forest0 cannot become terra firme/flooded
forest through a table: it stays unresolved even if a mapping attempts that split.
New evidence/review must supply the distinction.

Batch imports detect shared sample IDs, unit IDs, exact site/year/coordinate
observations, and supplied pixel IDs when accompanied by a grid_id. Duplicates and
conflicts retain BOTH records/history; both are unresolved. They are never silently
discarded, overwritten or counted as independent training samples. Different
labels, roles, legends or geometry under a shared identity are conflicts. A batch
error records its input index while leaving good records inspectable. Final-role
records make ready=false outside explicit finalWorkflow, without changing their
accepted decisions or exposing them through ordinary review.

The shared GEE core derives canonical pixel identities, checks actual geodesic
post-sampling proximity and park membership, and blocks incompatible cohorts.
The app connects versioned assets, checkpoint recovery and conflict reports.
Asset permissions remain governed by Earth Engine; loading cannot confer scientific
independence. Ordinary review refuses locked final references.

## Verification

`node code/v4/tests/migration.cjs` executes only the actual source exporter functions
`toFeature` (Vedant) and `outputProperties` (v0.2), using synthetic state and mocked
EE serialization. It exercises the exported structures through importRecords/migrate;
no frozen source data is evaluated. Additional malformed-row fixtures exercise
rejection and conflicts. Run alongside the contract, application, bundled-core and preserved v0.2 suites.
See RELEASE.md for the dated native verification and remaining data-dependent paths.

## Anthony U1.1.2 adapter and checkpoint drafts

Choose u1_1 explicitly. Supply sourceVersion1.1.2 and the actual sourceAsset (or
checkpoint origin); queue_id/version markers are checked where present. The adapter
preserves sample/unit IDs, exact geometry, reference year, original legend/source
and history. reviewed_class and label_id are class values, including0. They never
become observation identifiers. Missing reference protocol/evidence stays unresolved.

Generic U1 validation is restricted/unresolved until roleResolution and a nonempty
roleProvenance explicitly identify development_assessment or the protected final
workflow. Ordinary imports reject restricted/final material without replacing local
work. Product holdouts cannot be promoted to independent final data by renaming a
column. Cross-legend mapping remains explicit; broad forest cannot provide a
dry/flooded split. No U1.1.3 source was supplied or inferred.

Accepted evidence uses one shared strict calendar validator. Invalid dates, free
text/ranges without matching-year acquisitions or malformed review dates/timestamps
retain originals but require review. HAMMER_CHECKPOINT_V4_1 preserves committed
records plus pending_draft and checkpoint_identity fields. Nested fields are JSON
transported through EE assets/CSV/GeoJSON and decoded on import. Inconsistent IDs,
geometry, role, site, year or legend are rejected; duplicate/conflicting observations
are reported without overwriting local state. These are consistency checks, not
cryptographic authentication. Preserve trusted original frames/file hashes.

A validated explicit accepted review can resolve active import warnings. Those warnings
move into immutable resolution/history entries; migration reload preserves the
accepted decision and its resolution history. Known canonical roles cannot change
on reimport. Original-record product lineage remains checked for final references;
renaming a label_source column cannot erase it.

Asset transport preserves exact coordinate arrays as JSON fields in addition to
geometry. The native service was observed to round geometry by up to3.55e-15
degrees. Decoding restores the original recorded coordinates only within a1e-12
degree serialization tolerance, and rejects larger discrepancies. Older v4
checkpoints can recover their exact coordinates from checkpoint_identity.
Frozen REVIEW_V1 records are not modified or migrated in place.
