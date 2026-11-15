# SES410 protected-area land cover

**GEE Hammer4.0.1 is the single maintained implementation** in [v4/](v4/README.md).
It integrates the originalv0.2 core, Vedant v3.2 workflow and adapted Anthony
U1.1.2 review/recovery capabilities. Existing root scripts remain historical;
do not develop another integration there. Separate experimental v0.2c history
remains recoverable on its existing branch.

[Open Hammer in Earth Engine](https://code.earthengine.google.com/?scriptPath=users/arisol/protected-area-landcover-ses410:APP_HAMMER_v4),
press Run, and follow Setup -> Queue -> Review -> Train -> Evaluate -> Export/resume.
GEE access is separate from GitHub access. See [release verification and limits](v4/RELEASE.md),
[operations](v4/OPERATIONS.md), [migration](v4/MIGRATION.md),
[effective settings](v4/PARAMETERS.md) and [source identities](v4/SOURCE_IDENTITY.json).

Team workflow: pull current main, edit small changes under v4/, rebuild using
`python v4/tools/build.py`, run the six suites listed in the v4 README, inspect
the diff, fetch/reconcile teammates' changes, then make an ordinary commit/push.
The canonical generated module is v4/HAMMER_CORE_v4.js; its inputs are
contracts.js, workflow.js, core.js and the frozen original baseline. The UI is
v4/APP_HAMMER_v4.js. GEE deployment requires a separate saved-script update,
import reload and native verification. Keep scientific settings/schema changes
documented and preserve reference roles/identities.

WorldCover diagnostic scores are product agreement, not independently validated
map accuracy. Detailed legends and acceptance targets require team/mentor review.
Private labels, project memory, coursework, credentials and raster/evidence
packages do not belong in this public repository.
