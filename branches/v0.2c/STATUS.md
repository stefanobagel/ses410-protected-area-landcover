# v0.2c status — November 5, 2026

Experimental c-branch of original v0.2, separate from v0.2b. The original baseline
and frozen evidence remain unchanged. This branch is not fully qualified end to end.

- Real Google OAuth/EE access verified for the configured project/account;
  project registration is REGISTERED_NOT_COMMERCIALLY. No API/billing/IAM changes.
- Four real WorldCover RF diagnostics: small twelve train/twenty holdout and
  default120/200 for each park. Default product agreement83.0% Skeleton Coast and
  97.5% Salonga; class support0/191/9 and200/0/0. Full-legend macro F1 withheld.
  These are not independent accuracy or positive teacher-assisted fitting results.
- Both map PNG tiles decoded. All twelve default export tasks completed, were
  downloaded and passed readback: metrics, undefined values/support, coordinates,
  raster-point agreement, class codes, CRS,10m grid, NoData255 and provenance.
  Full-grid availability:168,456,973 Skeleton Coast and333,460,878 Salonga interior
  pixel centers mapped, zero unmapped under the recorded GDAL center convention.
- Observed export batch usage:8.6078922452 EECU-hours Skeleton Coast and
  79.8314010459 Salonga,88.4392932911 total. Interactive usage and dollar invoice
  unobserved. Noncommercial compute still consumes quota; no paid resources started.
- Free hosted Linux CPU tests strictly loaded the complete pinned Satlas checkpoint
  and trained head, inferred real clear TCI for both parks, and verified finite
  12x512x512 probabilities plus image/model/georeferencing identities. The embedded
  notebook bootstrap, dependency installation and interface instantiation also
  passed on Linux. CPU tests are not Colab GPU or browser operation qualification.
- Clear teacher probes:Skeleton Coast crop(~55.5%, unmapped in its legend),
  Salonga water(~92.4%). These need review and are not confirmed class truth.
  Unmapped labels and insufficient support remain visible stops.
- Separate GEE repository users/arisol/protected-area-landcover-ses410-v0-2c
  deployed/read back byte-for-byte at7a3ce86ce896030f99012123340c2940611de20d.
  It supplies baseline companion functionality; the full Satlas UI is Colab.
- Local checks:30 Python contracts,6 c-branch JS contracts, source/notebook identity,
  complete offline graph/SDK construction; inherited23 v0.2 contracts separately.
  The dated private evidence distinguishes each test revision and real service runs.

Fixed live failures:backend mode collision, request versus server task IDs,
per_class download naming. Jobs recover without duplicate submission. Review
history is immutable; changed settings/reviews invalidate results, stale review
views stop, missing CUDA stops explicitly. Readback includes full-grid coverage.

User permits free checks and an available free T4. No metered TinyFish automation,
compute-unit purchases or Vertex resources were started. To obtain the pending
GPU receipt:open Colab, select an available free T4, Runtime → Run all, Connect
Google → Verify GPU teacher; leave open. It saves a credential-free source-hashed
receipt to SES410_v02c on Drive. This does not fit RF or deploy an endpoint.

Remaining:actual Colab GPU/auth/widget sequence, both-park positive teacher
proposal→review→RF/default runs, approved-reference execution when accepted data
exist, measured review savings, and optional Vertex live qualification/cleanup.
Vertex remains gated until Colab succeeds and bounded spending/access is approved.
