/** SES410 Hammer v0.2.0; additive evolution of the preserved Version 0.
 * This module is site-agnostic. Test scripts supply boundaries and legends.
 * Retains the original embedding, RF, metric and export functions.
 * Candidates are proposals; reviewed training and independent validation are
 * separate inputs. Product-labelled pilot holdouts NEVER certify accuracy.
 * No UI, accuracy target, F1 target or scientific sample-count minimum.
 */
var CONFIG = {
  boundary: null, year: 2021, training: null, validation: null,
  labelProperty: 'class', classValues: [], classNames: {}, palette: [],
  independentReferencesConfirmed: false, validationUsedForTuning: false,
  validationDesign: 'UNSPECIFIED', referenceProtocol: 'UNSPECIFIED',
  scale: 10, crs: 'EPSG:4326', separationMeters: 0,
  trees: 200, seed: 410, tileScale: 4,
  createExportTasks: false, driveFolder: 'SES410_landcover', exportPrefix: 'protected_area'
};
// 200 trees is an inherited preliminary RF setting, not a tuned optimum.
// Zero separation imposes exact intersection/pixel checks, not a scientific
// autocorrelation distance. Choose separation from a documented spatial design.

var VERSION = '0.2.0';
// Every asynchronous continuation checks the caller's immutable run identity.
function active(cfg) {return !cfg.isCurrent || cfg.isCurrent();}
function fail(cfg, message, detail) {
  if (!active(cfg)) return;
  print('STOP: ' + message, detail || '');
  if (cfg.onError) cfg.onError(message, detail);
}
function progress(cfg, message) {
  if (active(cfg) && cfg.onProgress) cfg.onProgress(message);
}

var EMBEDDINGS = 'GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL';
var BANDS = [];
for (var b = 0; b < 64; b++) BANDS.push('A' + ('0' + b).slice(-2));

function geometryOf(boundary) {
  return boundary instanceof ee.Geometry ? boundary : ee.FeatureCollection(boundary).geometry(10);
}

function embeddingCollection(region, year) {
  return ee.ImageCollection(EMBEDDINGS).filterBounds(region)
    .filterDate(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year + 1, 1, 1));
}

function sampleReferences(image, references, cfg) {
  var grid = ee.Image.pixelCoordinates(ee.Projection(cfg.crs).atScale(cfg.scale));
  return image.addBands(grid.rename(['grid_x', 'grid_y'])).sampleRegions({collection: references,
    properties: [cfg.labelProperty, 'sample_id', 'unit_id', 'role', 'reviewed', 'label_source', 'reference_year'], scale: cfg.scale,
    projection: ee.Projection(cfg.crs), tileScale: cfg.tileScale, geometries: true})
    .map(function(f) {return f.set('pixel_id', ee.Number(f.get('grid_x')).floor().toInt64().format('%d')
      .cat('_').cat(ee.Number(f.get('grid_y')).floor().toInt64().format('%d')));});
}

function exportResults(result, cfg, status) {
  if (!active(cfg) || !result.completed) throw new Error('Only a completed current run can be exported.');
  if (result.exported) throw new Error('Export tasks already created for this run.');
  var prefix = cfg.exportPrefix + '_' + cfg.year + '_' + status + '_' + cfg.runId;
  var provenance = ee.FeatureCollection([ee.Feature(null, {
    status: status, year: cfg.year, embeddings: EMBEDDINGS,
    software_version: VERSION, run_id: cfg.runId, legend_version: 'SES410_INITIAL_2021_V1',
    run_started_utc: cfg.startedUtc || '', boundary_site_id: cfg.expectedSiteId || '',
    boundary_version: 'WDPA_CURRENT_MUTABLE_NOT_HISTORICALLY_PINNED',
    training_asset: cfg.trainingAsset || '', validation_asset: cfg.validationAsset || '',
    sampling_note: 'Unweighted sample metrics; no design-weighted intervals implemented',
    candidate_source: status === 'REFERENCE_SAMPLE_EVALUATION' ? 'See reference protocol' : 'ESA/WorldCover/v200',
    candidate_cap_per_class: cfg.pilotCandidateCapPerClass || 0,
    candidate_scale_m: cfg.pilotCandidateScale || 0,
    pilot_locations: cfg.pilotValidationLocations || 0,
    pilot_exclusion_m: cfg.pilotExclusionMeters || 0,
    boundary_query: JSON.stringify(cfg.boundarySpec || {source: 'user_supplied_boundary'}),
    class_names: JSON.stringify(cfg.classNames),
    validation_design: cfg.validationDesign || 'PRODUCT_HOLDOUT_DIAGNOSTIC_ONLY',
    reference_protocol: cfg.referenceProtocol || 'NO_INDEPENDENT_REFERENCE_LABELS',
    label_property: cfg.labelProperty, class_order: cfg.classValues.join(','),
    crs: cfg.crs, scale_m: cfg.scale, trees: cfg.trees, seed: cfg.seed,
    separation_m: cfg.separationMeters || 0, training_pixels: result.training.size(),
    validation_pixels: result.validation.size(), reference_design:
      status === 'REFERENCE_SAMPLE_EVALUATION' ? 'user_confirmed_independent' : 'PRODUCT_CANDIDATES_NOT_REVIEWED'
  })]);
  Export.image.toDrive({image: result.classification.unmask(255, false).toByte(),
    description: prefix + '_map', folder: cfg.driveFolder, fileNamePrefix: prefix,
    region: result.region, scale: cfg.scale, crs: cfg.crs, maxPixels: 1e13,
    fileFormat: 'GeoTIFF', formatOptions: {cloudOptimized: true, noData: 255}});
  Export.table.toDrive({collection: result.predictions, description: prefix + '_predictions',
    folder: cfg.driveFolder, fileFormat: 'CSV'});
  Export.table.toDrive({collection: result.summary, description: prefix + '_metrics',
    folder: cfg.driveFolder, fileFormat: 'CSV'});
  Export.table.toDrive({collection: result.perClass, description: prefix + '_per_class',
    folder: cfg.driveFolder, fileFormat: 'CSV'});
  Export.table.toDrive({collection: result.matrixCells, description: prefix + '_confusion',
    folder: cfg.driveFolder, fileFormat: 'CSV'});
  Export.table.toDrive({collection: provenance, description: prefix + '_provenance',
    folder: cfg.driveFolder, fileFormat: 'CSV'});
  result.exported = true;
  print('Six export tasks created; start manually in Tasks. Output status:', status);
}

function fitAndEvaluate(image, region, training, validation, cfg, status) {
  if (!active(cfg)) return;
  progress(cfg, 'Training and evaluating the frozen run configuration...');
  var model = ee.Classifier.smileRandomForest({numberOfTrees: cfg.trees,
    seed: cfg.seed}).train({features: training, classProperty: cfg.labelProperty,
    inputProperties: BANDS});
  var classification = image.classify(model).rename('classification').clip(region);
  var predictions = validation.classify(model, 'prediction');
  var matrix = predictions.errorMatrix(cfg.labelProperty, 'prediction', cfg.classValues);
  var cells = matrix.array().toList();
  // Rows = reference; columns = prediction. Compute precision/recall explicitly.
  var order = ee.List(cfg.classValues);
  var indices = ee.List.sequence(0, order.size().subtract(1));
  var perClass = ee.FeatureCollection(indices.map(function(i) {
    i = ee.Number(i);
    var row = ee.List(cells.get(i));
    var actualN = ee.Number(row.reduce(ee.Reducer.sum()));
    var predictedN = ee.Number(indices.map(function(j) {
      return ee.List(cells.get(j)).get(i);
    }).reduce(ee.Reducer.sum()));
    var tp = ee.Number(row.get(i));
    return ee.Feature(null, {class_code: order.get(i), class_name: ee.Dictionary(cfg.classNames).get(ee.Number(order.get(i)).format('%d')), status: status,
      reference_n: actualN, prediction_n: predictedN,
      recall_producer: ee.Algorithms.If(actualN.gt(0), tp.divide(actualN), null),
      precision_user: ee.Algorithms.If(predictedN.gt(0), tp.divide(predictedN), null),
      f1: ee.Algorithms.If(actualN.add(predictedN).gt(0),
        tp.multiply(2).divide(actualN.add(predictedN)), null)});
  }));
  var matrixCells = ee.FeatureCollection(indices.map(function(i) {
    return indices.map(function(j) {
      return ee.Feature(null, {reference_class: order.get(i), predicted_class: order.get(j),
        count: ee.List(cells.get(i)).get(j), status: status});
    });
  }).flatten());
  var supported = perClass.filter(ee.Filter.gt('reference_n', 0)).size();
  // Withhold full-legend macro F1 if a class has no reference observations.
  var macro = ee.Algorithms.If(supported.eq(cfg.classValues.length), perClass.aggregate_mean('f1'), null);
  var summary = ee.FeatureCollection([ee.Feature(null, {status: status,
    software_version: VERSION, run_id: cfg.runId, macro_f1_full_legend: macro,
    overall_accuracy: matrix.accuracy(), kappa: matrix.kappa(),
    validation_n: validation.size(), year: cfg.year,
    warning: status === 'REFERENCE_SAMPLE_EVALUATION' ? 'Unweighted sample metrics; inspect class support'
      : 'NOT SCIENTIFIC VALIDATION: product-derived labels; disjoint locations are not independent reference labels'})]);
  var result = {classification: classification, classifier: model,
    region: region, training: training, validation: validation,
    predictions: predictions, summary: summary, perClass: perClass, matrixCells: matrixCells,
    config: cfg, status: status, completed: false, exported: false};
  // Force server evaluation of metrics and a classified raster probe before PASS.
  ee.Dictionary({matrix: matrix.array().toList(), overall_accuracy: matrix.accuracy(), evaluation_n: validation.size(), training_n: training.size(),
    macro_f1_full_legend: macro, supported_reference_classes: supported,
    per_class: perClass.toList(cfg.classValues.length).map(function(f) {
      return ee.Feature(f).toDictionary();
    }), classified_pixel_probe: classification.sampleRegions({collection: training.limit(1),
      scale: cfg.scale, projection: ee.Projection(cfg.crs), tileScale: cfg.tileScale})
      .aggregate_array('classification')}).evaluate(function(report, error) {
    if (!active(cfg)) return;
    if (error) {fail(cfg, 'Classifier / metrics server evaluation failed.', error); return;}
    var matrixN = report.matrix.reduce(function(total, row) {
      return total + row.reduce(function(sum, cell) {return sum + cell;}, 0);
    }, 0);
    if (matrixN !== report.evaluation_n || !report.classified_pixel_probe.length) {
      fail(cfg, 'Confusion matrix excluded observations, or raster probe was empty.', report); return;
    }
    result.completed = true;
    (cfg.map || Map).addLayer(classification.remap(cfg.classValues, cfg.classValues.map(function(c, i) {return i;})),
      {min: 0, max: cfg.classValues.length - 1, palette: cfg.palette},
      cfg.exportPrefix + ' ' + cfg.year + ' ' + status);
    print('COMPLETED METRICS â€” reference rows / prediction columns', report);
    print('RUN COMPLETE: classifier and metric graphs evaluated. Full exports and scientific qualification remain separate.');
    print('SCIENTIFIC VALIDATION STATUS: not certified by software; see reference design and README.');
    if (cfg.createExportTasks) exportResults(result, cfg, status);
    if (cfg.onComplete) cfg.onComplete(report, result);
  });
  return result;
}

// Validate structural inputs; these checks cannot prove ecological truth.
function validateConfig(cfg) {
  if (cfg.year !== Math.floor(cfg.year) || !cfg.crs || !(cfg.scale > 0) ||
      !(cfg.trees > 0) || cfg.trees !== Math.floor(cfg.trees) || !(cfg.separationMeters >= 0))
    throw new Error('Supply a year, explicit grid, positive integer tree count and nonnegative separation.');
  if (!cfg.boundary || !cfg.training || !cfg.validation)
    throw new Error('Supply boundary, reviewed training and separate validation collections.');
  if (!cfg.independentReferencesConfirmed || cfg.validationUsedForTuning !== false)
    throw new Error('Validation independence must be confirmed; tuning with validation is prohibited.');
  if (!cfg.classValues || cfg.classValues.length < 2 || cfg.classValues.some(function(c) {
    return c < 0 || c > 254 || c !== Math.floor(c);
  }) || cfg.classValues.filter(function(c, i, a) {return a.indexOf(c) === i;}).length !== cfg.classValues.length)
    throw new Error('Provide at least two unique integer legend codes in 0..254.');
  if (!cfg.validationDesign || cfg.validationDesign === 'UNSPECIFIED' ||
      !cfg.referenceProtocol || cfg.referenceProtocol === 'UNSPECIFIED')
    throw new Error('Document the sampling design and reference interpretation protocol.');
}

function identityOverlap(left, right, field) {
  return ee.FeatureCollection(ee.Join.simple().apply(left, right,
    ee.Filter.equals({leftField: field, rightField: field}))).size();
}

function geometryTypes(fc) {
  return fc.map(function(f) {return f.set('_type', f.geometry().type());})
    .aggregate_histogram('_type');
}

function finishReferenceRun(image, region, training, validation, cfg) {
  progress(cfg, 'Checking sampled references, class support and analysis pixels...');
  var train = sampleReferences(image, training, cfg);
  var val = sampleReferences(image, validation, cfg);
  ee.Dictionary({train_n: train.size(), validation_n: val.size(), original_validation_n: validation.size(), original_training_n: training.size(),
    training_per_class: train.aggregate_histogram(cfg.labelProperty),
    validation_per_class: val.aggregate_histogram(cfg.labelProperty),
    train_unique_pixels: train.distinct(['pixel_id']).size(),
    validation_unique_pixels: val.distinct(['pixel_id']).size(),
    shared_pixels: identityOverlap(train, val, 'pixel_id')}).evaluate(function(d, error) {
    if (!active(cfg)) return;
    if (error) {fail(cfg, 'Reference sampling failed.', error); return;}
    print('ACTUAL TRAINING / INDEPENDENT VALIDATION after imagery masking', d);
    if (!d.train_n || !d.validation_n || d.validation_n !== d.original_validation_n || d.train_n !== d.original_training_n || d.shared_pixels ||
      d.train_unique_pixels !== d.train_n || d.validation_unique_pixels !== d.validation_n) {
      fail(cfg, 'Missing reference imagery, empty samples or duplicated/shared analysis pixels. No silent exclusion/deduplication.', d); return;
    }
    var missingTrain = cfg.classValues.filter(function(c) {return !d.training_per_class[String(c)];});
    if (missingTrain.length) {fail(cfg, 'Declared classes without training support.', missingTrain); return;}
    print('Validation classes with zero support (undefined recall; no invented minimum):',
      cfg.classValues.filter(function(c) {return !d.validation_per_class[String(c)];}));
    print('INDEPENDENCE: user-confirmed reference protocol + disjoint IDs, units and pixels; not proof of truth.');
    print('VALIDATION IS EVALUATION ONLY. No split, training or tuning uses it.');
    print('METRIC SCOPE: unweighted sample metrics. For disproportionate stratification, use design weights and uncertainty analysis.');
    fitAndEvaluate(image, region, train, val, cfg, 'REFERENCE_SAMPLE_EVALUATION');
  });
}

// Production entry point. Point observations keep the sampling unit explicit.
function runWorkflow(cfg) {
  validateConfig(cfg);
  progress(cfg, 'Checking reference metadata, geometry, IDs and separation...');
  var region = geometryOf(cfg.boundary);
  var train = ee.FeatureCollection(cfg.training);
  var val = ee.FeatureCollection(cfg.validation);
  print('USER-SUPPLIED STUDY BOUNDARY / YEAR / LEGEND', cfg.boundary, cfg.year, cfg.classNames);
  var tiles = embeddingCollection(region, cfg.year);
  var labelFilter = ee.Filter.inList(cfg.labelProperty, cfg.classValues);
  var required = [cfg.labelProperty, 'sample_id', 'unit_id', 'reviewed',
    'role', 'label_source', 'reference_year'];
  var validTrain = train.filter(ee.Filter.notNull(required)).filter(ee.Filter.neq('sample_id', ''))
    .filter(ee.Filter.neq('unit_id', '')).filter(labelFilter)
    .filter(ee.Filter.eq('reviewed', 1)).filter(ee.Filter.eq('role', 'training'))
    .filter(ee.Filter.inList('label_source', ['manual_reference', 'reviewed_product_candidate']))
    .filter(ee.Filter.eq('reference_year', cfg.year));
  var validVal = val.filter(ee.Filter.notNull(required)).filter(ee.Filter.neq('sample_id', ''))
    .filter(ee.Filter.neq('unit_id', '')).filter(labelFilter)
    .filter(ee.Filter.eq('reviewed', 1)).filter(ee.Filter.eq('role', 'validation'))
    .filter(ee.Filter.eq('label_source', 'independent_reference'))
    .filter(ee.Filter.eq('reference_year', cfg.year));
  var spatialFilter = cfg.separationMeters > 0 ? ee.Filter.withinDistance({
    distance: cfg.separationMeters, leftField: '.geo', rightField: '.geo', maxError: 1}) :
    ee.Filter.intersects({leftField: '.geo', rightField: '.geo', maxError: 1});
  ee.Dictionary({embedding_tiles: tiles.size(), training_features: train.size(),
    validation_features: val.size(), invalid_training: train.size().subtract(validTrain.size()),
    invalid_validation: val.size().subtract(validVal.size()),
    training_geometry_types: geometryTypes(train), validation_geometry_types: geometryTypes(val),
    duplicate_training_ids: train.size().subtract(train.distinct(['sample_id']).size()),
    duplicate_validation_ids: val.size().subtract(val.distinct(['sample_id']).size()),
    shared_ids: identityOverlap(train, val, 'sample_id'),
    shared_reference_units: identityOverlap(train, val, 'unit_id'),
    spatial_collisions: ee.FeatureCollection(ee.Join.simple().apply(train, val, spatialFilter)).size(),
    training_outside: train.size().subtract(train.filterBounds(region).size()),
    validation_outside: val.size().subtract(val.filterBounds(region).size())
  }).evaluate(function(d, error) {
    if (!active(cfg)) return;
    if (error) {fail(cfg, 'Reference preflight failed.', error); return;}
    print('REFERENCE PREFLIGHT: year / legend / sampling design', cfg.year, cfg.classNames,
      cfg.validationDesign, cfg.referenceProtocol, d);
    if (!d.embedding_tiles || !d.training_features || !d.validation_features || d.invalid_training ||
      d.invalid_validation || d.duplicate_training_ids || d.duplicate_validation_ids || d.shared_ids ||
      d.shared_reference_units || d.spatial_collisions || d.training_outside || d.validation_outside ||
      Object.keys(d.training_geometry_types).some(function(t) {return t !== 'Point';}) ||
      Object.keys(d.validation_geometry_types).some(function(t) {return t !== 'Point';})) {
      fail(cfg, 'Fix reference metadata, geometry, imagery, identity or separation errors.', d); return;
    }
    var image = tiles.select(BANDS).mosaic().clip(region);
    finishReferenceRun(image, region, train, val, cfg);
  });
}

// Generic WDPA query. Site names/country/expected identity belong to test configs.
function resolveWdpa(spec) {
  return ee.FeatureCollection('WCMC/WDPA/current/polygons')
    .filter(ee.Filter.eq('ISO3', spec.iso3))
    .filter(ee.Filter.eq('DESIG_TYPE', 'National'))
    .filter(ee.Filter.or(ee.Filter.stringContains('NAME', spec.name),
      ee.Filter.stringContains('NAME_ENG', spec.name)));
}

function boundaryMetadata(boundary) {
  return boundary.map(function(f) {return ee.Feature(null, f.toDictionary([
    'SITE_ID', 'SITE_PID', 'NAME', 'NAME_ENG', 'ISO3', 'DESIG_ENG', 'DESIG_TYPE',
    'STATUS', 'STATUS_YR', 'GIS_AREA', 'REP_AREA', 'METADATAID']));});
}

// Draw validation locations BEFORE selecting any training candidates.
// No labels or predictor values are used to choose these locations.
function validationFrame(region, cfg, seed, role) {
  return ee.FeatureCollection.randomPoints({region: region,
    points: cfg.pilotValidationLocations, seed: seed, maxError: 10})
    .map(function(f) {var id = ee.String(cfg.exportPrefix).cat('_validation_').cat(f.id());
      return f.set({sample_id: ee.String(role).cat('_').cat(id), unit_id: ee.String(role).cat('_').cat(id), role: role, reviewed: 0,
        reference_year: cfg.year, label_source: 'UNLABELLED_INDEPENDENT_FRAME'});
    });
}

function candidateLabels(region, cfg) {
  if (cfg.year !== 2021) throw new Error('WorldCover v200 candidates represent 2021; provide a matching-year source.');
  return ee.ImageCollection('ESA/WorldCover/v200').first().select('Map')
    .remap(cfg.worldCoverCodes, cfg.worldCoverClasses).rename('candidate_class').clip(region);
}

// Actual production labels require human review; candidates retain a different
// property and reviewed=0. This helper does NOT promote them to ground truth.
function prepareCandidates(image, region, frame, cfg) {
  var proposals = candidateLabels(region, cfg);
  var excluded = frame.map(function(f) {return f.buffer(cfg.pilotExclusionMeters, 1);});
  var allowed = ee.Image.constant(1).clip(region).paint(excluded, 0);
  return image.addBands(proposals).updateMask(allowed).stratifiedSample({
    classBand: 'candidate_class', numPoints: cfg.pilotCandidateCapPerClass,
    region: region, scale: cfg.pilotCandidateScale, projection: ee.Projection(cfg.crs),
    seed: cfg.seed, tileScale: cfg.tileScale, geometries: true
  }).map(function(f) {var id = ee.String(cfg.exportPrefix).cat('_candidate_').cat(f.id());
    return f.set({sample_id: id, unit_id: id, role: 'candidate_training', reviewed: 0,
      reference_year: cfg.year, label_source: 'ESA_WORLDCOVER_V200_CANDIDATE'});
  });
}

// Review exports use an explicit allowlist: no embeddings or predictions.
function reviewRecords(points, cfg, isTraining) {
  var common = ['sample_id', 'unit_id', 'role', 'reviewed', 'reference_year', 'label_source'];
  return points.map(function(f) {
    var xy = f.geometry().transform('EPSG:4326', 1).coordinates();
    var keep = isTraining ? common.concat(['candidate_class']) : common;
    var out = ee.Feature(f.geometry(), f.toDictionary(keep)).set({
      site: cfg.exportPrefix, site_name: cfg.boundarySpec.name, boundary_site_id: cfg.expectedSiteId,
      boundary_source: 'WCMC/WDPA/current/polygons', boundary_query: JSON.stringify(cfg.boundarySpec),
      preparation_date: ee.Date(Date.now()).format('YYYY-MM-dd'),
      longitude: xy.get(0), latitude: xy.get(1), coordinate_crs: 'EPSG:4326',
      target_year: cfg.year, review_batch: cfg.reviewBatch || 'SES410_2021_REVIEW_V1',
      sampling_design: isTraining ? 'WORLD_COVER_STRATIFIED_CANDIDATE' : 'UNIFORM_RANDOM_BLIND_FRAME',
      sampling_seed: isTraining ? cfg.seed : cfg.seed + 2,
      sampling_scale_m: isTraining ? cfg.pilotCandidateScale : 0,
      target_support_m: cfg.scale, exclusion_m: cfg.pilotExclusionMeters,
      reviewed_class: '', confidence: '', reviewer: '', date_reviewed: '', notes: '',
      imagery_source: '', imagery_id: '', imagery_dates: '', decision: 'pending',
      rejection_reason: '', adjudicator: '', legend_version: 'SES410_INITIAL_2021_V1'
    });
    if (isTraining) out = out.set({candidate_class_name: ee.Dictionary(cfg.classNames)
      .get(ee.Number(f.get('candidate_class')).format('%d')), candidate_source: 'ESA/WorldCover/v200',
      candidate_source_year: 2021, candidate_mapping: JSON.stringify({
        source_codes: cfg.worldCoverCodes, target_codes: cfg.worldCoverClasses}),
      sampling_cap_per_class: cfg.pilotCandidateCapPerClass});
    return out;
  });
}

function exportReferencePreparation(candidates, frame, cfg) {
  var trainReview = reviewRecords(candidates, cfg, true);
  var blindReview = reviewRecords(frame, cfg, false);
  var forbidden = ['class', 'candidate_class', 'candidate_class_name', 'prediction', 'classification'].concat(BANDS);
  ee.Dictionary({candidate_n: trainReview.size(), validation_n: blindReview.size(),
    candidate_counts: trainReview.aggregate_histogram('candidate_class'),
    candidate_unique_ids: trainReview.distinct(['sample_id']).size(),
    validation_unique_ids: blindReview.distinct(['sample_id']).size(),
    shared_ids: identityOverlap(trainReview, blindReview, 'sample_id'),
    blind_forbidden_fields: blindReview.first().propertyNames().filter(ee.Filter.inList('item', forbidden)),
    training_example: trainReview.first().toDictionary(), validation_example: blindReview.first().toDictionary()
  }).evaluate(function(d, err) {
    if (!active(cfg)) return;
    if (err) {fail(cfg, 'Review export metadata check failed.', err); return;}
    print('REVIEW EXPORT PREFLIGHT: validation has no labels, predictors or predictions', d);
    if (!d.candidate_n || !d.validation_n || d.candidate_unique_ids !== d.candidate_n ||
        d.validation_unique_ids !== d.validation_n || d.shared_ids || d.blind_forbidden_fields.length) {
      fail(cfg, 'Invalid/empty review collections or blind-frame contamination.', d); return;
    }
    var prefix = cfg.exportPrefix + '_' + cfg.year + '_REVIEW_V1';
    [['TRAINING_CANDIDATES', trainReview], ['BLIND_VALIDATION', blindReview]].forEach(function(pair) {
      ['GeoJSON', 'CSV'].forEach(function(format) {
        Export.table.toDrive({collection: pair[1], description: prefix + '_' + pair[0] + '_' + format,
          folder: cfg.driveFolder, fileNamePrefix: prefix + '_' + pair[0], fileFormat: format});
      });
    });
    print('REVIEW READY: four export tasks queued (GeoJSON + CSV for each role). Start these tasks; no model was needed.');
  });
}

// Shared pilot procedure for any boundary and product-to-legend mapping.
// Review the frames externally before passing reviewed references to runWorkflow.
function runPilot(cfg) {
  progress(cfg, 'Resolving the national protected-area boundary...');
  var boundary = cfg.boundary || resolveWdpa(cfg.boundarySpec);
  var meta = boundaryMetadata(boundary);
  ee.Dictionary({count: boundary.size(), ids: boundary.aggregate_array('SITE_ID'),
    metadata: meta.toList(boundary.size()).map(function(f) {return ee.Feature(f).toDictionary();})
  }).evaluate(function(b, error) {
    if (!active(cfg)) return;
    if (error || !b.count || b.ids.filter(function(id, i, a) {return a.indexOf(id) === i;}).length !== 1 || (cfg.expectedSiteId && b.ids.some(function(id) {
      return String(id) !== String(cfg.expectedSiteId);
    }))) {fail(cfg, 'Boundary identity check failed.', error || b); return;}
    print('BOUNDARY LOADED: national WDPA record(s); exclude international duplicates', b);
    var region = geometryOf(boundary);
    (cfg.map || Map).centerObject(boundary, 6);
    (cfg.map || Map).addLayer(boundary.style({color: 'ffff00', fillColor: '00000000'}), {}, cfg.exportPrefix + ' WDPA');
    progress(cfg, 'Checking annual embedding tiles...');
    var tiles = embeddingCollection(region, cfg.year);
    ee.Dictionary({tile_count: tiles.size(), time_start: tiles.aggregate_min('system:time_start'),
      time_end: tiles.aggregate_max('system:time_end'), tile_ids: tiles.aggregate_array('system:index')
    }).evaluate(function(t, err) {
    if (!active(cfg)) return;
      if (err || !t.tile_count) {fail(cfg, 'Embedding availability/date query failed.', err || t); return;}
      print('EMBEDDINGS: selected calendar year, all 64 bands A00..A63, clipped to boundary', cfg.year, t);
      print('PROPOSED SITE LEGEND (product-supported, pending human interpretation)', cfg.classNames);
      print('PRELIMINARY COMPUTATIONAL DEFAULTS â€” not accuracy/sample-size requirements', {
        trees: cfg.trees, candidate_cap_per_class: cfg.pilotCandidateCapPerClass,
        candidate_spacing_scale_m: cfg.pilotCandidateScale,
        validation_locations: cfg.pilotValidationLocations, exclusion_m: cfg.pilotExclusionMeters});
      progress(cfg, 'Preparing separated diagnostic training and holdout samples...');
      var image = tiles.select(BANDS).mosaic().clip(region);
      var frame = validationFrame(region, cfg, cfg.seed + 1, 'pilot_holdout');
      var blindFrame = validationFrame(region, cfg, cfg.seed + 2, 'validation');
      var candidates = prepareCandidates(image, region, frame.merge(blindFrame), cfg);
      if (cfg.exportReferencePreparation) exportReferencePreparation(candidates, blindFrame, cfg);
      print('Blind independent-reference frame is separate from the product-labelled pilot holdout. Its labels are never generated here.');
      if (cfg.mode === 'candidate_preparation') {
        print('CANDIDATE PREPARATION COMPLETE: reviewed training and validation labels still required.');
        print('Candidate counts', candidates.aggregate_histogram('candidate_class')); return;
      }
      if (cfg.mode !== 'smoke_test') throw new Error('Pilot mode must be candidate_preparation or smoke_test.');
      // Explicit diagnostic promotion ONLY. Neither collection is scientific truth.
      var train = candidates.map(function(f) {return f.set(cfg.labelProperty, f.get('candidate_class'));});
      var diagnosticGrid = ee.Image.pixelCoordinates(ee.Projection(cfg.crs).atScale(cfg.scale));
      var val = image.addBands(diagnosticGrid.rename(['grid_x', 'grid_y']))
        .addBands(candidateLabels(region, cfg).rename(cfg.labelProperty)).sampleRegions({
        collection: frame, properties: ['sample_id', 'unit_id', 'role', 'reviewed', 'label_source'],
        scale: cfg.scale, projection: ee.Projection(cfg.crs), tileScale: cfg.tileScale, geometries: true})
        .map(function(f) {return f.set({label_source: 'ESA_WORLDCOVER_V200_PILOT', reference_year: cfg.year,
          pixel_id: ee.Number(f.get('grid_x')).floor().toInt64().format('%d').cat('_').cat(ee.Number(f.get('grid_y')).floor().toInt64().format('%d'))});});
      ee.Dictionary({candidate_training_per_class: train.aggregate_histogram(cfg.labelProperty),
        product_holdout_per_class: val.aggregate_histogram(cfg.labelProperty),
        training_n: train.size(), drawn_validation_locations: frame.size(), labelled_product_holdout_n: val.size(),
        unique_holdout_pixels: val.distinct(['pixel_id']).size(),
        shared_ids: identityOverlap(train, val, 'sample_id'),
        shared_units: identityOverlap(train, val, 'unit_id'),
        shared_locations: ee.FeatureCollection(ee.Join.simple().apply(train, val,
          ee.Filter.withinDistance({distance: cfg.scale, leftField: '.geo', rightField: '.geo', maxError: 1}))).size()
      }).evaluate(function(s, e) {
    if (!active(cfg)) return;
        if (e) {fail(cfg, 'Candidate sampling failed.', e); return;}
        print('CANDIDATES USED AS PSEUDO-TRAINING / PRODUCT HOLDOUT (not independent validation)', s);
        if (!s.training_n || !s.labelled_product_holdout_n || s.labelled_product_holdout_n !== s.drawn_validation_locations ||
          s.unique_holdout_pixels !== s.labelled_product_holdout_n || s.shared_ids || s.shared_units || s.shared_locations ||
          cfg.classValues.some(function(c) {return !s.candidate_training_per_class[String(c)];})) {
          fail(cfg, 'Missing diagnostic holdout observations, sample collisions or unsupported training classes.', s); return;
        }
        print('Training-supported classes', Object.keys(s.candidate_training_per_class));
        print('Proposed classes absent from candidate training; not learned by classifier',
          cfg.classValues.filter(function(c) {return !s.candidate_training_per_class[String(c)];}));
        print('INDEPENDENT LOCATIONS: disjoint. INDEPENDENT LABELS: NO. No validation tuning performed.');
        print('Scientific validation: NOT YET. Product agreement is a diagnostic, including its sampling/legend bias.');
        fitAndEvaluate(image, region, train, val, cfg, 'PRODUCT_LABEL_PILOT_NOT_VALIDATED');
      });
    });
  });
}

exports.version = VERSION;
exports.exportCompleted = function(result) {exportResults(result, result.config, result.status);};
exports.runWorkflow = runWorkflow;
exports.runPilot = runPilot;
exports.resolveWdpa = resolveWdpa;
exports.prepareCandidates = prepareCandidates;
exports.validationFrame = validationFrame;
exports.validateConfig = validateConfig;


/* Additive v0.2c adapter, evaluated in the same scope AFTER the unmodified v0.2 core. */
VERSION = '0.2c';
exports.version = VERSION;

exports.prepareTeacher = function(cfg, done) {
  var boundary = resolveWdpa(cfg.boundarySpec);
  boundary.aggregate_array('SITE_ID').evaluate(function(ids, err) {
    if (err || !ids || !ids.length || ids.some(function(x) {return String(x) !== String(cfg.expectedSiteId);})) {
      cfg.onError('Boundary identity check failed.', err || ids); return;
    }
    var region = geometryOf(boundary);
    var image = embeddingCollection(region, cfg.year).select(BANDS).mosaic().clip(region);
    var frame = validationFrame(region, cfg, cfg.seed + 1, 'pilot_holdout');
    var blind = validationFrame(region, cfg, cfg.seed + 2, 'validation');
    var guarded = {};
    Object.keys(cfg).forEach(function(k) {guarded[k] = cfg[k];});
    guarded.pilotExclusionMeters = cfg.pilotExclusionMeters + Math.SQRT2 * cfg.scale + 1;
    var candidates = prepareCandidates(image, region, frame.merge(blind), guarded);
    // Sample on the actual 10 m analysis grid before retrieving image chips.
    var train = candidates.map(function(f) {return f.set('class', f.get('candidate_class'));});
    var val = frame.map(function(f) {return f.set('class', -1);});
    var st = sampleReferences(image, train, cfg), sv = sampleReferences(image, val, cfg);
    ee.Dictionary({original_train_n: train.size(), original_holdout_n: frame.size()}).evaluate(function(d, e) {
      if (e) {cfg.onError('Teacher-frame sampling failed.', e); return;}
      st.evaluate(function(t, te) {
        if (te) {cfg.onError('Teacher training-frame sampling failed.', te); return;}
        sv.evaluate(function(v, ve) {
          if (ve) {cfg.onError('Teacher holdout sampling failed.', ve); return;}
          d.training = t.features; d.holdout = v.features;
          if (d.training.length !== d.original_train_n || d.holdout.length !== d.original_holdout_n) {
            cfg.onError('Missing embedding observations; no silent point loss.', d); return;
          }
          done(d);
        });
      });
    });
  });
};

exports.runTeacher = function(cfg) {
  if (!cfg.teacherProvenance || cfg.year !== 2021) throw new Error('Teacher identity and supported 2021 configuration required.');
  var boundary = resolveWdpa(cfg.boundarySpec), region = geometryOf(boundary);
  var image = embeddingCollection(region, cfg.year).select(BANDS).mosaic().clip(region);
  var train = ee.FeatureCollection(cfg.training), val = ee.FeatureCollection(cfg.validation);
  var separation = ee.Filter.withinDistance({distance: cfg.separationMeters + 1,
    leftField: '.geo', rightField: '.geo', maxError: 1});
  ee.Dictionary({train_n: train.size(), val_n: val.size(),
    train_ids: train.distinct(['sample_id']).size(), val_ids: val.distinct(['sample_id']).size(),
    shared_ids: identityOverlap(train, val, 'sample_id'), shared_units: identityOverlap(train, val, 'unit_id'),
    collisions: ee.FeatureCollection(ee.Join.simple().apply(train, val, separation)).size(),
    inside_train: train.filterBounds(region).size(), inside_val: val.filterBounds(region).size(),
    train_classes: train.aggregate_histogram('class'), val_classes: val.aggregate_histogram('class')
  }).evaluate(function(d, error) {
    if (error) {fail(cfg, 'Teacher preflight failed.', error); return;}
    var invalid = !d.train_n || !d.val_n || d.shared_ids || d.shared_units || d.collisions ||
      d.train_ids !== d.train_n || d.val_ids !== d.val_n || d.inside_train !== d.train_n || d.inside_val !== d.val_n;
    [d.train_classes, d.val_classes].forEach(function(h) {
      Object.keys(h).forEach(function(c) {if (cfg.classValues.indexOf(Number(c)) < 0) invalid = true;});
    });
    if (invalid) {fail(cfg, 'Teacher IDs, classes, geometry or train/holdout separation invalid. No silent repairs.', d); return;}
    var st = sampleReferences(image, train, cfg), sv = sampleReferences(image, val, cfg);
    ee.Dictionary({train_n: st.size(), val_n: sv.size(), train_pixels: st.distinct(['pixel_id']).size(),
      val_pixels: sv.distinct(['pixel_id']).size(), shared: identityOverlap(st, sv, 'pixel_id'),
      support: st.aggregate_histogram('class')}).evaluate(function(s, e) {
      if (e || s.train_n !== d.train_n || s.val_n !== d.val_n || s.shared ||
        s.train_pixels !== s.train_n || s.val_pixels !== s.val_n ||
        cfg.classValues.some(function(c) {return !s.support[String(c)];})) {
        fail(cfg, 'Missing embeddings, duplicate/shared pixels or unsupported training classes.', e || s); return;
      }
      fitAndEvaluate(image, region, st, sv, cfg, 'SATLAS_TEACHER_AGREEMENT_NOT_VALIDATED');
    });
  });
};
