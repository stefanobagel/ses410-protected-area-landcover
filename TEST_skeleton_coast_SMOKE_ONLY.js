// SES410 Skeleton Coast pilot. Uses the shared core; no final user-facing UI.
var hammer = require('users/arisol/protected-area-landcover-ses410:SES410_landcover');
var CONFIG = {
  mode: 'smoke_test', // candidate_preparation exports unreviewed proposals instead
  boundarySpec: {name: 'Skeleton Coast', iso3: 'NAM'}, expectedSiteId: 885,
  year: 2021, labelProperty: 'class',
  classValues: [0, 1, 2],
  classNames: {'0': 'water', '1': 'bare_or_sparse_cover', '2': 'natural_vegetation'},
  palette: ['419bdf', 'd9c29c', '397d49'],
  worldCoverCodes: [80, 60, 10, 20, 30, 90, 95, 100],
  worldCoverClasses: [0, 1, 2, 2, 2, 2, 2, 2],
  scale: 10, crs: 'EPSG:32733', trees: 200, seed: 410, tileScale: 4,
  // Inherited/preliminary computation budgets, NOT scientific adequacy thresholds.
  pilotCandidateCapPerClass: 40, pilotCandidateScale: 100,
  pilotValidationLocations: 200, pilotExclusionMeters: 100,
  createExportTasks: false, exportReferencePreparation: false,
  driveFolder: 'SES410_landcover', exportPrefix: 'skeleton_coast'
};
hammer.runPilot(CONFIG);

