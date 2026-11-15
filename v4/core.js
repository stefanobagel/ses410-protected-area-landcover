/** Shared v4 GEE services. Bundled with contracts and preserved v0.2 engine.
 * SOURCE_REVISION is filled by the deterministic builder. No private fixtures.
 */
var SOURCE_REVISION='BUILD_SOURCE_HASH';
var UI_SOURCE_HASH='BUILD_UI_HASH';
var SOURCE_INPUTS=BUILD_INPUT_HASHES;
function fitAndEvaluate(image,region,train,val,cfg,status){
  if(!active(cfg))return;
  progress(cfg,'Freezing evaluated sample features for reproducible fitting...');
  var started=Date.now();
  cfg.v4SamplingAndAuditSeconds=(started-Date.parse(cfg.startedUtc))/1000;
  // A collection inside an EE Dictionary evaluates to its schema only. Explicit
  // lists are required to materialize its observations, geometry and predictors.
  ee.Dictionary({training:train.toList(train.size()),assessment:val.toList(val.size())}).evaluate(function(data,error){
    if(!active(cfg))return;if(error)return engineFail(cfg,'Feature cache evaluation failed',error);
    try{cfg.v4featureCacheSeconds=(Date.now()-started)/1000;
      var complete=cfg.onComplete;cfg.onComplete=function(report,result){
        progress(cfg,'Metrics evaluated; checking raster predictions at every assessment point on the canonical grid...');
        assessmentRasterCheck(result,function(audit,error){if(!active(cfg))return;if(error)return engineFail(cfg,error,audit);
          result.rasterAssessmentAudit=audit;report.raster_assessment_audit=audit;report.raster_check_pending=false;result.runToCompleteSeconds=(Date.now()-Date.parse(cfg.startedUtc))/1000;if(complete)complete(report,result);
        });
      };
      legacyFitAndEvaluate(image,region,ee.FeatureCollection(data.training),ee.FeatureCollection(data.assessment),cfg,status);}
    catch(e){engineFail(cfg,'Model graph construction failed',e.message);}
  });
}
function grid(c){return ee.Projection(c.crs,c.gridTransform);}
function exportBounds(region,c,scale){
  var step=scale||10;
  // Geometry coordinates in an affine Projection are pixel units. Use the native
  // CRS here so the rounding below is in ground metres, not pixel coordinates.
  var ring=ee.List(region.bounds(1,ee.Projection(c.crs)).coordinates().get(0));
  var xs=ring.map(function(p){return ee.List(p).get(0);}),ys=ring.map(function(p){return ee.List(p).get(1);});
  var xmin=ee.Number(xs.reduce(ee.Reducer.min())).divide(step).floor().multiply(step),xmax=ee.Number(xs.reduce(ee.Reducer.max())).divide(step).ceil().multiply(step);
  var ymin=ee.Number(ys.reduce(ee.Reducer.min())).divide(step).floor().multiply(step),ymax=ee.Number(ys.reduce(ee.Reducer.max())).divide(step).ceil().multiply(step);
  return ee.Geometry.Rectangle(ee.List([xmin,ymin,xmax,ymax]),c.crs,false);
}
function fcRecords(rows){return ee.FeatureCollection(rows.map(function(r){
  var p=clone(r);
  // GEE tables cannot store nested dictionaries/arrays reliably across CSV/assets.
  var jsonFields=[];Object.keys(p).forEach(function(k){if(p[k]!==null&&typeof p[k]==='object'){p[k]=JSON.stringify(p[k]);jsonFields.push(k);}});p._json_fields=JSON.stringify(jsonFields);
  return ee.Feature(ee.Geometry.Point(r.coordinates),p);
}));}
function decodeRecords(doc){
  var out=clone(doc);out.features.forEach(function(f){var fields=f.properties._json_fields?JSON.parse(f.properties._json_fields):['original_record','migration','review_history'];fields.forEach(function(k){
    if(typeof f.properties[k]==='string')f.properties[k]=JSON.parse(f.properties[k]);
  });delete f.properties._json_fields;
    // Asset geometry serialization can round a final IEEE-754 digit. Preserve the
    // exact recorded identity; tolerate only sub-micrometre serialization drift.
    var xy=f.properties.coordinates||(f.properties.checkpoint_identity&&f.properties.checkpoint_identity.coordinates);
    if(xy){var actual=f.geometry&&f.geometry.coordinates;if(!f.geometry||f.geometry.type!=='Point'||!actual||xy.length!==2||actual.length!==2||xy.some(function(v,i){return typeof v!=='number'||!isFinite(v)||typeof actual[i]!=='number'||!isFinite(actual[i])||Math.abs(v-actual[i])>1e-12;}))throw new Error('Saved coordinate/geometry conflict');
      f.geometry.coordinates=clone(xy);f.properties.coordinates=clone(xy);}
  });return out;
}
function boundary(c){var s=SITES[c.site];return resolveWdpa({name:s.name,iso3:s.iso3});}
function prepare(c,callback){
  var preparationStarted=Date.now();
  var b=boundary(c),region=b.geometry(10),tiles=embeddingCollection(region,c.year);
  ee.Dictionary({features:b.size(),ids:b.aggregate_array('SITE_ID'),area_km2:region.area(1).divide(1e6),
    boundary_source:'WCMC/WDPA/current/polygons',boundary_release:'Mutable current alias; exact selected geometry and metadata retained',
    boundary_selection:JSON.stringify({ISO3:SITES[c.site].iso3,DESIG_TYPE:'National',NAME_or_NAME_ENG_contains:SITES[c.site].name}),
    feature_ids:b.aggregate_array('system:index'),geometry_operations:'FeatureCollection.geometry(maxError10m); geodesic area(maxError1m); multipart union; no buffer',
    boundary_geojson:region,metadata:boundaryMetadata(b).toList(30),tiles:tiles.size(),tile_ids:tiles.aggregate_array('system:index')})
  .evaluate(function(d,e){if(e)return callback(null,e);if(!d.features||!d.tiles||d.ids.some(function(id){return String(id)!==String(SITES[c.site].siteId);}))return callback(null,'Boundary/year unavailable or unexpected identity');
    d.preparation_elapsed_seconds=(Date.now()-preparationStarted)/1000;d.eecu_hours='UNAVAILABLE';callback({config:clone(c),boundary:b,region:region,image:tiles.select(BANDS).mosaic().clip(region),metadata:d});});
}
function supportedYears(callback){ee.ImageCollection(EMBEDDINGS).aggregate_array('system:time_start').distinct().map(function(t){return ee.Date(t).get('year');}).distinct().sort().evaluate(callback);}
function coverage(context,scale,callback){
  var c=context.config,g=ee.Projection(c.crs,c.gridTransform),mask=context.image.mask().reduce(ee.Reducer.min()).gt(0);
  var area=ee.Image.pixelArea(),sums=area.rename('total').addBands(area.updateMask(mask).rename('valid')).reduceRegion({reducer:ee.Reducer.sum(),geometry:context.region,crs:g,scale:scale,maxPixels:1e10,tileScale:c.tileScale});
  ee.Dictionary({areas:sums,scale_m:scale,year:c.year,mask:'all64 positive masks; not a finite-value or output-raster certificate',denominator:'pixelArea on stated grid; region boundary fractions handled by EE reducer'}).evaluate(function(d,e){if(e)return callback(null,e);d.total_km2=d.areas.total/1e6;d.valid_km2=(d.areas.valid||0)/1e6;d.missing_km2=d.total_km2-d.valid_km2;d.availability_percent=100*d.valid_km2/d.total_km2;d.provisional_screen_met=d.availability_percent>=100*c.coverageThreshold;d.screen_threshold=c.coverageThreshold;callback(d,null);});
}
function annotate(f,c){
  var xy=f.geometry().transform('EPSG:4326',0.01).coordinates();
  var px=ee.Number(f.get('grid_x')).floor().toInt64(),py=ee.Number(f.get('grid_y')).floor().toInt64();
  var pid=px.format('%d').cat('_').cat(py.format('%d'));
  return f.set({grid_x:px,grid_y:py,pixel_id:pid,grid_id:c.crs+':'+c.gridTransform.join(','),lon:xy.get(0),lat:xy.get(1)});
}
function sampled(image,refs,c){return image.addBands(ee.Image.pixelCoordinates(grid(c)).rename(['grid_x','grid_y']))
  .sampleRegions({collection:refs,projection:grid(c),scale:c.scale,tileScale:c.tileScale,geometries:true}).map(function(f){return annotate(f,c);});}
function collisions(a,b,meters){return ee.FeatureCollection(ee.Join.simple().apply(a,b,
  ee.Filter.withinDistance({distance:meters,leftField:'.geo',rightField:'.geo',maxError:0.01}))).size();}
function auditSamples(train,val,c,expected,callback){
  var assessmentGeometry=val.geometry(0.01);
  var nearest=train.map(function(f){return f.set('_nearest_m',f.geometry().distance(assessmentGeometry,0.01));});
  ee.Dictionary({training_n:train.size(),assessment_n:val.size(),training_classes:train.aggregate_histogram('class'),assessment_classes:val.aggregate_histogram('class'),
    unique_train:train.distinct(['pixel_id']).size(),unique_assessment:val.distinct(['pixel_id']).size(),
    unique_train_ids:train.distinct(['sample_id']).size(),unique_assessment_ids:val.distinct(['sample_id']).size(),shared_positions:collisions(train,val,0),
    shared_pixels:identityOverlap(train,val,'pixel_id'),shared_ids:identityOverlap(train,val,'sample_id'),shared_units:identityOverlap(train,val,'unit_id'),
    required_cross_set_m:c.separationMeters,analysis_scale_m:c.scale,analysis_crs:c.crs,
    near_cross_set:collisions(train,val,c.separationMeters),minimum_cross_set_m:nearest.aggregate_min('_nearest_m'),
    block_incompatible:c.spatialProfile==='spatial_blocks'?train.merge(val).map(function(f){var old=f.get('role');return blockProperties(f,c).set('_role_mismatch',ee.Number(ee.Algorithms.If(ee.Algorithms.IsEqual(old,blockProperties(f,c).get('role')),0,1)));}).filter(ee.Filter.or(ee.Filter.eq('_role_mismatch',1),ee.Filter.lt('block_edge_m',c.blockSeparationMeters/2+1))).size():0})
  .evaluate(function(d,e){if(e)return callback(null,e);
    var floor=expected.diagnostic?1:c.reviewFloor;
    d.deficient_training=c.classValues.filter(function(k){return (d.training_classes[k]||0)<floor;});
    d.absent_assessment=c.classValues.filter(function(k){return !(d.assessment_classes[k]>0);});
    var bad=d.training_n!==expected.training||d.assessment_n!==expected.assessment||!d.assessment_n||
      d.unique_train!==d.training_n||d.unique_assessment!==d.assessment_n||d.unique_train_ids!==d.training_n||d.unique_assessment_ids!==d.assessment_n||d.shared_pixels||d.shared_ids||d.shared_units||d.shared_positions||d.near_cross_set||d.block_incompatible||d.deficient_training.length;
    callback(d,bad?'Sample loss, overlap, distance violation or deficient declared training classes; explicit configuration/labels revision required':null);
  });
}
function engineConfig(c,token,callbacks){var s=SITES[c.site];return {
  boundarySpec:{name:s.name,iso3:s.iso3},expectedSiteId:s.siteId,year:c.year,classValues:clone(c.classValues),classNames:c.classNames.reduce(function(d,n,i){d[i]=n;return d;},{}),
  palette:c.profile==='baseline'?(c.site==='salonga'?['006400','419bdf','a6c96a']:['419bdf','d9c29c','397d49']):(c.site==='salonga'?['006400','367d68','419bdf','e4bf77']:['f5d38a','bca67a','57524d','cf9c6b','79a65a','419bdf']),
  worldCoverCodes:clone(s.codes),worldCoverClasses:clone(s.remap),labelProperty:'class',crs:c.crs,scale:10,trees:c.trees,seed:c.seed,tileScale:c.tileScale,
  variablesPerSplit:c.variablesPerSplit,minLeafPopulation:c.minLeafPopulation,bagFraction:c.bagFraction,maxNodes:c.maxNodes,
  pilotCandidateCapPerClass:c.candidateCapPerClass,pilotCandidateScale:c.candidateScale,pilotValidationLocations:c.diagnosticValidationLocations,pilotExclusionMeters:c.spatialProfile==='diagnostic_2021'?c.diagnosticExclusionMeters:c.separationMeters,holdoutSeed:c.holdoutSeed,reservedSeed:c.reservedSeed,
  exportPrefix:c.site,runId:token.id,startedUtc:token.started,mode:'smoke_test',createExportTasks:false,
  isCurrent:callbacks.isCurrent,onError:callbacks.onError,onProgress:callbacks.onProgress,onComplete:callbacks.onComplete,map:callbacks.map,
  v4:c,v4token:token
};}
function runReviewed(context,rows,c,token,callbacks,finalOptions){
  finalOptions=finalOptions||{};
  if(rows.some(function(r){return r.engineering_fixture===true;})&&!context.engineeringOnly)throw new Error('Synthetic engineering fixtures cannot enter park training or performance runs; use isolated software tests');
  if(context.engineeringOnly&&rows.some(function(r){return r.engineering_fixture!==true;}))throw new Error('Isolated engineering context requires exclusively marked synthetic records');
  var role=finalOptions.finalWorkflow?'final_validation':'development_assessment';
  if(finalOptions.finalWorkflow&&(!finalOptions.independentConfirmed||!finalOptions.design||!finalOptions.protocol||!finalOptions.destination))throw new Error('Final evaluation requires explicit independence attestation, design, protocol and restricted destination');
  var selected=rows.filter(function(r){return r.status==='accepted'&&(r.role==='training'||r.role===role);});
  var missingAssessment=rows.filter(function(r){return r.role===role&&r.status!=='accepted';});
  if(missingAssessment.length&&!finalOptions.nonresponse)throw new Error('Assessment nonresponse requires an explicit domain/exclusion rationale; never silently thin or replace observations');
  selected.forEach(function(r){var errors=validateRecord(r,c,{finalWorkflow:!!finalOptions.finalWorkflow});if(errors.length)throw new Error(errors.join('; '));});
  var training=selected.filter(function(r){return r.role==='training';}),validation=selected.filter(function(r){return r.role===role;});
  if(!training.length||!validation.length)throw new Error('Accepted training and separate assessment records are required');
  if(finalOptions.finalWorkflow&&validation.some(function(r){return r.label_source!=='independent_reference';}))throw new Error('Final references must have independently sourced labels');
  var tr=fcRecords(training),va=fcRecords(validation),all=tr.merge(va),inside=all.filterBounds(context.region);
  inside.size().evaluate(function(n,e){if(!callbacks.isCurrent())return;if(e||n!==selected.length)return callbacks.onError('Reference outside processing boundary or membership failure',e);
    var t=sampled(context.image,tr,c),v=sampled(context.image,va,c);
    auditSamples(t,v,c,{training:training.length,assessment:validation.length},function(a,error){if(!callbacks.isCurrent())return;if(error)return callbacks.onError(error,a);
      var cfg=engineConfig(c,token,callbacks);cfg.v4audit=a;cfg.v4audit.assessment_nonresponse_n=missingAssessment.length;cfg.v4audit.nonresponse_rationale=finalOptions.nonresponse||'';cfg.v4audit.record_status_counts={};rows.forEach(function(r){var k=r.role+':'+r.status;cfg.v4audit.record_status_counts[k]=(cfg.v4audit.record_status_counts[k]||0)+1;});cfg.v4context=context;cfg.v4records=rows;cfg.v4uncertain=rows.filter(function(r){return r.status==='uncertain'||r.status==='unresolved';});cfg.v4final=clone(finalOptions);
      cfg.synthetic=context.engineeringOnly===true;
      fitAndEvaluate(context.image,context.region,t,v,cfg,cfg.synthetic?'SYNTHETIC_ENGINEERING_NOT_PERFORMANCE':finalOptions.finalWorkflow?'INDEPENDENT_REFERENCE_SAMPLE_EVALUATION':'DEVELOPMENT_REFERENCE_SAMPLE_EVALUATION');
    });
  });
}
function runDiagnostic(context,c,token,callbacks){
  if(c.profile!=='baseline'||c.year!==2021)throw new Error('WorldCover2021 diagnostic requires explicit baseline2021 profile');
  var cfg=engineConfig(c,token,callbacks);cfg.boundary=context.boundary;cfg.v4context=context;cfg.v4records=[];cfg.v4uncertain=[];
  runPilot(cfg);
}
function blockProperties(f,c){
  var xy=f.geometry().transform(c.crs,0.01).coordinates(),x=ee.Number(xy.get(0)),y=ee.Number(xy.get(1));
  var bx=x.divide(c.blockMeters).floor(),by=y.divide(c.blockMeters).floor();
  var u=x.subtract(bx.multiply(c.blockMeters)),v=y.subtract(by.multiply(c.blockMeters));
  // UTM is used for block allocation only. Exact geodesic cross-role checks run
  // after sampling. No claim that projected edge margins guarantee ground spacing.
  var edge=u.min(ee.Number(c.blockMeters).subtract(u)).min(v).min(ee.Number(c.blockMeters).subtract(v));
  var hash=bx.multiply(73856093).add(by.multiply(19349663)).abs().mod(100);
  return f.set({block_x:bx,block_y:by,block_edge_m:edge,role:ee.Algorithms.If(hash.lt(70),'training','development_assessment')});
}
function queue(context,records,n,round,callback,source){
  var c=context.config,im=context.image,training=im.sample({region:context.region,projection:grid(c),scale:100,numPixels:1000,seed:c.seed,tileScale:4});
  source=source||'embedding_clusters';
  if(source==='worldcover_proposals'&&(c.profile!=='baseline'||c.year!==2021))throw new Error('WorldCover2021 proposals require baseline2021; no detailed or temporal promotion');
  var clusterer=ee.Clusterer.wekaKMeans(c.clusters).train(training,BANDS);
  var strata=(source==='worldcover_proposals'?candidateLabels(context.region,engineConfig(c,{},{})):im.cluster(clusterer)).rename('candidate_stratum');
  var points=strata.stratifiedSample({numPoints:Math.ceil(n/(source==='worldcover_proposals'?c.classValues.length:c.clusters)),region:context.region,projection:grid(c),scale:c.candidateScale,seed:c.seed+round,tileScale:4,geometries:true});
  var marked=sampled(im.addBands(strata),points,c);
  if(source==='worldcover_proposals')marked=marked.map(function(f){return f.set('proposed_class',f.get('candidate_stratum'));});
  var existing=fcRecords(records);var allowed=ee.FeatureCollection(ee.Join.inverted().apply(marked,existing,
    ee.Filter.withinDistance({distance:15,leftField:'.geo',rightField:'.geo',maxError:0.01})));
  var reserved=existing.filter(ee.Filter.inList('role',['development_assessment','final_validation']));
  if(context.reserved)reserved=reserved.merge(context.reserved);
  allowed=ee.FeatureCollection(ee.Join.inverted().apply(allowed,reserved,ee.Filter.withinDistance({distance:c.separationMeters,leftField:'.geo',rightField:'.geo',maxError:0.01})));
  if(c.spatialProfile==='spatial_blocks')allowed=allowed.map(function(f){return blockProperties(f,c);}).filter(ee.Filter.gte('block_edge_m',c.blockSeparationMeters/2+1));
  else allowed=allowed.map(function(f){return f.set('role','training');});
  ee.Dictionary({requested:n,proposed:points.size(),drawn:marked.size(),lost_after_features:points.size().subtract(marked.size()),eligible_after_exclusions:allowed.size(),achieved:allowed.limit(n).size(),strata:allowed.limit(n).aggregate_histogram('candidate_stratum'),
    records:allowed.limit(n).toList(n).map(function(f){return ee.Feature(f).toDictionary(['pixel_id','grid_id','lon','lat','candidate_stratum','proposed_class','role','block_x','block_y']);})}).evaluate(callback);
}
function reviewScenes(context,coordinates,callback){
  var c=context.config,point=ee.Geometry.Point(coordinates),cs=ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
  var scenes=ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(point).filterDate(c.year+'-01-01',(c.year+1)+'-01-01')
    .sort('CLOUDY_PIXEL_PERCENTAGE').limit(c.reviewSceneLimit).linkCollection(cs,['cs_cdf'])
    .map(function(im){var value=im.select('B4').updateMask(im.select('cs_cdf').gte(c.cloudScoreMinimum)).reduceRegion({reducer:ee.Reducer.first(),geometry:point,crs:grid(c),scale:10,maxPixels:100}).get('B4');return im.set('_clear_at_point',ee.Algorithms.If(ee.Algorithms.IsEqual(value,null),0,1));})
    .filter(ee.Filter.eq('_clear_at_point',1));
  scenes.toList(c.reviewSceneLimit).map(function(x){var im=ee.Image(x);return ee.Dictionary({id:ee.String('COPERNICUS/S2_SR_HARMONIZED/').cat(ee.String(im.get('system:index'))),date:im.date().format('YYYY-MM-dd')});}).evaluate(function(rows,error){
    if(error)return callback(null,{kind:'SERVICE_ERROR',detail:String(error)});
    if(!Array.isArray(rows))return callback(null,{kind:'INVALID_RESPONSE',detail:'Expected scene array'});
    callback(rows,null);
  });
}
function displayedScene(id,c){var cs=ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
  // linkCollection is an ImageCollection method, not an Image method.
  var joined=ee.ImageCollection([ee.Image(id)]).linkCollection(cs,['cs_cdf']).first();return joined.updateMask(joined.select('cs_cdf').gte(c.cloudScoreMinimum));
}
function blindFrame(context,assetId,n,callback){
  var c=context.config,proposed=!assetId,frame=assetId?ee.FeatureCollection(assetId):ee.FeatureCollection.randomPoints({region:context.region,points:n,seed:c.reservedSeed,maxError:10});
  frame=frame.map(function(f){var xy=f.geometry().transform('EPSG:4326',0.01).coordinates();var id=proposed?ee.String('PROPOSED_NEW_').cat(c.site).cat('_'+c.year+'_').cat(f.id()):f.get('sample_id');
    return ee.Feature(f.geometry(),{sample_id:id,unit_id:proposed?id:f.get('unit_id'),longitude:xy.get(0),latitude:xy.get(1),frame_status:proposed?'PROPOSED_UNAPPROVED_NOT_REVIEW_V1':'COORDINATOR_SUPPLIED_GEOMETRY_ONLY'});});
  ee.Dictionary({n:frame.size(),types:geometryTypes(frame),records:frame.limit(1000).toList(1000)}).evaluate(function(d,e){if(e)return callback(null,e);if(d.n>1000||Object.keys(d.types).some(function(t){return t!=='Point';}))return callback(null,'Blind frame must contain1..1000 point geometries; never silently thin');if(!d.n)return callback(null,'Blind frame empty');callback({type:'FeatureCollection',features:d.records},null);});
}
function assessmentRasterCheck(result,callback){
  var checkStarted=Date.now(),c=result.config.v4,predictions=result.predictions;
  var probe=result.classification.sampleRegions({collection:predictions,properties:['sample_id','prediction'],projection:grid(c),scale:10,tileScale:c.tileScale,geometries:true});
  var mismatch=probe.filter(ee.Filter.notEquals({leftField:'prediction',rightField:'classification'}));
  var missing=ee.FeatureCollection(ee.Join.inverted().apply(predictions,probe,ee.Filter.equals({leftField:'sample_id',rightField:'sample_id'})));
  ee.Dictionary({expected_n:predictions.size(),raster_n:probe.size(),unique_ids:probe.distinct(['sample_id']).size(),missing_n:missing.size(),mismatch_n:mismatch.size(),
    missing:missing.limit(20).toList(20),mismatches:mismatch.limit(20).toList(20),crs:c.crs,transform:c.gridTransform,scale_m:10,scope:'All assessment locations; does not certify full raster'}).evaluate(function(a,e){
      if(a)a.elapsed_seconds=(Date.now()-checkStarted)/1000;callback(a,e?'Canonical raster assessment check failed: '+e:a.missing_n||a.mismatch_n||a.unique_ids!==a.expected_n?'Raster/table disagreement or missing canonical pixels; inspect audit IDs/coordinates/grid/masks':null);
    });
}
function engineeringGridFixture(c,callback){
  var xy=ee.Image.pixelCoordinates(grid(c)),image=ee.Image.constant(1).rename('engineering_value').updateMask(xy.select('x').floor().toInt64().neq(30002));
  var refs=ee.FeatureCollection([[300005,7800005],[300006,7800006],[300015,7800005],[300025,7800005]].map(function(p,i){return ee.Feature(ee.Geometry.Point(p,c.crs),{sample_id:'SYNTHETIC_GRID_'+i,unit_id:'SYNTHETIC_UNIT_'+i});}));
  var out=sampled(image,refs,c),a=ee.Feature(out.filter(ee.Filter.eq('sample_id','SYNTHETIC_GRID_0')).first()),b=ee.Feature(out.filter(ee.Filter.eq('sample_id','SYNTHETIC_GRID_2')).first());
  ee.Dictionary({scope:'SYNTHETIC geometry/mask fixture only; no ecological labels or RF',input_n:refs.size(),sampled_n:out.size(),unique_pixels:out.distinct(['pixel_id']).size(),
    snapped_adjacent_ground_m:a.geometry().distance(b.geometry(),.01),points:out.toList(10),grid_crs:c.crs,transform:c.gridTransform}).evaluate(callback);
}
function reviewImagery(context){var c=context.config;
  var cs=ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(context.region).filterDate(c.year+'-01-01',(c.year+1)+'-01-01')
    .linkCollection(cs,['cs_cdf']).map(function(im){return im.updateMask(im.select('cs_cdf').gte(c.cloudScoreMinimum));}).median().select(['B4','B3','B2']);
}
function exportPackage(result,folder,derivative,options){
  if(!result.completed||!active(result.config))throw new Error('Export requires current completed result');
  options=options||{};var cfg=result.config,c=cfg.v4,context=cfg.v4context;
  if(cfg.v4final&&cfg.v4final.finalWorkflow&&folder!==cfg.v4final.destination)throw new Error('Final-validation export destination mismatch');
  if(!folder||!folder.trim())throw new Error('Export folder required');
  if(result.exportFolder&&result.exportFolder!==folder)throw new Error('Run export destination is frozen after its first request');result.exportFolder=folder;
  var prefix='hammer_v4_'+c.site+'_'+c.year+'_'+c.profile+'_'+cfg.runId,image=result.classification,extent=exportBounds(result.region,c);
  function table(key,fc,format){requestOutput(result,key,function(){Export.table.toDrive({collection:fc,description:prefix+'_'+key,folder:folder,fileNamePrefix:prefix+'_'+key,fileFormat:format||'CSV'});});}
  requestOutput(result,'10m',function(){Export.image.toDrive({image:image.unmask(255,false).toByte(),description:prefix+'_10m',folder:folder,fileNamePrefix:prefix+'_10m',region:extent,
    crs:c.crs,crsTransform:c.gridTransform,maxPixels:1e13,fileFormat:'GeoTIFF',formatOptions:{cloudOptimized:true,noData:255}});});
  if(derivative===30||derivative===60)requestOutput(result,derivative+'m_MODE',function(){Export.image.toDrive({image:image.setDefaultProjection(grid(c)).reduceResolution({reducer:ee.Reducer.mode(),maxPixels:100}).reproject({crs:c.crs,scale:derivative}).unmask(255,false).toByte(),
    description:prefix+'_'+derivative+'m_MODE',folder:folder,region:exportBounds(result.region,c,derivative),crs:c.crs,crsTransform:[derivative,0,0,0,-derivative,0],maxPixels:1e13,fileFormat:'GeoTIFF',formatOptions:{cloudOptimized:true,noData:255}});});
  var legend=ee.FeatureCollection(c.classNames.map(function(name,i){return ee.Feature(null,{class_code:i,name:name,definition:c.classDefinitions[i],color:cfg.palette[i],legend_id:c.legendId});}));
  var tables={legend:legend,training_pixels:result.training,predictions:result.predictions,metrics:result.summary,per_class:result.perClass,confusion:result.matrixCells,
    references:cfg.v4records&&cfg.v4records.length?fcRecords(cfg.v4records):result.training.merge(result.validation),uncertain:fcRecords(cfg.v4uncertain||[])};
  Object.keys(tables).forEach(function(k){table(k,tables[k]);});
  if(options.archives){table('boundary_snapshot',ee.FeatureCollection([ee.Feature(context.region,{boundary_metadata:JSON.stringify(context.metadata),grid:JSON.stringify(c.gridTransform),source_sha256:SOURCE_REVISION})]),'GeoJSON');
    table('input_snapshot',cfg.v4records&&cfg.v4records.length?fcRecords(cfg.v4records):result.training.merge(result.validation),'GeoJSON');}
  if(options.area){
    var grouped=ee.Image.constant(1).updateMask(image.mask()).rename('pixel_count').addBands(image).reduceRegion({reducer:ee.Reducer.sum().unweighted().group({groupField:1,groupName:'class_code'}),geometry:result.region.bounds(1),crs:c.crs,crsTransform:c.gridTransform,maxPixels:1e10,tileScale:c.tileScale});
    table('mapped_grid_hectares',ee.FeatureCollection(ee.List(grouped.get('groups',ee.List([]))).map(function(g){g=ee.Dictionary(g);return ee.Feature(null,{class_code:g.get('class_code'),valid_pixels:g.get('sum'),mapped_grid_hectares:ee.Number(g.get('sum')).multiply(.01),year:c.year,legend_id:c.legendId,scope:'UNADJUSTED_PROJECTED_10M_GRID_AREA_NOT_ERROR_ADJUSTED'});})));}
  table('provenance',ee.FeatureCollection([ee.Feature(null,{run_id:cfg.runId,software_version:VERSION,reference_schema:'HAMMER_REFERENCE_V4_1',checkpoint_schema:'HAMMER_CHECKPOINT_V4_1',import_adapter:'V4_IMPORT_2',source_sha256:SOURCE_REVISION,ui_source_sha256:UI_SOURCE_HASH,source_inputs:JSON.stringify(SOURCE_INPUTS),year:c.year,
    settings:JSON.stringify(c),boundary:JSON.stringify(context.metadata),sample_audit:JSON.stringify(cfg.v4audit||{}),raster_assessment_audit:JSON.stringify(result.rasterAssessmentAudit||{}),status:result.status,
    datasets:JSON.stringify(cfg.synthetic?{scope:'SYNTHETIC_CONSTANT_IMAGE_NO_REMOTE_IMAGERY'}:{embedding:EMBEDDINGS,bands:BANDS,diagnostic_reference:result.status==='PRODUCT_LABEL_PILOT_NOT_VALIDATED'?'ESA/WorldCover/v200:2021':'NOT_USED_AS_LABELS',review_imagery:'COPERNICUS/S2_SR_HARMONIZED',clear_score:'GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED'}),
    mosaic_order:'Native ImageCollection order retained for historical regression; tile_ids in boundary metadata record order; no new sorting departure',
    sampling_design:cfg.v4final&&cfg.v4final.design||'unweighted development sample',eecu_hours:'UNAVAILABLE',elapsed_seconds:result.elapsedSeconds,run_to_complete_seconds:result.runToCompleteSeconds||null,feature_cache_seconds:cfg.v4featureCacheSeconds||null,sampling_and_audit_seconds:cfg.v4SamplingAndAuditSeconds||null,preparation_seconds:context.metadata.preparation_elapsed_seconds||null,task_requests:JSON.stringify(result.exportRequests||{}),
    limitations:'Unweighted product agreement or reference sample metrics; no independent accuracy automatically certified, no design-weighted CI; nonresponse and out-of-legend cover require explicit interpretation; preview is display-dependent'})]));
  result.exported=true;return prefix;
}
exports.grid=grid;exports.recordsToFeatures=fcRecords;exports.decodeRecords=decodeRecords;
exports.exportBounds=exportBounds;
exports.prepare=prepare;exports.supportedYears=supportedYears;exports.coverage=coverage;
exports.queue=queue;exports.reviewImagery=reviewImagery;exports.runReviewed=runReviewed;exports.runDiagnostic=runDiagnostic;
exports.exportPackage=exportPackage;exports.auditSamples=auditSamples;exports.sourceRevision=SOURCE_REVISION;

exports.reviewScenes=reviewScenes;exports.displayedScene=displayedScene;exports.blindFrame=blindFrame;exports.assessmentRasterCheck=assessmentRasterCheck;
exports.engineeringGridFixture=engineeringGridFixture;
