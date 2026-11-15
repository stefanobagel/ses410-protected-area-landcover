/** Hammer v4 integration contracts. CommonJS and Earth Engine module compatible.
 * Pure configuration/reference logic; no EE calls or private reference fixtures.
 * Canonical v4 application contracts; scientific qualification is data-dependent.
 */
var VERSION = '4.0.1';
var DEFAULTS = {
  year:2021, profile:'baseline', spatialProfile:'distance', separationMeters:100,
  scale:10, trees:200, seed:410, variablesPerSplit:8, minLeafPopulation:1,
  bagFraction:0.5, maxNodes:null, tileScale:4, clusters:8, blockMeters:10000,
  blockSeparationMeters:500, cloudScoreMinimum:0.6, coverageThreshold:0.99,
  candidateScale:100, candidateCapPerClass:40, holdoutSeed:411, reservedSeed:412,
  diagnosticExclusionMeters:100,diagnosticValidationLocations:200,
  reviewFloor:10, proposedTrainingTarget:100, proposedAssessmentTarget:50,
  proposedMacroF1:0.80, proposedClassScore:0.75,
  reviewSceneLimit:30, reviewCircleDiameter:100
};
var SITES = {
  skeleton_coast:{name:'Skeleton Coast',iso3:'NAM',siteId:885,crs:'EPSG:32733',zoom:17,
    baseline:['Water','Bare / sparse cover','Natural vegetation'],
    detailed:['Dune sand','Gravel plain','Rock / dark surface','Dry riverbed','Sparse vegetation','Water / wet sand'],
    codes:[80,60,10,20,30,90,95,100],remap:[0,1,2,2,2,2,2,2]},
  salonga:{name:'Salonga',iso3:'COD',siteId:555697863,crs:'EPSG:32734',zoom:14,
    baseline:['Tree cover / forest candidate','Water','Nonforest natural vegetation'],
    detailed:['Terra firme forest','Swamp / flooded forest','River / open water','Non-forest'],
    codes:[10,80,20,30,90],remap:[0,1,2,2,2]}
};
var GUIDANCE = {
  skeleton_coast:[
    'Dune sand: unconsolidated aeolian sand with dune morphology; exclude gravel, bedrock and wet sand.',
    'Gravel plain: exposed coarse surface / desert pavement; uncertain substrate remains unresolved.',
    'Rock / dark surface: exposed rock supported by terrain evidence; darkness or shadow alone is insufficient.',
    'Dry riverbed: dry channel substrate with channel morphology. Dominant visible vegetation takes Sparse vegetation; record channel context in notes.',
    'Sparse vegetation: visible vegetation dominates the interpretation unit; record mixing and confidence.',
    'Water / wet sand: evidence of water or wet substrate, explicitly recorded in notes. Dry beach is not this class. Uncertain wetness remains unresolved.'
  ],
  salonga:[
    'Terra firme forest: forest with affirmative non-inundation evidence appropriate to year; broad forest alone cannot distinguish flooded forest.',
    'Swamp / flooded forest: forest plus inundation / wetland evidence; dark canopy alone is insufficient.',
    'River / open water: exposed water surface; exclude forest canopy over water and terrain shadow.',
    'Non-forest: reviewed non-forest cover; record subtype and mixtures. Ambiguous canopy / water transitions remain unresolved.'
  ]
};
function isInteger(v){return typeof v==='number'&&isFinite(v)&&Math.floor(v)===v;}
function clone(x){return JSON.parse(JSON.stringify(x));}
function fail(message){throw new Error(message);}
function config(overrides){
  var c=clone(DEFAULTS);Object.keys(overrides||{}).forEach(function(k){
    if(!Object.prototype.hasOwnProperty.call(c,k) && k!=='site')fail('Unknown configuration field '+k);
    c[k]=overrides[k];
  });
  if(!SITES[c.site])fail('Select a supported site');
  if(['baseline','detailed'].indexOf(c.profile)<0)fail('Unknown legend profile');
  if(['distance','spatial_blocks','diagnostic_2021'].indexOf(c.spatialProfile)<0)fail('Unknown spatial profile');
  ['year','trees','seed','variablesPerSplit','minLeafPopulation','clusters','reviewFloor','tileScale','candidateCapPerClass','holdoutSeed','reservedSeed','diagnosticValidationLocations','reviewSceneLimit'].forEach(function(k){if(!isInteger(c[k])||c[k]<0)fail('Invalid '+k);});
  if(c.reviewSceneLimit<1||c.reviewSceneLimit>100||!(c.reviewCircleDiameter>0&&c.reviewCircleDiameter<=1000))fail('Invalid scene limit / orientation circle');
  if(c.trees<1||c.variablesPerSplit<1||c.variablesPerSplit>64||c.minLeafPopulation<1||c.clusters<2||c.reviewFloor<1)fail('Invalid model / queue settings');
  if(c.scale!==10)fail('Canonical analysis grid must remain 10m; use export derivatives');
  ['separationMeters','blockSeparationMeters','diagnosticExclusionMeters'].forEach(function(k){if(typeof c[k]!=='number'||!isFinite(c[k])||c[k]<0)fail('Invalid '+k);});
  if(!(c.blockMeters>0)||!(c.candidateScale>0)||c.candidateCapPerClass<1||c.diagnosticValidationLocations<1||c.tileScale<1||c.tileScale>16)fail('Invalid sampling / tile settings');
  if(!(c.bagFraction>0&&c.bagFraction<=1)||!(c.cloudScoreMinimum>=0&&c.cloudScoreMinimum<=1)||!(c.coverageThreshold>=0&&c.coverageThreshold<=1))fail('Invalid fraction');
  if(c.maxNodes!==null&&(!isInteger(c.maxNodes)||c.maxNodes<1))fail('maxNodes must be null (unlimited) or positive integer');
  if(c.blockMeters<=c.blockSeparationMeters)fail('Block width must exceed separation');
  if(c.spatialProfile==='spatial_blocks'){
    if(!overrides||!Object.prototype.hasOwnProperty.call(overrides,'separationMeters'))c.separationMeters=c.blockSeparationMeters;
    if(c.separationMeters!==c.blockSeparationMeters)fail('Block profile actual cross-set exclusion must equal blockSeparationMeters');
  }
  if(c.spatialProfile==='diagnostic_2021'&&(c.year!==2021||c.profile!=='baseline'))fail('Regression diagnostic requires baseline legend and 2021');
  c.crs=SITES[c.site].crs;c.gridTransform=[10,0,0,0,-10,0];
  c.legendId=c.profile==='baseline'?'SES410_INITIAL_2021_V1':('SES410_'+c.site.toUpperCase()+'_DETAILED_V1');
  c.classNames=clone(SITES[c.site][c.profile]);c.classValues=c.classNames.map(function(_,i){return i;});
  c.classDefinitions=c.profile==='detailed'?clone(GUIDANCE[c.site]):(c.site==='salonga'?[
    'WorldCover2021 code10 tree cover; broad forest candidate, without dry/flooded distinction.',
    'WorldCover2021 code80 permanent water; not flooded forest.',
    'WorldCover2021 codes20,30,90 shrubland, grassland and herbaceous wetland; excludes cropland, built and bare classes.'
  ]:[
    'WorldCover2021 code80 permanent water; wet sand is not independently identified by this proxy.',
    'WorldCover2021 code60 bare/sparse vegetation; cannot distinguish dunes, gravel, rock or dry channels.',
    'WorldCover2021 codes10,20,30,90,95,100 tree/shrub/grass/herbaceous wetland/mangrove/moss-lichen cover; product-derived broad natural-cover candidate.'
  ]);
  c.version=VERSION;return c;
}
function validateRecord(r,c,options){
  options=options||{};var errors=[];
  ['sample_id','unit_id','role','site','legend_id','source_asset','schema_version','reference_year','status'].forEach(function(k){if(r[k]===undefined||r[k]===null||r[k]==='')errors.push('Missing '+k);});
  if(!Array.isArray(r.coordinates)||r.coordinates.length!==2||!r.coordinates.every(function(x){return typeof x==='number'&&isFinite(x);})||Math.abs(r.coordinates[0])>180||Math.abs(r.coordinates[1])>90)errors.push('Invalid WGS84 Point');
  if(['training','development_assessment','final_validation'].indexOf(r.role)<0)errors.push('Unknown role; never infer role from current blocks');
  if(['pending','accepted','uncertain','rejected','unresolved'].indexOf(r.status)<0)errors.push('Unknown status');
  if(r.site!==c.site)errors.push('Site mismatch');
  if(r.legend_id!==c.legendId)errors.push('Explicit legend migration required');
  if(r.reference_year!==c.year)errors.push('Year mismatch');
  if(!isInteger(r.reference_year))errors.push('Reference year must be integer');
  if(present(r.date_reviewed)&&!validCalendarDate(r.date_reviewed))errors.push('Invalid review calendar date');
  if(present(r.reviewed_at)&&(typeof r.reviewed_at!=='string'||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?Z$/.test(r.reviewed_at)||!validCalendarDate(r.reviewed_at.slice(0,10))))errors.push('Invalid reviewed_at UTC timestamp');
  if(present(r.class)&&c.classValues.indexOf(r.class)<0)errors.push('Class outside declared legend');
  if(r.status==='accepted'){
    if(c.classValues.indexOf(r.class)<0)errors.push('Class outside declared legend');
    ['reviewer','confidence','imagery_source','imagery_id','imagery_dates','reference_protocol','label_source','source_asset'].forEach(function(k){if(typeof r[k]!=='string'||!r[k].trim())errors.push('Acceptance requires '+k);});
    if(['high','medium','low'].indexOf(r.confidence)<0)errors.push('Invalid confidence');
    var datesError=evidenceDateError(r.imagery_dates,c.year);if(datesError)errors.push(datesError);
    if(r.label_source==='worldcover_proxy'&&c.profile!=='baseline')errors.push('WorldCover cannot supply detailed preset distinctions');
  }
  if(r.role==='final_validation'&&!options.finalWorkflow)errors.push('Locked final reference requires separate workflow');
  if(r.role==='final_validation'&&productLineage(r))errors.push('Product-derived lineage cannot become independent final reference by renaming fields');
  return errors;
}
function productLineage(r){
  var current=r;
  for(var depth=0;current&&depth<12;depth++){
    var p=current.type==='Feature'?current.properties:current;
    if(!p)return false;
    if(/worldcover|world_cover|product|pilot|proxy/i.test(String(p.label_source||''))||p.role==='product_holdout'||p.queue_source==='worldcover_proposals')return true;
    current=p.original_record;
  }
  return !!current; // Unbounded/unresolved lineage is not final-reference proof.
}
function validCalendarDate(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  var p=v.split('-').map(Number),y=p[0],m=p[1],d=p[2],leap=y%4===0&&(y%100!==0||y%400===0);
  return y>0&&m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
}
function evidenceDateError(v,year){
  if(typeof v!=='string'||!v.trim())return 'Dated evidence is required';
  var a=v.split(';').map(function(s){return s.trim();});
  if(a.some(function(s){return !validCalendarDate(s);}))return 'Use real acquisition dates YYYY-MM-DD separated by semicolons';
  return a.some(function(s){return Number(s.slice(0,4))===year;})?'':'At least one acquisition must match reference year '+year;
}
function validateCheckpointMetadata(r,coordinates){
  if(!r.checkpoint_identity)return;
  var expected=r.checkpoint_identity;
  ['sample_id','unit_id','coordinates','role','site','reference_year','legend_id'].forEach(function(k){
    var actual=k==='coordinates'?coordinates:r[k];
    if(JSON.stringify(expected[k])!==JSON.stringify(actual))fail('Checkpoint identity or geometry changed: '+k);
    if(r.pending_draft&&r.pending_draft[k]!==undefined&&JSON.stringify(r.pending_draft[k])!==JSON.stringify(actual))fail('Draft cannot change observation '+k);
  });
}
function present(v){return v!==undefined&&v!==null&&v!=='';}
function canonicalSite(v){
  var sites={salonga:'salonga','Salonga National Park':'salonga',skeleton_coast:'skeleton_coast','Skeleton Coast Park':'skeleton_coast'};
  if(typeof v!=='string'||!Object.prototype.hasOwnProperty.call(sites,v))fail('Unknown source site: '+String(v));
  return sites[v];
}
function integer(v,field){
  if(typeof v==='string'&&/^-?\d+$/.test(v))v=Number(v);
  if(typeof v!=='number'||!isInteger(v))fail('Expected integer '+field);
  return v;
}
function coordinatePair(v){
  if(!Array.isArray(v)||v.length!==2)fail('Expected WGS84 Point coordinates');
  return v.map(function(x){if(typeof x==='string'&&x.trim()!=='')x=Number(x);if(typeof x!=='number'||!isFinite(x))fail('Invalid coordinate');return x;});
}
function migrate(record,source,c,mapping,options){
  options=options||{};
  if(!record||typeof record!=='object'||Array.isArray(record))fail('Expected Feature or property object');
  if(['v02','vedant_v32','v4_schema1','u1_1'].indexOf(source)<0)fail('Unknown source schema');
  var feature=record.type==='Feature',r=clone(feature?record.properties:record);
  if(!r||typeof r!=='object'||Array.isArray(r))fail('Expected Feature properties');
  if(source==='v4_schema1'&&r.schema_version!=='HAMMER_REFERENCE_V4_1')fail('Unknown v4 schema version');
  var previous=source==='v4_schema1'&&r.migration,decisions=previous?clone(previous.decisions):[];
  if(previous&&!r.original_record)fail('Migration original record is missing; provenance cannot be discarded');
  var reasons=previous?clone(previous.reasons||[]):[],generated=previous?clone(previous.generated_ids||{}):{};
  var original=source==='v4_schema1'&&r.original_record?clone(r.original_record):clone(record);
  var u1=source==='u1_1';
  if(u1){
    if(options.sourceVersion!=='1.1.2'||!options.sourceAsset)fail('U1 import requires explicit verified sourceVersion1.1.2 and sourceAsset');
    if(present(r.queue_id)&&String(r.queue_id).indexOf('SES410_UNIFIED_U1_1')<0)fail('U1 queue schema/version mismatch');
    if(present(r.reviewed_class)&&present(r.class)&&integer(r.reviewed_class,'reviewed_class')!==integer(r.class,'class'))fail('U1 class fields conflict');
    if(present(r.label_id)){
      var u1Class=integer(r.label_id,'label_id');
      if(present(r.reviewed_class)&&integer(r.reviewed_class,'reviewed_class')!==u1Class||present(r.class)&&integer(r.class,'class')!==u1Class)fail('U1 class fields conflict');
      if(!present(r.reviewed_class)&&!present(r.class))r.class=u1Class;
    }
    decisions.push('Imported supplied Anthony U1.1.2 format; no U1.1.3 source inferred');
  }
  var geometry=feature?record.geometry:null;
  if(!geometry&&present(r['.geo'])){
    try{geometry=typeof r['.geo']==='string'?JSON.parse(r['.geo']):r['.geo'];}catch(e){fail('Invalid CSV .geo JSON');}
  }
  if(geometry&&(geometry.type!=='Point'||(geometry.crs&&geometry.crs.properties&&geometry.crs.properties.name!=='EPSG:4326')))fail('Expected WGS84 Point geometry');
  if(present(r.coordinate_crs)&&r.coordinate_crs!=='EPSG:4326')fail('Unsupported coordinate CRS');
  var coords=geometry?coordinatePair(geometry.coordinates):null;
  var alternatives=[];
  if(present(r.coordinates))alternatives.push(coordinatePair(r.coordinates));
  if(present(r.longitude)||present(r.latitude))alternatives.push(coordinatePair([r.longitude,r.latitude]));
  if(present(r.lon)||present(r.lat))alternatives.push(coordinatePair([r.lon,r.lat]));
  alternatives.forEach(function(x){if(coords&&JSON.stringify(coords)!==JSON.stringify(x))fail('Conflicting geometry / coordinate fields');coords=x;});
  if(!coords||Math.abs(coords[0])>180||Math.abs(coords[1])>90)fail('Invalid WGS84 Point');
  r.coordinates=coords;
  validateCheckpointMetadata(r,coords);
  var sourceSite=r.site;r.site=canonicalSite(r.site);
  if(r.site!==c.site)fail('Source site does not match selected site');
  var sourceAsset=r.source_asset;
  var importAssets=previous?clone(previous.import_assets||[]):[];
  if(present(options.sourceAsset)){
    if(typeof options.sourceAsset!=='string'||!options.sourceAsset.trim())fail('Invalid source asset');
    if(present(sourceAsset)&&sourceAsset!==options.sourceAsset&&source!=='v4_schema1')fail('Conflicting source asset');
    if(source!=='v4_schema1'||!present(sourceAsset))sourceAsset=options.sourceAsset;
    if(importAssets.indexOf(options.sourceAsset)<0)importAssets.push(options.sourceAsset);
  }
  if(sourceAsset==='UNSPECIFIED')sourceAsset=null;
  if(present(sourceAsset)&&(typeof sourceAsset!=='string'||!sourceAsset.trim()))fail('Invalid source asset');
  r.source_asset=sourceAsset||'';
  if(present(r.reference_year))r.reference_year=integer(r.reference_year,'reference_year');
  if(present(r.year)&&present(r.reference_year)&&integer(r.year,'year')!==r.reference_year)fail('Conflicting reference year fields');
  if(!present(r.reference_year)&&present(r.year))r.reference_year=integer(r.year,'year');
  var expected=source==='v02'||u1?'SES410_INITIAL_2021_V1':source==='vedant_v32'?'SES410_'+r.site.toUpperCase()+'_DETAILED_V1':r.legend_id;
  var recorded=r.legend_id||r.legend_version;
  if(present(r.legend_id)&&present(r.legend_version)&&r.legend_id!==r.legend_version)fail('Conflicting legend identities');
  if(source!=='v4_schema1'&&present(recorded)&&recorded!==expected)fail('Recorded legend contradicts verified source schema');
  r.legend_id=recorded||expected;
  var roleMap={training:'training',candidate_training:'training',validation:source==='vedant_v32'?'development_assessment':'final_validation',development_assessment:'development_assessment',final_validation:'final_validation'};
  var explicit=present(r.role)&&Object.prototype.hasOwnProperty.call(roleMap,r.role)?roleMap[r.role]:null;
  if(u1&&r.role==='validation'){
    if(['development_assessment','final_validation'].indexOf(options.roleResolution)>=0&&typeof options.roleProvenance==='string'&&options.roleProvenance.trim()){
      if(options.roleResolution==='final_validation'&&(!options.finalWorkflow||/worldcover|product_holdout|pilot|proxy/i.test(r.label_source||'')))fail('Product or ordinary workflow cannot become independent final reference');
      explicit=options.roleResolution;decisions.push('Explicit U1 role resolution: '+options.roleProvenance);
    }else{explicit='restricted_unresolved';reasons.push('Ambiguous U1 validation role requires explicit provenance and role resolution');}
  }
  if(present(r.role)&&!explicit)fail('Unknown explicit role');
  var datasetRole=null;
  if(source==='vedant_v32'&&present(r.dataset)){
    if(['training','validation'].indexOf(r.dataset)<0)fail('Unknown Vedant dataset');
    datasetRole=r.dataset==='training'?'training':'development_assessment';
  }
  r.role=explicit||datasetRole;
  if(previous&&previous.canonical_role&&previous.canonical_role!==r.role)fail('Imported observation role cannot be reassigned');
  if(previous&&r.original_record){
    var root=r.original_record.type==='Feature'?r.original_record.properties:r.original_record;
    if(root&&(root.role==='final_validation'||(root.role==='validation'&&previous.source==='v02'))&&r.role!=='final_validation')fail('Original locked final role cannot be reassigned');
    if(root){
      ['sample_id','unit_id'].forEach(function(k){if(present(root[k])&&r[k]!==root[k])fail('Original '+k+' cannot be changed');});
      var rootCoordinates=r.original_record.type==='Feature'?r.original_record.geometry.coordinates:root.coordinates||
        (present(root.longitude)?[root.longitude,root.latitude]:present(root.lon)?[root.lon,root.lat]:null);
      if(rootCoordinates&&JSON.stringify(coordinatePair(rootCoordinates))!==JSON.stringify(coords))fail('Original observation coordinates cannot be changed');
    }
  }
  if(explicit&&datasetRole&&explicit!==datasetRole)reasons.push('Conflicting role and dataset; explicit role preserved');
  if(source==='v02'||u1){
    var statuses={accept:'accepted',reject:'rejected',unresolved:'unresolved',pending:'pending'};
    if(present(r.decision)&&!Object.prototype.hasOwnProperty.call(statuses,r.decision))fail('Unknown v0.2 decision');
    r.status=present(r.decision)?statuses[r.decision]:(u1&&r.reviewed===1?'accepted':'pending');
    if(present(r.reviewed_class))r.class=integer(r.reviewed_class,'reviewed_class');
    else if(present(r.class))r.class=integer(r.class,'class');
    else r.class=null; // Never promote candidate_class into a reviewed label.
    decisions.push('Converted v0.2 decision '+String(r.decision||'pending')+' to '+r.status);
  }else if(source==='vedant_v32'){
    var code=present(r.label_id)?integer(r.label_id,'label_id'):null;
    if(present(r.class)&&integer(r.class,'class')!==code)reasons.push('Conflicting class and label_id');
    r.class=code===-1?null:code;
    if(r.status==='labeled'){r.status='unresolved';reasons.push('Legacy labeled status requires evidence review');}
    if(r.status==='uncertain'&&code===-1)r.class=null;
    // source describes collection, not scientific label provenance.
  }else if(present(r.class))r.class=integer(r.class,'class');
  var sourceSize=source==='v02'||u1?3:source==='vedant_v32'?SITES[r.site].detailed.length:null;
  if(sourceSize&&r.class!==null&&(!isInteger(r.class)||r.class<0||r.class>=sourceSize))fail('Source class out of range');
  var featureId=feature&&present(record.id)?record.id:r['system:index'];
  if(!present(r.sample_id)){
    if(!sourceAsset||!present(r.reference_year))fail('Generating observation ID requires source asset and reference year');
    // Lossless tuple encoding, not a short collision-prone hash; class/role omitted.
    var identity=[sourceAsset,r.site,r.reference_year,coords,present(featureId)?String(featureId):null];
    r.sample_id='legacy-observation-v1:'+encodeURIComponent(JSON.stringify(identity));
    generated.sample_id=r.sample_id;decisions.push('Generated observation ID from asset/site/year/coordinates/feature ID');
  }
  if(!present(r.unit_id)){r.unit_id=r.sample_id;generated.unit_id=r.unit_id;decisions.push('Generated point-unit ID; no ecological independence inferred');}
  ['sample_id','unit_id'].forEach(function(k){if(typeof r[k]!=='string'||!r[k].trim())fail('Expected nonempty string '+k);});
  if(r.legend_id!==c.legendId){
    if(!mapping||typeof mapping.id!=='string'||!mapping.id.trim()||mapping.sourceLegend!==r.legend_id||mapping.targetLegend!==c.legendId||!mapping.classes)fail('Explicit versioned legend mapping required');
    var target=mapping.classes[String(r.class)];
    // Broad forest cannot acquire a dry/flooded distinction through a lookup.
    if(r.site==='salonga'&&r.legend_id==='SES410_INITIAL_2021_V1'&&r.class===0&&c.profile==='detailed')target=null;
    if(!isInteger(target)||c.classValues.indexOf(target)<0){r.class=null;r.status='unresolved';reasons.push('Ambiguous legend conversion requires new review evidence');}
    else{r.class=target;decisions.push('Applied versioned mapping '+mapping.id);}
    r.legend_id=c.legendId;
    // The original legend_version is preserved in original_record, not contradictory canonical fields.
    if(present(r.legend_version))r.legend_version=r.legend_id;
  }
  r.schema_version='HAMMER_REFERENCE_V4_1';r.original_record=original;
  var issues=validateRecord(r,c,{finalWorkflow:true});
  reasons=reasons.concat(issues);
  if(reasons.length&&r.status!=='rejected')r.status='unresolved';
  r.migration={version:'V4_IMPORT_2',source:previous?previous.source:source,
    canonical_role:r.role,
    resolutions:previous?clone(previous.resolutions||[]):[],
    original_site:previous?previous.original_site:sourceSite,source_asset:sourceAsset||'',
    generated_ids:generated,import_assets:importAssets,decisions:decisions.filter(function(v,i,a){return a.indexOf(v)===i;}),reasons:reasons.filter(function(v,i,a){return a.indexOf(v)===i;})};
  return r;
}
function importRecords(input,source,c,mapping,options){
  options=options||{};
  var list=input&&input.type==='FeatureCollection'?input.features:Array.isArray(input)?input:[input];
  if(!Array.isArray(list))fail('Expected FeatureCollection features array');
  var records=[],errors=[],conflicts=[],duplicates=[],seen=Object.create(null);
  list.forEach(function(item,index){
    try{
      var r=migrate(item,source,c,mapping,options),at=records.length,keys=[
        'id:'+r.sample_id,'unit:'+r.unit_id,
        'point:'+JSON.stringify([r.site,r.reference_year,r.coordinates])];
      if(present(r.pixel_id)&&present(r.grid_id))keys.push('pixel:'+JSON.stringify([r.site,r.reference_year,r.grid_id,r.pixel_id]));
      var matches=[];keys.forEach(function(k){(seen[k]||[]).forEach(function(i){if(matches.indexOf(i)<0)matches.push(i);});});
      matches.forEach(function(i){var old=records[i],samePoint=JSON.stringify(old.coordinates)===JSON.stringify(r.coordinates);
        var kind=old.class!==r.class||old.role!==r.role||old.legend_id!==r.legend_id||!samePoint?'conflict':'duplicate';
        var issue={first:i,incoming:at,source_index:index,kind:kind};
        (kind==='conflict'?conflicts:duplicates).push(issue);
        // Keep all review history; fitting must not choose one silently.
        [old,r].forEach(function(x){x.status='unresolved';x.migration.reasons.push('Import '+kind+' requires reconciliation');});
      });
      records.push(r);keys.forEach(function(k){if(!seen[k])seen[k]=[];seen[k].push(at);});
    }catch(e){errors.push({index:index,message:e.message});}
  });
  var restricted=records.filter(function(r){return r.role==='restricted_unresolved'||r.role==='final_validation'&&!options.finalWorkflow;}).length;
  return {records:records,errors:errors,duplicates:duplicates,conflicts:conflicts,restrictedFinalCount:restricted,
    ready:!restricted&&errors.length===0&&conflicts.length===0&&duplicates.length===0&&records.every(function(r){return !r.migration.reasons.length;})};
}
function metrics(matrix){
  var n=matrix.length;if(!n||matrix.some(function(r){return r.length!==n||r.some(function(v){return !isInteger(v)||v<0;});}))fail('Invalid confusion matrix');
  var total=0,correct=0,classes=[];
  matrix.forEach(function(row,i){var ref=row.reduce(function(a,b){return a+b;},0),pred=matrix.reduce(function(a,r){return a+r[i];},0),tp=row[i];total+=ref;correct+=tp;
    classes.push({reference_n:ref,prediction_n:pred,tp:tp,fp:pred-tp,fn:ref-tp,precision:pred?tp/pred:null,recall:ref?tp/ref:null,f1:ref+pred?2*tp/(ref+pred):null});});
  return {rows:'reference',columns:'prediction',n:total,correct:correct,overall:total?correct/total:null,classes:classes,macroF1:classes.every(function(c){return c.reference_n>0;})?classes.reduce(function(a,c){return a+c.f1;},0)/n:null,scientificAcceptance:false};
}
function lifecycle(){var revision=0,pending=null,done=null,exported=false;return {
  invalidate:function(){revision++;pending=null;done=null;exported=false;},
  begin:function(c){if(pending)fail('Run already pending');done=null;exported=false;pending={revision:revision,configuration:clone(c)};return pending;},
  current:function(token){return !!token&&token.revision===revision&&(pending===token||done===token);},
  complete:function(token){if(pending!==token||token.revision!==revision)return false;done=token;pending=null;return true;},
  exportOnce:function(token){if(done!==token||token.revision!==revision||exported)fail('Export requires current completed unsubmitted run');exported=true;}
};}
exports.version=VERSION;exports.defaults=clone(DEFAULTS);exports.sites=clone(SITES);exports.guidance=clone(GUIDANCE);
exports.validCalendarDate=validCalendarDate;exports.evidenceDateError=evidenceDateError;
exports.validateCheckpointMetadata=validateCheckpointMetadata;
exports.productLineage=productLineage;
exports.config=config;exports.validateRecord=validateRecord;exports.migrate=migrate;exports.metrics=metrics;exports.lifecycle=lifecycle;

exports.importRecords=importRecords;

