# SES410 Hammer v0.2c

Experimental **c-branch of the original v0.2**, with a Satlas teacher for RF
pseudo-labels. This is separate from the preserved alternative v0.2b.
The original v0.2 backend and UI are included byte-for-byte under `baseline/`.
The notebook executes that backend through a Node bridge; it does not substitute
a different RF implementation or import the alternative branch's spatial design.

[Open the single-page Colab interface](https://colab.research.google.com/github/stefanobagel/ses410-protected-area-landcover/blob/v0.2c/branches/v0.2c/SES410_v0_2c.ipynb).

1. Open the notebook, choose a GPU runtime if available, then **Runtime → Run all**.
2. In the interface, click **Connect Google**. Sign in with the authorized account.
   Project is prefilled as `project-4516fd38-855a-44f4-a31`.
3. Choose a park and mode. For Satlas, click **Prepare Satlas labels**. Initial use
   downloads the complete trained teacher. Google sign-in popups are required;
   subsequent mapping, review and export controls remain on this notebook page.
4. Use **Training review** to inspect flagged points and a deterministic10% audit of confident
   proposals. Corrections/rejections require a reviewer and evidence note.
5. Click **Generate RF map**. View map/metrics, check coarse coverage, start six
   Drive exports and refresh their status here. Download the run/review archive
   before disconnecting: Colab storage is temporary.

Defaults retain 2021, both v0.2 legends, 64 AlphaEarth bands, 200 trees, seed410,
40 candidates/class, 200 diagnostic holdout locations and a provisional100m
exclusion. Analyst controls permit smaller explicitly recorded smoke experiments.
Teacher preparation adds a grid-snap safety guard (10√2+1m) before sampling and
checks actual cross-set distances afterward. This is an implementation safeguard,
not evidence that100m is scientifically sufficient. Stratification is initially
WorldCover-based; teacher labels can change actual class counts. Missing classes
stop fitting rather than being silently filled or relabeled.

The **original WorldCover diagnostic** and **approved-reference evaluation** are
also available in the same interface. Approved mode retains the original
metadata/geometry/ID/pixel/class-support checks and requires separate accepted
training/locked validation assets, protocol/design and explicit attestation.

## What the teacher reads

Satlas reads original ESA **Sentinel-2 L1C TCI RGB**, normalized by255. GEE selects
a2021 scene and the notebook reads a512×512 chip from the public Sentinel bucket.
It does not replace TCI with an arbitrary RGB stretch. Scene cloud cover≤20%,
central QA60 clear and valid image context are preliminary screening; context
clouds and annual class representativeness still need review. Missing exact TCI
stops the point rather than inventing a fallback. Original scene IDs, dates,
chip transforms/hashes, model revision and checkpoint SHA256 accompany labels.

Teacher outputs use the trained12-channel land-cover head (background plus11
classes). The provisional mappings in `config.json` align broad classes with
the existing two legends. Unrepresented land covers remain unmapped. A missing
holdout label stops the experiment; holdout points are never silently discarded.
Teacher confidence only flags review; it is not calibrated accuracy or approval.
The RF still reads AlphaEarth64D in Earth Engine, not RGB.

## Optional Vertex AI, on the same page

Colab inference is the default and needs no hosted endpoint. The **Optional
Vertex** tab can build/deploy the same teacher and stop its serving replica.
Vertex uses the **same Google Cloud project**. It requires enabled Vertex AI,
Cloud Build, Artifact Registry and Storage APIs, billing and existing sufficient
user/build-service-account permissions. Setup does not enable billing, change
IAM or create keys. Permission/API failures are surfaced for resolution.

Deployment creates a dedicated container repository, build bucket, model and
endpoint. One `n1-standard-4` CPU replica is billable while deployed; use
**Stop v0.2c Vertex serving** afterward. Images/models/build archives remain
stored. Partial resource IDs are saved in `vertex-resources.json`; retain it
for recovery. This CPU path is for bounded tests, not a throughput claim.
The endpoint uses Vertex-authenticated PNG requests. No public tunnel is needed.
This is the notebook's authenticated REST integration, not an already-qualified
`ee.Model.fromVertexAi` graph adapter.

## Separate GEE repository

Requested target: `users/arisol/protected-area-landcover-ses410-v0-2c`.
`gee/` contains a generated companion core/UI for that separate repository.
Those scripts retain baseline Code Editor modes; the integrated Satlas UI is
the notebook above. Selecting a Cloud project does **not** create a GEE script
repository. Repository creation/upload requires an authenticated GEE session;
see `STATUS.md` for actual remote state. Do not overwrite the original repository.

## Verification and limits

See `STATUS.md` and `tests/`. Local contracts, real module construction and public
imagery reads do not prove authenticated GEE fits, real teacher accuracy, Vertex
deployment, completed exports or independent map accuracy. The frozen final
reference files are never loaded by the teacher. Satlas includes WorldCover
supervision; teacher-student/WorldCover agreement is not independent validation.
No minimum buffer, final accuracy threshold, fine substrate distinction or
forest flooding distinction is established by this branch.

Use `python -B -m unittest discover -s tests -v`, `node tests/test_extension.cjs`
and the original v0.2 suite in the parent project. `tools/build_package.py`
regenerates GEE companions and the self-contained notebook deterministically
from the explicit source allowlist. Runtime caches, credentials, rasters and
review records are excluded from the public package.

## Attribution

Satlas source: Allen Institute for AI, pinned commit
`c8b9aa5d4acdd3e4f58eb7cbb28ac18bb12c985f`;
[source/inference](https://github.com/allenai/satlas/blob/c8b9aa5d4acdd3e4f58eb7cbb28ac18bb12c985f/CustomInference.md),
[normalization](https://github.com/allenai/satlas/blob/c8b9aa5d4acdd3e4f58eb7cbb28ac18bb12c985f/Normalization.md).
Pretrained weights: Allen AI SatlasPretrain, ODC-BY,
Hugging Face revision `b1f8de04dacf9f9ed9640fe32484947710b47ede`.
Retain attribution and the [weight license](https://github.com/allenai/satlas/blob/c8b9aa5d4acdd3e4f58eb7cbb28ac18bb12c985f/DataLicense).
No new license is assigned to existing SES410 source.
Google/DeepMind AlphaEarth, ESA/Copernicus Sentinel-2, ESA WorldCover and
WDPA attribution/use conditions continue to apply.
