/* v0.2c compatibility entrypoint. Integrated teacher/review/exports UI: SES410_v0_2c.ipynb. */
/** SES410 Version 0.2.0: Anthony's interaction pattern + shared Hammer backend.
 * GEE Code Editor prototype, not a published customer app.
 * Save the companion module as SES410_landcover_v0_2 in this repository first.
 * Frozen REVIEW_V1 originals and the separate review app are not changed.
 */
var hammer = require('users/arisol/protected-area-landcover-ses410-v0-2c:SES410_landcover_v0_2c');
var VERSION = '0.2c';
var DIAGNOSTIC = 'Diagnostic demonstration';
var APPROVED = 'Approved-reference evaluation';
var SITES = {
  'Skeleton Coast Park': {
    key: 'skeleton_coast', name: 'Skeleton Coast', iso3: 'NAM', id: 885,
    crs: 'EPSG:32733', palette: ['419bdf', 'd9c29c', '397d49'],
    names: {'0': 'Water', '1': 'Bare / sparse cover', '2': 'Natural vegetation'},
    codes: [80, 60, 10, 20, 30, 90, 95, 100], mapping: [0, 1, 2, 2, 2, 2, 2, 2]
  },
  'Salonga National Park': {
    key: 'salonga', name: 'Salonga', iso3: 'COD', id: 555697863,
    crs: 'EPSG:32734', palette: ['006400', '419bdf', 'a6c96a'],
    names: {'0': 'Tree cover / forest candidate', '1': 'Water', '2': 'Nonforest natural vegetation'},
    codes: [10, 80, 20, 30, 90], mapping: [0, 1, 2, 2, 2]
  }
};

var revision = 0;
var completed = null;
var busy = false;
var map = ui.Map();
map.setOptions('SATELLITE');
map.setCenter(15, -15, 3);
var panel = ui.Panel({style: {width: '390px', padding: '12px'}});
ui.root.clear();
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));
ui.root.add(panel);
ui.root.add(map);

function heading(text) {return ui.Label(text, {fontWeight: 'bold', margin: '16px 0 5px 0'});}
function note(text) {return ui.Label(text, {fontSize: '12px', color: '#555555', whiteSpace: 'pre-wrap'});}
function trim(value) {return String(value || '').replace(/^\s+|\s+$/g, '');}
function percent(value) {return value === null || value === undefined ? 'Not estimable' : (100 * value).toFixed(1) + '%';}
function score(value) {return value === null || value === undefined ? 'Not estimable' : value.toFixed(3);}
function say(text, error) {
  status.setValue(text);
  status.style().set('color', error ? '#a51b23' : '#333333');
}
function invalidate(message) {
  revision += 1; // Invalidates every pending backend / coverage callback.
  completed = null;
  busy = false;
  map.layers().reset();
  results.clear();
  exportButton.setDisabled(true);
  generate.setDisabled(false);
  coverageButton.setDisabled(true);
  coverageLabel.setValue('Coverage has not been measured for this selection.');
  if (message) say(message);
}

panel.add(ui.Label('Protected Area Land Cover', {fontSize: '23px', fontWeight: 'bold'}));
panel.add(note('Version 0.2c | baseline compatibility UI; Satlas runs in the Colab notebook'));
panel.add(note('Generate a supported map, inspect its evidence and limits, then prepare exports. Independent accuracy is not established by a diagnostic run.'));
panel.add(heading('1. Select a supported study area'));
var siteSelect = ui.Select({items: Object.keys(SITES), value: 'Skeleton Coast Park', style: {stretch: 'horizontal'}});
panel.add(siteSelect);
panel.add(ui.Label('Year: 2021', {fontWeight: 'bold'}));
panel.add(note('Other years require matching reference evidence and a new documented configuration.'));
panel.add(heading('2. Mapping purpose and legend'));
panel.add(ui.Label('Broad land-cover distribution'));
var legend = ui.Panel();
panel.add(legend);
panel.add(note('Provisional site legend. Mixed pixels, omitted covers and seasonal classes still require a scientific protocol. Classes cannot be unchecked to force a simpler map.'));
panel.add(heading('3. Choose an evidence mode'));
var modeSelect = ui.Select({items: [DIAGNOSTIC, APPROVED], value: DIAGNOSTIC, style: {stretch: 'horizontal'}});
panel.add(modeSelect);
var modeDescription = note('');
panel.add(modeDescription);

var analystToggle = ui.Checkbox('Show analyst setup', false);
panel.add(analystToggle);
var analyst = ui.Panel({style: {shown: false}});
panel.add(analyst);
analyst.add(note('Site-specific inputs. Switching park clears reference setup to prevent reusing another site\'s approval. No assets or review files are uploaded by this interface.'));
analyst.add(ui.Label('Approved training asset ID'));
var trainingId = ui.Textbox({placeholder: 'projects/.../assets/... or users/...', style: {stretch: 'horizontal'}});
analyst.add(trainingId);
analyst.add(ui.Label('Locked validation asset ID'));
var validationId = ui.Textbox({placeholder: 'A separate point collection', style: {stretch: 'horizontal'}});
analyst.add(validationId);
analyst.add(ui.Label('Sampling design and weighting limits'));
var designBox = ui.Textbox({placeholder: 'Document population, selection and estimator limits', style: {stretch: 'horizontal'}});
analyst.add(designBox);
analyst.add(ui.Label('Reference / evidence protocol and version'));
var protocolBox = ui.Textbox({placeholder: 'Dated evidence, acceptance and adjudication protocol', style: {stretch: 'horizontal'}});
analyst.add(protocolBox);
analyst.add(ui.Label('Approved minimum train / validation separation (m)'));
var separationBox = ui.Textbox({value: '100', style: {stretch: 'horizontal'}});
analyst.add(separationBox);
analyst.add(note('100 m is an inherited provisional setting, not a justified universal distance. Enter the distance required by the approved design. Exact IDs, shared units and analysis pixels are checked regardless.'));
var approvalCheck = ui.Checkbox('Coordinator confirms accepted references, independent evidence and a locked validation set unused for tuning', false);
analyst.add(approvalCheck);
analyst.add(note('A checkbox records an explicit attestation; software cannot prove label truth, scientific independence or approval. App reviewed=1 alone is insufficient.'));
analyst.add(note('Diagnostic defaults: 200 trees; seed 410; up to 40 proposals/class at 100 m; 200 reserved holdout locations; 100 m exclusions. These are development settings, not scientific requirements.'));
analyst.add(ui.Label({value: 'Open the separate reference-review app', targetUrl: 'https://arisol.users.earthengine.app/view/ses410-reference-review', style: {color: '#1967d2'}}));
analyst.add(note('Validation reviewers should use the separate blind-review workflow without viewing these diagnostic maps or training proposals. Save CSV and GeoJSON checkpoints. A coordinator must approve and prepare import copies.'));

panel.add(heading('4. Generate the map'));
var generate = ui.Button({label: 'Generate land-cover map', style: {stretch: 'horizontal'}});
panel.add(generate);
var clearButton = ui.Button({label: 'Clear result / cancel pending display', style: {stretch: 'horizontal'}});
panel.add(clearButton);
var status = ui.Label('Choose a park and evidence mode, then generate.', {whiteSpace: 'pre-wrap'});
panel.add(status);
panel.add(heading('5. Inspect quality and limitations'));
var results = ui.Panel();
panel.add(results);
var coverageButton = ui.Button({label: 'Measure preliminary coverage estimate', disabled: true, style: {stretch: 'horizontal'}});
var coverageLabel = note('Coverage has not been measured for this selection.');
panel.add(coverageButton);
panel.add(coverageLabel);
panel.add(note('Coverage estimate uses a 500 m check grid and all 64 embedding masks. It is not a certified 10 m full-area coverage result or an acceptance test.'));
panel.add(heading('6. Prepare outputs'));
var exportButton = ui.Button({label: 'Create six export tasks', disabled: true, style: {stretch: 'horizontal'}});
panel.add(exportButton);
panel.add(note('GeoTIFF at 10 m, prediction table, summary, per-class metrics, confusion cells and provenance. CRS is site-specific; NoData is 255. Start tasks in the Code Editor Tasks tab. Task creation does not confirm file completion.'));
panel.add(note('WDPA current boundaries are mutable. Pin the geometry/release and resolve boundary/coverage questions before final scientific reporting. No final accuracy or coverage pass threshold has been adopted here.'));

function updateLegend() {
  legend.clear();
  var site = SITES[siteSelect.getValue()];
  [0, 1, 2].forEach(function(code) {
    legend.add(ui.Panel([
      ui.Label('', {backgroundColor: '#' + site.palette[code], padding: '8px', margin: '3px 8px 3px 0'}),
      ui.Label(code + ': ' + site.names[String(code)], {margin: '3px 0'})
    ], ui.Panel.Layout.flow('horizontal')));
  });
}
function updateMode() {
  var approved = modeSelect.getValue() === APPROVED;
  modeDescription.setValue(approved ?
    'Requires analyst-configured accepted training and separately locked validation assets. Results remain an unweighted reference-sample evaluation; no automatic scientific pass is claimed.' :
    'WorldCover-derived training and holdout labels exercise the pipeline. Results measure product agreement, not independent map accuracy.');
  if (approved) analystToggle.setValue(true);
}
function clearReferenceSetup() {
  trainingId.setValue('', false);
  validationId.setValue('', false);
  designBox.setValue('', false);
  protocolBox.setValue('', false);
  approvalCheck.setValue(false, false);
}
siteSelect.onChange(function() {
  clearReferenceSetup();
  updateLegend();
  invalidate('Park changed. Previous results and reference approval cleared.');
});
modeSelect.onChange(function() {updateMode(); invalidate('Evidence mode changed. Generate a new run.');});
analystToggle.onChange(function(shown) {analyst.style().set('shown', shown);});
[trainingId, validationId, designBox, protocolBox, separationBox].forEach(function(widget) {
  widget.onChange(function() {
    approvalCheck.setValue(false, false);
    invalidate('Analyst inputs changed. Reconfirm reference approval and generate again.');
  });
});
approvalCheck.onChange(function() {invalidate('Reference attestation changed. Generate a new run.');});
clearButton.onClick(function() {invalidate('Result cleared. Server work already submitted may continue; its callbacks cannot restore cleared results.');});

function snapshot() {
  var siteName = siteSelect.getValue();
  var site = SITES[siteName];
  var approved = modeSelect.getValue() === APPROVED;
  var separation = Number(trim(separationBox.getValue()));
  if (approved) {
    if (!approvalCheck.getValue()) throw new Error('Analyst setup requires explicit coordinator confirmation.');
    var idPattern = /^(projects\/[^\s]+\/assets\/[^\s]+|users\/[^\s]+\/[^\s]+)$/;
    if (!idPattern.test(trim(trainingId.getValue())) || !idPattern.test(trim(validationId.getValue())))
      throw new Error('Enter both Earth Engine point-collection asset IDs in analyst setup.');
    if (trim(trainingId.getValue()) === trim(validationId.getValue()))
      throw new Error('Training and locked validation must use different asset IDs.');
    if (!trim(designBox.getValue()) || !trim(protocolBox.getValue()))
      throw new Error('Document the sampling design and reference protocol in analyst setup.');
    if (!trim(separationBox.getValue()) || !isFinite(separation) || separation < 0)
      throw new Error('Separation must be a finite nonnegative distance from the approved design.');
  }
  // Deep copy all site arrays and dictionaries; subsequent UI edits never alter this object.
  var frozenSite = JSON.parse(JSON.stringify(site));
  return {site: frozenSite, siteName: siteName, approved: approved,
    trainingAsset: trim(trainingId.getValue()), validationAsset: trim(validationId.getValue()),
    design: trim(designBox.getValue()), protocol: trim(protocolBox.getValue()), separation: separation};
}

function displayReport(report, result, selection, started) {
  results.clear();
  results.add(ui.Label(selection.approved ? 'Reference-sample evaluation complete' : 'Diagnostic complete - NOT independently validated',
    {fontWeight: 'bold', color: selection.approved ? '#333333' : '#a51b23', whiteSpace: 'pre-wrap'}));
  results.add(ui.Label(selection.siteName + ' | 2021 | Run ' + result.config.runId));
  results.add(ui.Label((selection.approved ? 'Overall sample accuracy: ' : 'Overall product agreement: ') + percent(report.overall_accuracy)));
  results.add(ui.Label('Macro F1, full legend: ' + score(report.macro_f1_full_legend)));
  results.add(note('Macro F1 is withheld if any declared class lacks reference observations. Missing support is not evidence that a class is absent from the park.'));
  report.per_class.forEach(function(row) {
    results.add(ui.Label(row.class_name, {fontWeight: 'bold'}));
    results.add(note('Reference n=' + row.reference_n + '; predicted n=' + row.prediction_n +
      '\nPrecision ' + score(row.precision_user) + ' | Recall ' + score(row.recall_producer) + ' | F1 ' + score(row.f1)));
  });
  results.add(note('Confusion matrix: reference rows / predicted columns\n' + report.matrix.map(function(row) {return row.join('   ');}).join('\n')));
  results.add(note('Training n=' + report.training_n + '; evaluation n=' + report.evaluation_n +
    '\nElapsed to metric evaluation: ' + ((Date.now() - started) / 1000).toFixed(1) + ' s. This is not EECU use or full-export runtime.'));
  results.add(note('Unweighted sample summaries; no design-weighted uncertainty intervals or full-park accuracy qualification. Inspect class support, evidence dependence and boundary provenance.'));
  print('V0.2 frozen run configuration', {version: VERSION, runId: result.config.runId,
    site: selection.siteName, year: 2021, mode: result.status, crs: result.config.crs, scale: result.config.scale});
}

generate.onClick(function() {
  if (busy) return;
  // Clear old results even if the new settings fail local checks.
  invalidate();
  var selection;
  try {selection = snapshot();} catch (error) {say(error.message, true); return;}
  var token = revision;
  var started = Date.now();
  var cfg = {
    mode: 'smoke_test', boundarySpec: {name: selection.site.name, iso3: selection.site.iso3},
    expectedSiteId: selection.site.id, year: 2021, labelProperty: 'class',
    classValues: [0, 1, 2], classNames: selection.site.names, palette: selection.site.palette,
    worldCoverCodes: selection.site.codes, worldCoverClasses: selection.site.mapping,
    scale: 10, crs: selection.site.crs, trees: 200, seed: 410, tileScale: 4,
    pilotCandidateCapPerClass: 40, pilotCandidateScale: 100,
    pilotValidationLocations: 200, pilotExclusionMeters: 100,
    separationMeters: selection.approved ? selection.separation : 100,
    independentReferencesConfirmed: selection.approved, validationUsedForTuning: false,
    validationDesign: selection.approved ? selection.design : 'PRODUCT_HOLDOUT_DIAGNOSTIC_ONLY',
    referenceProtocol: selection.approved ? selection.protocol : 'NO_INDEPENDENT_REFERENCE_LABELS',
    createExportTasks: false, exportReferencePreparation: false,
    driveFolder: 'SES410_v0_2', exportPrefix: selection.site.key + '_v0_2',
    runId: 'r' + started + '_' + token, startedUtc: new Date(started).toISOString(),
    trainingAsset: selection.approved ? selection.trainingAsset : '',
    validationAsset: selection.approved ? selection.validationAsset : '', map: map,
    isCurrent: function() {return token === revision;},
    onProgress: function(message) {if (token === revision) say(message);},
    onError: function(message) {
      if (token !== revision) return;
      busy = false; completed = null;
      map.layers().reset();
      generate.setDisabled(false); exportButton.setDisabled(true); coverageButton.setDisabled(true);
      say(message + ' See Console for details. Correct inputs and generate again.', true);
    },
    onComplete: function(report, result) {
      if (token !== revision) return;
      completed = result; busy = false;
      generate.setDisabled(false); exportButton.setDisabled(false); coverageButton.setDisabled(false);
      displayReport(report, result, selection, started);
      say('Map and metric graphs evaluated. Inspect map tiles for rendering errors; exports have not run.');
    }
  };
  busy = true;
  generate.setDisabled(true);
  function launch() {
    if (token !== revision) return;
    try {
      if (selection.approved) {
        cfg.training = ee.FeatureCollection(selection.trainingAsset);
        cfg.validation = ee.FeatureCollection(selection.validationAsset);
        hammer.runWorkflow(cfg);
      } else hammer.runPilot(cfg);
    } catch (error) {cfg.onError(error.message);}
  }
  if (!selection.approved) {launch(); return;}
  // Production uses the same boundary identity checks as the diagnostic path.
  var boundary = hammer.resolveWdpa(cfg.boundarySpec);
  say('Checking the selected national protected-area identity...');
  ee.Dictionary({n: boundary.size(), ids: boundary.aggregate_array('SITE_ID')}).evaluate(function(data, error) {
    if (token !== revision) return;
    if (error || !data.n || data.ids.some(function(id) {return String(id) !== String(cfg.expectedSiteId);})) {
      cfg.onError('Boundary identity check failed: ' + (error || JSON.stringify(data))); return;
    }
    cfg.boundary = boundary;
    map.centerObject(boundary, 6);
    map.addLayer(boundary.style({color: 'ffff00', fillColor: '00000000'}), {}, selection.siteName + ' boundary');
    launch();
  });
});

coverageButton.onClick(function() {
  if (!completed || busy) return;
  var result = completed, token = revision, cfg = result.config;
  coverageButton.setDisabled(true);
  coverageLabel.setValue('Measuring an approximate 500 m coverage grid...');
  var collection = ee.ImageCollection('GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL')
    .filterBounds(result.region).filterDate('2021-01-01', '2022-01-01');
  var bands = [];
  for (var i = 0; i < 64; i++) bands.push('A' + ('0' + i).slice(-2));
  var available = collection.select(bands).mosaic().mask().reduce(ee.Reducer.min())
    .rename('valid').unmask(0, false);
  available.reduceRegion({reducer: ee.Reducer.mean(), geometry: result.region,
    scale: 500, crs: cfg.crs, maxPixels: 1e8, tileScale: 4}).evaluate(function(data, error) {
    if (token !== revision || completed !== result) return;
    coverageButton.setDisabled(false);
    coverageLabel.setValue(error ? 'Coverage estimate failed: ' + error :
      'Approximate all-band valid coverage: ' + percent(data.valid) + ' on a 500 m check grid. No acceptance threshold applied.');
  });
});
exportButton.onClick(function() {
  if (!completed || busy || !completed.config.isCurrent()) return;
  try {
    hammer.exportCompleted(completed);
    exportButton.setDisabled(true);
    say('Six tasks created for ' + completed.config.runId + '. Open Tasks and start them manually. Queued tasks remain if you change the selection; their frozen names identify the original run.');
  } catch (error) {say(error.message, true);}
});
updateLegend();
updateMode();
