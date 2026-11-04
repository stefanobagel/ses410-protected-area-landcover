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
