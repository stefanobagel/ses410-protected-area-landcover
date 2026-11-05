# v0.2c status — updated November5,2026

## Current live-service qualification

This section supersedes the November4 no-authentication/no-inference statements
below, which describe the original build. Original v0.2 and frozen references
remain unchanged; v0.2c is experimental, separate from v0.2b.

- Official Google OAuth verified the authorized account/project with a real EE
  request. Project registration is REGISTERED_NOT_COMMERCIALLY. No API, billing
  or IAM changes were made.
- Both parks completed small(12 train/20 holdout) and default(120/200) WorldCover
  RF diagnostics through v0.2c. Defaults:83.0% Skeleton Coast,97.5% Salonga product
  agreement, not independent accuracy. Missing class support withholds macro F1.
- Actual PNG tiles for both maps were retrieved/decoded. Browser rendering is
  still a separate pending check.
- Twelve default exports were submitted. Skeleton Coast's six completed files
  were downloaded and passed metric/coordinate/raster/grid/NoData/provenance
  checks. Salonga completion/readback remains in progress at this revision.
- Free hosted Linux CPU CI strictly loaded the complete pinned Satlas checkpoint
  and its trained head. Real clear TCI queries for both parks returned valid
 12x512x512 probabilities. Verified checkpoint SHA256 is in config.json.
  CPU service execution is not Colab GPU qualification or label accuracy.
- After the user verified arisol and created the separate GEE repository, both
  companion scripts were uploaded/read back byte-for-byte at commit
 7a3ce86ce896030f99012123340c2940611de20d. Full Satlas UI remains the notebook.

Live failures fixed: UI mode overwrote the backend execution enum; request IDs
were mistaken for server task IDs; per_class download suffix was truncated.
Existing jobs recover by unique descriptions without resubmission. Stale review
views are guarded, review history is immutable, and missing CUDA stops explicitly.

Teacher qualification is still open: the clear Skeleton Coast probe was predicted
as crop(about55.5%), outside its legend; the Salonga probe was predicted as
water(about92.4%). These are model proposals, not accepted human labels. Never
force unmapped classes or drop difficult holdout points to obtain a fit.

The user selected free checks only. No metered TinyFish automation or Vertex
resources were started. For the remaining GPU probe, use an available free T4
Colab runtime, Run all, Connect Google, then Verify GPU teacher. A credential-free,
source-hashed receipt is saved to SES410_v02c on Drive. This does not buy compute
units, fit RF or deploy an endpoint. Complete Colab UI/teacher-assisted fitting
and optional Vertex qualification remain pending.

## Historical original-build status — November4

User-authorized experimental c-branch of v0.2, not a replacement release or team/
mentor scientific approval. Main project baseline and frozen evidence remain intact.

Implemented: self-contained Colab UI; original v0.2 backend reuse; Satlas complete
trained-head loader; exact ESA TCI retrieval; explicit pseudo-label provenance;
training review; RF/map/metrics; original diagnostic/approved-reference paths;
six Drive exports and task polling; optional authenticated Vertex custom container,
build/deploy/undeploy controls; separate GEE companion scripts.

Cloud target: `project-4516fd38-855a-44f4-a31`, supplied by the user.
The user also explicitly authorized a new GitHub `v0.2c` branch through stefanobagel.
The remote parent contains older standalone sources, not the complete maintained
local v0.2. Therefore this package includes exact local baseline snapshots and adds
only a new `branches/v0.2c/` tree; the default branch's files are preserved.

No authenticated Google runtime is available to the building chat. No GEE script
repository, Vertex endpoint, Cloud Build job, Google IAM/API/billing change or live
RF fit has been created by this build. The requested GEE repository is prepared,
but **not created remotely**. No EECU-hours, teacher accuracy or export completion
is claimed. No models were tested on either park.

Local Windows PyTorch import was blocked by application-control policy. That
policy was not bypassed. Actual checkpoint loading/inference remains unverified
here; a Colab GPU run must establish it. Public Sentinel storage listing, exact
TCI lookup and a real512×512 RGB window read succeeded; this was a retrieval
check on a public tile, not a park classification experiment.

Detailed command outcomes and source-preservation hashes are recorded in the
private project verification package. Shared project memory links that evidence;
private memory, credentials and review data are not published to GitHub.
