// =====================================================================
// Keystone Protected Area LULC Tool, v3 (human-reviewed labels)
// Paste into the Earth Engine Code Editor and click Run.
// NOT executed by the author: verify, then report any console error.
//
// Workflow (use the numbered buttons at the top of the panel):
//  1 Setup  : pick park + year, check boundary and embedding coverage
//  2 Queue  : build a review queue of random points spread across the
//             embedding's natural surface types (unsupervised strata, NOT labels)
//  3 Label  : look at each point, choose a class, save or flag as uncertain
//  4 Train  : Random Forest on the 64 embedding bands at TRAINING points
//  5 Check  : accuracy on VALIDATION points only
//  6 Save   : exports, plus save / load labels so teammates can share work
//
// Training vs validation is decided by CODE, from a spatial block grid, with a
// guard band along block edges. A point can never be both, and the two sets are
// always at least ~MIN_SEP_M apart. Reviewers do not choose the dataset.
// =====================================================================

// ---------------- SETTINGS (edit here) ----------------
var WDPA_ASSET = 'WCMC/WDPA/current/polygons';
var WDPA_ID_FIELD = 'SITE_ID';          // this dataset has SITE_ID, not WDPAID
var EMBEDDING_ASSET = 'GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL';

var REQUIRED_COVERAGE = 0.99;   // team must define what "100% coverage" means
var COVERAGE_SCALE_M = 100;     // coarse check keeps large parks from timing out
var N_STRATA = 8;               // k-means groups used only to spread candidate points
var BLOCK_M = 10000;            // block size (m) for the train/validation split
var MIN_SEP_M = 500;            // min separation between training and validation
var TRAIN_FRACTION = 0.7;       // share of blocks that become training blocks
var TRAIN_TARGET = 100;         // per class (SRR)
var VAL_TARGET = 50;            // per class (SRR)
var TRAIN_FLOOR = 10;           // classes below this are skipped when training
var NUM_TREES = 100;            // hyperparameters still TBR
var SEED = 42;
var TARGET_MACRO_F1 = 0.80;
var TARGET_CLASS_ACC = 0.75;
var REVIEW_ZOOM = 17;

// STARTER class schemes. The team must confirm these. Keep only classes that
// reviewers can tell apart reliably from imagery.
var SITES = {
  'Skeleton Coast Park': {id: 885, zoom: 7, classes: [
    {name: 'Dune sand', color: 'f2d16b', def: 'Loose sand dunes and sand sheets'},
    {name: 'Gravel plain', color: 'b08d57', def: 'Flat stony or gravel desert surface'},
    {name: 'Rock / dark surface', color: '4d4d4d', def: 'Exposed bedrock, dark rock or shadowed terrain'},
    {name: 'Dry riverbed', color: '8fbf8f', def: 'Dry river channels and their floodplain'},
    {name: 'Sparse vegetation', color: '2e7d32', def: 'Visible plant cover, including riverbed vegetation'},
    {name: 'Water / wet sand', color: '3b78d8', def: 'Ocean surf, lagoons, standing water, wet sand'}
  ]},
  'Salonga National Park': {id: 555697863, zoom: 6, classes: [
    {name: 'Terra firme forest', color: '1b5e20', def: 'Dense forest on dry ground'},
    {name: 'Swamp / flooded forest', color: '7a87c6', def: 'Forest standing in or next to water'},
    {name: 'River / open water', color: '3b78d8', def: 'Rivers, lakes, open water channels'},
    {name: 'Non-forest', color: 'e49635', def: 'Clearings, grass, cultivation, settlement'}
  ]}
};

// ---------------- STATE ----------------
var BANDS = [];
for (var bi = 0; bi < 64; bi++) { BANDS.push('A' + (bi < 10 ? '0' : '') + bi); }
var GUARD_M = MIN_SEP_M / 2;
var wdpa = ee.FeatureCollection(WDPA_ASSET);

var currentSite = null, currentYear = null, currentClasses = null;
var currentGeom = null, currentImg = null, currentCoverage = null;
var currentClassified = null, currentMetricsRows = null;
var queue = [], qIndex = -1, records = [], lastClick = null;
var layerRefs = {boundary: null, embed: null, s2: null, train: null, val: null,
                 flag: null, current: null, click: null, map: null};

// ---------------- PANEL ----------------
var map = ui.Map();
map.setOptions('SATELLITE');
var panel = ui.Panel({style: {width: '420px', padding: '8px'}});
ui.root.clear();
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));
ui.root.add(panel);
ui.root.add(map);

panel.add(ui.Label('Keystone Protected Area LULC Tool', {fontSize: '20px', fontWeight: 'bold'}));
var navPanel = ui.Panel([], ui.Panel.Layout.flow('horizontal'));
panel.add(navPanel);

var statusLabel = ui.Label('Step 1: choose a park and year, then click "Check data and load area".',
  {whiteSpace: 'pre-wrap', fontSize: '12px'});
panel.add(ui.Panel([ui.Label('Status / what to do next', {fontWeight: 'bold'}), statusLabel],
  null, {border: '1px solid #999', padding: '6px', margin: '6px 0'}));
function setStatus(msg) { statusLabel.setValue(msg); }

var stepNames = ['1 Setup', '2 Queue', '3 Label', '4 Train', '5 Check', '6 Save'];
var stepPanels = stepNames.map(function () { return ui.Panel(); });
function showStep(i) {
  stepPanels.forEach(function (p, k) { p.style().set('shown', k === i); });
}
stepNames.forEach(function (n, i) {
  navPanel.add(ui.Button({label: n, onClick: function () { showStep(i); },
                          style: {margin: '0 2px 0 0', padding: '0'}}));
  panel.add(stepPanels[i]);
});
function title(p, t, blurb) {
  p.add(ui.Label(t, {fontWeight: 'bold', fontSize: '15px', margin: '8px 0 2px 0'}));
  p.add(ui.Label(blurb, {fontSize: '12px', color: '#555'}));
}
function btn(label, fn) { return ui.Button({label: label, onClick: fn, style: {stretch: 'horizontal'}}); }

// Step 1
var p1 = stepPanels[0];
title(p1, 'Setup', 'Choose the protected area and embedding year. The app checks that exactly one ' +
  'boundary exists and that embeddings cover it before anything else runs.');
var siteSelect = ui.Select({items: Object.keys(SITES), value: 'Skeleton Coast Park'});
p1.add(ui.Label('Protected area')); p1.add(siteSelect);
var yearSelect = ui.Select({items: ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'],
                            value: '2024'});
p1.add(ui.Label('Embedding year')); p1.add(yearSelect);
p1.add(btn('Check data and load area', analyzeArea));

// Step 2
var p2 = stepPanels[1];
title(p2, 'Review queue', 'Builds a list of random points spread across the area\'s different surface ' +
  'types, so reviewers see desert dunes AND gravel, forest AND swamp, not just the common type. ' +
  'The groups are only used to spread points out. They are not labels.');
p2.add(ui.Label('Candidate points per group (' + N_STRATA + ' groups)'));
var candBox = ui.Textbox({value: '40'}); p2.add(candBox);
p2.add(btn('Build review queue', buildQueue));

// Step 3
var p3 = stepPanels[2];
title(p3, 'Label points', 'For each point: look at the satellite image, pick the class, click Save. ' +
  'If you cannot tell, click Uncertain so the team can decide together. Never guess.');
var reviewerBox = ui.Textbox({value: 'initials'});
p3.add(ui.Label('Your name / initials (saved with each label)')); p3.add(reviewerBox);
var pointInfo = ui.Label('No point yet. Build the queue in step 2.', {whiteSpace: 'pre-wrap'});
p3.add(pointInfo);
var classSelect = ui.Select({items: ['(load an area first)'], value: '(load an area first)'});
p3.add(ui.Label('What is at the red circle?')); p3.add(classSelect);
p3.add(btn('Save label and go to next point', function () { saveCurrent(false); }));
p3.add(btn('Uncertain: flag for team review', function () { saveCurrent(true); }));
p3.add(btn('Undo last label', undoLast));
p3.add(btn('Show / hide Sentinel-2 true color for this year', toggleS2));
var gotoBox = ui.Textbox({value: '1'});
p3.add(ui.Label('Jump to queue point # (e.g. split the queue between teammates)'));
p3.add(gotoBox); p3.add(btn('Go to point', function () { showQueuePoint(Number(gotoBox.getValue()) - 1); }));
p3.add(ui.Label('Extra point at a map click (for rare classes):', {fontWeight: 'bold', margin: '10px 0 0 0'}));
var clickInfo = ui.Label('Click the map to select a location.', {whiteSpace: 'pre-wrap', fontSize: '12px'});
p3.add(clickInfo);
p3.add(btn('Label clicked location with the class above', addManual));
p3.add(ui.Label('Class guide and progress', {fontWeight: 'bold', margin: '10px 0 0 0'}));
var guideLabel = ui.Label('', {whiteSpace: 'pre-wrap', fontSize: '12px'});
var countsLabel = ui.Label('', {whiteSpace: 'pre-wrap', fontSize: '12px', fontFamily: 'monospace'});
p3.add(guideLabel); p3.add(countsLabel);

// Step 4
var p4 = stepPanels[3];
title(p4, 'Train and map', 'Trains a Random Forest on the 64 embedding values at the human-labeled ' +
  'TRAINING points only, then paints a land-cover map for the whole park.');
p4.add(ui.Label('Number of trees')); var treeBox = ui.Textbox({value: String(NUM_TREES)}); p4.add(treeBox);
p4.add(btn('Train model and create map', trainModel));

// Step 5
var p5 = stepPanels[4];
title(p5, 'Check accuracy', 'Compares the map with the human-labeled VALIDATION points. These sit in ' +
  'different map blocks from training points, so they are an honest test.');
p5.add(btn('Calculate validation metrics', calculateValidation));

// Step 6
var p6 = stepPanels[5];
title(p6, 'Save and share', 'Exports go to Google Drive (start them in the Tasks tab). Saving labels to an ' +
  'Earth Engine asset lets teammates load your work.');
p6.add(ui.Label('Raster export scale (m)'));
var exportScaleSelect = ui.Select({items: ['10', '30', '60'], value: '30'}); p6.add(exportScaleSelect);
p6.add(btn('Create export tasks (map, tables, settings)', createExports));
p6.add(ui.Label('Labels asset ID (use a new name for every save)', {margin: '10px 0 0 0'}));
var assetBox = ui.Textbox({value: 'projects/YOUR_PROJECT/assets/labels_v1'}); p6.add(assetBox);
p6.add(btn('Save labels to asset', saveToAsset));
p6.add(btn('Load labels from asset (merge)', loadFromAsset));

showStep(0);

// ---------------- HELPERS ----------------
function classNames() { return currentClasses ? currentClasses.map(function (c) { return c.name; }) : []; }
function classColors() { return currentClasses.map(function (c) { return c.color; }); }
function keyOf(lon, lat) { return lon.toFixed(6) + ',' + lat.toFixed(6); }
function addLayer(obj, vis, name, shown) {
  var l = ui.Map.Layer(obj, vis || {}, name, shown);
  map.layers().add(l);
  return l;
}
function dropLayer(k) {
  if (layerRefs[k] !== null) { map.layers().remove(layerRefs[k]); layerRefs[k] = null; }
}

// Spatial block rule, computed in the browser (Web Mercator metres).
function blockInfo(lon, lat) {
  var R = 6378137;
  var x = R * lon * Math.PI / 180;
  var y = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  var bx = Math.floor(x / BLOCK_M), by = Math.floor(y / BLOCK_M);
  var fx = x - bx * BLOCK_M, fy = y - by * BLOCK_M;
  var edge = Math.min(fx, BLOCK_M - fx, fy, BLOCK_M - fy);
  var h = Math.sin(bx * 12.9898 + by * 78.233) * 43758.5453;
  var u = h - Math.floor(h);
  return {dataset: u < TRAIN_FRACTION ? 'training' : 'validation', edge: edge, block: bx + '_' + by};
}

function seededShuffle(arr, seed) {
  var s = seed;
  function rnd() { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function toFeature(r) {
  return ee.Feature(ee.Geometry.Point([r.lon, r.lat]), {
    label_id: r.labelId, label_name: r.labelId >= 0 ? currentClasses[r.labelId].name : 'uncertain',
    dataset: r.dataset, status: r.status, source: r.source, stratum: r.stratum,
    reviewer: r.reviewer, site: currentSite, year: currentYear, lon: r.lon, lat: r.lat
  });
}
function labeled(ds) {
  return records.filter(function (r) { return r.status === 'labeled' && r.dataset === ds; });
}
function countByClass(list) {
  var c = {};
  list.forEach(function (r) { c[r.labelId] = (c[r.labelId] || 0) + 1; });
  return c;
}

function updateCounts() {
  if (!currentClasses) { return; }
  var tr = countByClass(labeled('training')), va = countByClass(labeled('validation'));
  var lines = ['Class                 train        validation'];
  currentClasses.forEach(function (c, i) {
    var name = (c.name + '                    ').substring(0, 21);
    lines.push(name + ((tr[i] || 0) + '/' + TRAIN_TARGET + '          ').substring(0, 13) +
               (va[i] || 0) + '/' + VAL_TARGET);
  });
  var flagged = records.filter(function (r) { return r.status === 'uncertain'; }).length;
  lines.push('Flagged uncertain: ' + flagged);
  countsLabel.setValue(lines.join('\n'));
}

function updateLayers() {
  dropLayer('train'); dropLayer('val'); dropLayer('flag');
  var tr = records.filter(function (r) { return r.status === 'labeled' && r.dataset === 'training'; });
  var va = records.filter(function (r) { return r.status === 'labeled' && r.dataset === 'validation'; });
  var fl = records.filter(function (r) { return r.status === 'uncertain'; });
  if (tr.length) { layerRefs.train = addLayer(ee.FeatureCollection(tr.map(toFeature)), {color: 'yellow'}, 'Training labels', true); }
  if (va.length) { layerRefs.val = addLayer(ee.FeatureCollection(va.map(toFeature)), {color: 'cyan'}, 'Validation labels', true); }
  if (fl.length) { layerRefs.flag = addLayer(ee.FeatureCollection(fl.map(toFeature)), {color: 'magenta'}, 'Uncertain (flagged)', true); }
  updateCounts();
}

function resetAll() {
  currentGeom = null; currentImg = null; currentCoverage = null; currentClassified = null;
  currentMetricsRows = null; queue = []; qIndex = -1; records = []; lastClick = null;
  map.layers().reset();
  for (var k in layerRefs) { layerRefs[k] = null; }
  pointInfo.setValue('No point yet. Build the queue in step 2.');
  countsLabel.setValue('');
}

// ---------------- 1. SETUP ----------------
function analyzeArea() {
  var siteName = siteSelect.getValue(), info = SITES[siteName], year = Number(yearSelect.getValue());
  resetAll();
  setStatus('Checking boundary...');
  var feature = wdpa.filter(ee.Filter.eq(WDPA_ID_FIELD, info.id));
  feature.size().evaluate(function (n, err) {
    if (err) { setStatus('Boundary query failed: ' + err); return; }
    if (n !== 1) {
      setStatus('Boundary query returned ' + n + ' features (' + WDPA_ID_FIELD + ' = ' + info.id +
                '). Exactly 1 is required. Stopped.');
      return;
    }
    var geom = feature.geometry();
    var start = ee.Date.fromYMD(year, 1, 1), end = start.advance(1, 'year');
    var coll = ee.ImageCollection(EMBEDDING_ASSET).filterDate(start, end).filterBounds(geom);
    setStatus('Checking embedding availability and coverage (large parks can take a minute)...');
    coll.size().evaluate(function (cnt, err2) {
      if (err2) { setStatus('Embedding check failed: ' + err2); return; }
      if (!cnt) { setStatus('No embeddings found for ' + year + '. Stopped.'); return; }
      var img = coll.mosaic().select(BANDS).clip(geom);
      ee.Dictionary({
        areaKm2: geom.area(1000).divide(1e6),
        coverage: img.select('A00').mask().unmask(0).reduceRegion({
          reducer: ee.Reducer.mean(), geometry: geom, scale: COVERAGE_SCALE_M,
          maxPixels: 1e11, bestEffort: true, tileScale: 8
        }).get('A00')
      }).evaluate(function (r, err3) {
        if (err3) { setStatus('Coverage check failed: ' + err3); return; }
        if (isNaN(r.areaKm2 > 0)) { setStatus('Boundary is empty. Stopped.'); return; }
        if (r.coverage === null || r.coverage < REQUIRED_COVERAGE) {
          setStatus('Embedding coverage is ' + (r.coverage === null ? 'unavailable' :
            (100 * r.coverage).toFixed(2) + '%') + '; ' + (100 * REQUIRED_COVERAGE) + '% required. Stopped.');
          return;
        }
        currentSite = siteName; currentYear = year; currentClasses = info.classes;
        currentGeom = geom; currentImg = img; currentCoverage = r.coverage;
        layerRefs.boundary = addLayer(geom, {color: 'red'}, siteName + ' boundary', true);
        layerRefs.embed = addLayer(img, {min: -0.3, max: 0.3, bands: ['A01', 'A16', 'A09']},
                                   'Embedding visualization', false);
        map.centerObject(geom, info.zoom);
        classSelect.items().reset(classNames());
        classSelect.setValue(classNames()[0], false);
        guideLabel.setValue(currentClasses.map(function (c) { return c.name + ': ' + c.def; }).join('\n'));
        updateCounts();
        setStatus('Data check passed.\n' + siteName + ', ' + year + '\nArea: ' +
          Math.round(r.areaKm2).toLocaleString() + ' km2\nEmbedding coverage: ' +
          (100 * r.coverage).toFixed(2) + '% (checked at ' + COVERAGE_SCALE_M + ' m)\n' +
          'Next: step 2, build the review queue.');
        showStep(1);
      });
    });
  });
}

// ---------------- 2. QUEUE ----------------
function buildQueue() {
  if (currentImg === null) { setStatus('Complete step 1 first.'); return; }
  var per = Number(candBox.getValue());
  if (isNaN(per > 0)) { setStatus('Enter a positive number of candidate points.'); return; }
  setStatus('Building queue (clustering and sampling; may take a minute)...');
  var sample = currentImg.sample({region: currentGeom, scale: 200, numPixels: 5000, seed: SEED, tileScale: 4});
  var clusterer = ee.Clusterer.wekaKMeans(N_STRATA).train(sample);
  var strata = currentImg.cluster(clusterer).rename('stratum');
  strata.stratifiedSample({numPoints: per, classBand: 'stratum', region: currentGeom, scale: 100,
                           seed: SEED, geometries: true, tileScale: 4})
    .evaluate(function (fc, err) {
      if (err) { setStatus('Queue failed: ' + err); return; }
      var q = [], dropped = 0;
      fc.features.forEach(function (f) {
        var c = f.geometry.coordinates, b = blockInfo(c[0], c[1]);
        if (b.edge < GUARD_M) { dropped++; return; }   // guard band keeps the sets apart
        q.push({lon: c[0], lat: c[1], stratum: f.properties.stratum, dataset: b.dataset});
      });
      queue = seededShuffle(q, SEED);
      var nt = q.filter(function (p) { return p.dataset === 'training'; }).length;
      setStatus('Queue ready: ' + q.length + ' points (' + nt + ' training, ' + (q.length - nt) +
                ' validation). ' + dropped + ' dropped near block edges.\nGo to step 3 and start labeling.');
      qIndex = -1;
      goToNext();
      showStep(2);
    });
}

// ---------------- 3. LABEL ----------------
function doneKeys() {
  var d = {};
  records.forEach(function (r) { d[keyOf(r.lon, r.lat)] = true; });
  return d;
}
function goToNext() {
  var d = doneKeys();
  for (var i = qIndex + 1; i < queue.length; i++) {
    if (!d[keyOf(queue[i].lon, queue[i].lat)]) { showQueuePoint(i); return; }
  }
  pointInfo.setValue('Queue finished. Build a larger queue or add extra points.');
  dropLayer('current');
}
function showQueuePoint(i) {
  if (!queue.length || !(i >= 0 && i < queue.length)) { setStatus('No such queue point.'); return; }
  qIndex = i;
  var p = queue[i];
  dropLayer('current');
  layerRefs.current = addLayer(ee.Geometry.Point([p.lon, p.lat]).buffer(15), {color: 'red'}, 'Current point', true);
  map.setCenter(p.lon, p.lat, REVIEW_ZOOM);
  pointInfo.setValue('Point ' + (i + 1) + ' of ' + queue.length + '\nWill be used for: ' +
                     p.dataset.toUpperCase() + '\nThe red circle is about 30 m wide.');
}
function classIndex() { return classNames().indexOf(classSelect.getValue()); }

function saveCurrent(uncertain) {
  if (!queue.length || qIndex < 0) { setStatus('Build the review queue first (step 2).'); return; }
  var p = queue[qIndex], id = classIndex();
  if (!uncertain && id < 0) { setStatus('Choose a class first.'); return; }
  if (doneKeys()[keyOf(p.lon, p.lat)]) { goToNext(); return; }
  records.push({lon: p.lon, lat: p.lat, labelId: uncertain ? -1 : id, dataset: p.dataset,
                status: uncertain ? 'uncertain' : 'labeled', source: 'queue', stratum: p.stratum,
                reviewer: reviewerBox.getValue()});
  currentClassified = null;
  updateLayers();
  goToNext();
}
function undoLast() {
  if (!records.length) { setStatus('Nothing to undo.'); return; }
  var r = records.pop();
  currentClassified = null;
  updateLayers();
  for (var i = 0; i < queue.length; i++) {
    if (keyOf(queue[i].lon, queue[i].lat) === keyOf(r.lon, r.lat)) { showQueuePoint(i); break; }
  }
  setStatus('Removed the last label.');
}

map.onClick(function (c) {
  lastClick = c;
  dropLayer('click');
  layerRefs.click = addLayer(ee.Geometry.Point([c.lon, c.lat]), {color: 'orange'}, 'Clicked location', true);
  var b = blockInfo(c.lon, c.lat);
  clickInfo.setValue(c.lat.toFixed(5) + ', ' + c.lon.toFixed(5) + '\n' +
    (b.edge < GUARD_M ? 'Too close to a block edge. Click a little further in.' :
     'This location would be a ' + b.dataset.toUpperCase() + ' point.'));
});
function addManual() {
  if (currentGeom === null) { setStatus('Complete step 1 first.'); return; }
  if (lastClick === null) { setStatus('Click the map first.'); return; }
  var id = classIndex(), c = lastClick, b = blockInfo(c.lon, c.lat);
  if (id < 0) { setStatus('Choose a class first.'); return; }
  if (b.edge < GUARD_M) { setStatus('Rejected: too close to a block edge. Click further in.'); return; }
  if (doneKeys()[keyOf(c.lon, c.lat)]) { setStatus('That exact location is already labeled.'); return; }
  currentGeom.contains(ee.Geometry.Point([c.lon, c.lat]), 1).evaluate(function (inside, err) {
    if (err) { setStatus('Location check failed: ' + err); return; }
    if (!inside) { setStatus('That location is outside the park boundary.'); return; }
    records.push({lon: c.lon, lat: c.lat, labelId: id, dataset: b.dataset, status: 'labeled',
                  source: 'manual', stratum: -1, reviewer: reviewerBox.getValue()});
    currentClassified = null;
    updateLayers();
    setStatus('Added a ' + b.dataset + ' point: ' + classNames()[id] + '.');
  });
}
function toggleS2() {
  if (currentGeom === null) { setStatus('Complete step 1 first.'); return; }
  if (layerRefs.s2 !== null) { layerRefs.s2.setShown(!layerRefs.s2.getShown()); return; }
  var start = ee.Date.fromYMD(currentYear, 1, 1);
  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterDate(start, start.advance(1, 'year'))
    .filterBounds(currentGeom).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)).median().clip(currentGeom);
  layerRefs.s2 = addLayer(s2, {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000},
                          'Sentinel-2 ' + currentYear + ' (true color)', true);
}

// ---------------- 4. TRAIN ----------------
function trainModel() {
  if (currentImg === null) { setStatus('Complete step 1 first.'); return; }
  var trees = Number(treeBox.getValue());
  if (isNaN(trees) || trees < 1 || Math.floor(trees) !== trees) { setStatus('Trees must be a positive whole number.'); return; }
  var tr = labeled('training'), counts = countByClass(tr), used = [];
  currentClasses.forEach(function (c, i) { if ((counts[i] || 0) >= TRAIN_FLOOR) { used.push(i); } });
  if (used.length < 2) {
    setStatus('Need at least 2 classes with ' + TRAIN_FLOOR + '+ training labels. Current counts:\n' +
              JSON.stringify(counts));
    return;
  }
  var fc = ee.FeatureCollection(tr.filter(function (r) { return used.indexOf(r.labelId) >= 0; }).map(toFeature));
  setStatus('Training...');
  var samples = currentImg.sampleRegions({collection: fc, properties: ['label_id'], scale: 10,
                                          geometries: true, tileScale: 4});
  samples.size().evaluate(function (n, err) {
    if (err) { setStatus('Sampling failed: ' + err); return; }
    if (n < 2) { setStatus('Too few training points landed on valid embedding pixels.'); return; }
    var rf = ee.Classifier.smileRandomForest({numberOfTrees: trees, seed: SEED})
      .train({features: samples, classProperty: 'label_id', inputProperties: BANDS});
    currentClassified = currentImg.classify(rf).clip(currentGeom);   // band name: 'classification'
    currentMetricsRows = null;
    dropLayer('map');
    layerRefs.map = addLayer(currentClassified, {min: 0, max: currentClasses.length - 1, palette: classColors()},
                             'Random Forest LULC map', true);
    var short = [];
    used.forEach(function (i) { if (counts[i] < TRAIN_TARGET) { short.push(currentClasses[i].name + ' ' + counts[i]); } });
    setStatus('Map created from ' + n + ' human-labeled training pixels, ' + used.length + ' classes.' +
      (short.length ? '\nBelow the ' + TRAIN_TARGET + '-point target: ' + short.join(', ') : '') +
      '\nThis is not an accuracy estimate. Go to step 5.');
    print('Training counts by class id', counts);
  });
}

// ---------------- 5. CHECK ----------------
function calculateValidation() {
  if (currentClassified === null) { setStatus('Train the model first (step 4).'); return; }
  var va = labeled('validation');
  if (va.length < 2) { setStatus('Need validation labels. Label more points in step 3.'); return; }
  var nC = currentClasses.length;
  var tested = currentClassified.sampleRegions({
    collection: ee.FeatureCollection(va.map(toFeature)), properties: ['label_id'],
    scale: 10, geometries: true, tileScale: 4});
  var matrix = tested.errorMatrix('label_id', 'classification', ee.List.sequence(0, nC - 1));
  matrix.array().evaluate(function (m, err) {
    if (err) { setStatus('Validation failed: ' + err); return; }
    var rows = [], f1s = [], total = 0, diag = 0, weak = [], short = [];
    for (var i = 0; i < nC; i++) {
      var tp = m[i][i], ref = 0, pred = 0;
      for (var j = 0; j < nC; j++) { ref += m[i][j]; pred += m[j][i]; }
      total += ref; diag += tp;
      var p = pred > 0 ? tp / pred : 0, r = ref > 0 ? tp / ref : 0;
      var f = (p + r) > 0 ? 2 * p * r / (p + r) : 0;
      if (ref > 0) {
        f1s.push(f);
        if (p < TARGET_CLASS_ACC || r < TARGET_CLASS_ACC) { weak.push(currentClasses[i].name); }
        if (ref < VAL_TARGET) { short.push(currentClasses[i].name + ' ' + ref); }
      }
      rows.push({class_id: i, class_name: currentClasses[i].name, reference_points: ref,
                 predicted_points: pred, users_accuracy_precision: p, producers_accuracy_recall: r, f1: f});
    }
    if (total === 0) { setStatus('No validation points landed on mapped pixels.'); return; }
    var macro = f1s.reduce(function (a, b) { return a + b; }, 0) / f1s.length;
    currentMetricsRows = rows;
    setStatus('Validation (independent, human-labeled)\nPoints used: ' + total +
      '\nOverall accuracy: ' + (100 * diag / total).toFixed(1) + '%' +
      '\nMacro F1: ' + macro.toFixed(3) + (macro >= TARGET_MACRO_F1 ? '  (meets ' : '  (below ') + TARGET_MACRO_F1 + ')' +
      '\nClasses with precision or recall under ' + TARGET_CLASS_ACC + ': ' + (weak.length ? weak.join(', ') : 'none') +
      (short.length ? '\nPRELIMINARY, under ' + VAL_TARGET + ' points: ' + short.join(', ') : '') +
      '\n\nNote: points were spread across surface types, not by area, so overall accuracy is not an ' +
      'area-weighted estimate. See the Console for the full table.');
    print('Validation confusion matrix (rows = reference, columns = predicted)', matrix);
    print('Per-class metrics', rows);
    print('Macro F1', macro);
  });
}

// ---------------- 6. SAVE ----------------
function tag() { return currentSite.replace(/[^A-Za-z0-9]+/g, '_') + '_' + currentYear; }
function createExports() {
  if (currentClassified === null) { setStatus('Train the model before exporting.'); return; }
  var t = tag();
  Export.image.toDrive({image: currentClassified.toByte(), description: t + '_LULC', fileNamePrefix: t + '_LULC',
    region: currentGeom, scale: Number(exportScaleSelect.getValue()), maxPixels: 1e13, fileFormat: 'GeoTIFF'});
  Export.table.toDrive({collection: ee.FeatureCollection(currentClasses.map(function (c, i) {
      return ee.Feature(null, {class_id: i, class_name: c.name, color_hex: c.color, definition: c.def});
    })), description: t + '_Class_Legend', fileNamePrefix: t + '_Class_Legend', fileFormat: 'CSV'});
  [['training', 'labeled'], ['validation', 'labeled']].forEach(function (d) {
    var list = records.filter(function (r) { return r.status === d[1] && r.dataset === d[0]; });
    if (list.length) {
      Export.table.toDrive({collection: ee.FeatureCollection(list.map(toFeature)),
        description: t + '_' + d[0] + '_points', fileNamePrefix: t + '_' + d[0] + '_points', fileFormat: 'CSV'});
    }
  });
  var fl = records.filter(function (r) { return r.status === 'uncertain'; });
  if (fl.length) {
    Export.table.toDrive({collection: ee.FeatureCollection(fl.map(toFeature)),
      description: t + '_uncertain_for_team_review', fileNamePrefix: t + '_uncertain_for_team_review', fileFormat: 'CSV'});
  }
  if (currentMetricsRows !== null) {
    Export.table.toDrive({collection: ee.FeatureCollection(currentMetricsRows.map(function (r) { return ee.Feature(null, r); })),
      description: t + '_Accuracy_Metrics', fileNamePrefix: t + '_Accuracy_Metrics', fileFormat: 'CSV'});
  }
  Export.table.toDrive({collection: ee.FeatureCollection([ee.Feature(null, {
      site: currentSite, year: currentYear, boundary_field: WDPA_ID_FIELD, boundary_id: SITES[currentSite].id,
      embedding_asset: EMBEDDING_ASSET, coverage_estimate: currentCoverage, coverage_scale_m: COVERAGE_SCALE_M,
      required_coverage: REQUIRED_COVERAGE, n_strata: N_STRATA, block_m: BLOCK_M, min_sep_m: MIN_SEP_M,
      train_fraction: TRAIN_FRACTION, trees: Number(treeBox.getValue()), seed: SEED,
      n_training_labels: labeled('training').length, n_validation_labels: labeled('validation').length,
      label_source: 'human-reviewed', app_version: 'v3'})]),
    description: t + '_Run_Settings', fileNamePrefix: t + '_Run_Settings', fileFormat: 'CSV'});
  setStatus('Export tasks created. Open the Tasks tab (top right) and click Run on each.');
}

function saveToAsset() {
  if (!records.length) { setStatus('No labels to save yet.'); return; }
  var id = assetBox.getValue().trim();
  if (!id || id.indexOf('YOUR_PROJECT') >= 0) { setStatus('Enter a real asset ID first (replace YOUR_PROJECT).'); return; }
  Export.table.toAsset({collection: ee.FeatureCollection(records.map(toFeature)),
                        description: 'labels_' + tag(), assetId: id});
  setStatus('Save task created. Run it in the Tasks tab. Use a NEW asset name next time.\n' +
            'Share the asset with teammates so they can load it.');
}
function loadFromAsset() {
  if (currentGeom === null) { setStatus('Complete step 1 first, then load labels.'); return; }
  var id = assetBox.getValue().trim();
  ee.FeatureCollection(id).evaluate(function (fc, err) {
    if (err) { setStatus('Could not load asset: ' + err); return; }
    var have = doneKeys(), added = 0, skipped = 0, otherSite = 0;
    fc.features.forEach(function (f) {
      var p = f.properties;
      if (p.site !== currentSite || Number(p.year) !== currentYear) { otherSite++; return; }
      var k = keyOf(p.lon, p.lat);
      var b = blockInfo(p.lon, p.lat);
      if (have[k]) { return; }
      if (b.edge < GUARD_M) { skipped++; return; }       // re-enforces separation on loaded data
      records.push({lon: p.lon, lat: p.lat, labelId: p.label_id, dataset: b.dataset,
                    status: p.status, source: p.source, stratum: p.stratum, reviewer: p.reviewer});
      have[k] = true; added++;
    });
    currentClassified = null;
    updateLayers();
    setStatus('Loaded ' + added + ' labels. Skipped ' + skipped + ' too close to block edges and ' +
              otherSite + ' from a different site or year.');
  });
}
