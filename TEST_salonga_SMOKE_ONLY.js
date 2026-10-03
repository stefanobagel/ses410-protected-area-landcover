// SES410 Salonga pilot. The model procedure is identical to Skeleton Coast.
var hammer = require('users/arisol/protected-area-landcover-ses410:SES410_landcover');
var CONFIG = {
  mode: 'smoke_test',
  boundarySpec: {name: 'Salonga', iso3: 'COD'}, expectedSiteId: 555697863,
  year: 2021, labelProperty: 'class',
  classValues: [0, 1, 2],
  classNames: {'0': 'tree_cover_forest_candidate', '1': 'water', '2': 'nonforest_natural_vegetation'},
  palette: ['006400', '419bdf', 'a6c96a'],
  worldCoverCodes: [10, 80, 20, 30, 90],
  worldCoverClasses: [0, 1, 2, 2, 2],
  scale: 10, crs: 'EPSG:32734', trees: 200, seed: 410, tileScale: 4,
  // Same preliminary pilot budgets; no accuracy/F1/sample-count pass thresholds.
  pilotCandidateCapPerClass: 40, pilotCandidateScale: 100,
  pilotValidationLocations: 200, pilotExclusionMeters: 100,
  createExportTasks: false, exportReferencePreparation: false,
  driveFolder: 'SES410_landcover', exportPrefix: 'salonga'
};
hammer.runPilot(CONFIG);
