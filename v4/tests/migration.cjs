'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),h=require('../contracts');
let passed=0;function test(name,fn){fn();console.log('PASS '+name);passed++;}
const copy=x=>JSON.parse(JSON.stringify(x));
const base=h.config({site:'salonga'}),detail=h.config({site:'salonga',profile:'detailed'}),opts={sourceAsset:'projects/SYNTHETIC/assets/labels'};
// Execute only the real pure exporter functions, with synthetic state and mocked EE
// serialization; never load/evaluate frozen point data or manufacture real labels.
const vedantPath=path.join(__dirname,'../../reviews/github-main-b10d328-2026-11-09/LULC_Mapping.js');const vedant=fs.existsSync(vedantPath)?fs.readFileSync(vedantPath,'utf8'):require('./exporters.cjs').vedant+'function labeled(';
const fn=vedant.slice(vedant.indexOf('function toFeature('),vedant.indexOf('function labeled('));
function vf(changes={},site='Salonga National Park'){
 const classes=site==='Skeleton Coast Park'?h.config({site:'skeleton_coast',profile:'detailed'}).classNames:detail.classNames;
 const ctx={ee:{Geometry:{Point:coordinates=>({type:'Point',coordinates})},Feature:(geometry,properties)=>({type:'Feature',geometry,properties})},currentSite:site,currentYear:2021,currentClasses:classes.map(name=>({name}))};
 vm.runInNewContext(fn,ctx);
 return copy(ctx.toFeature(Object.assign({lon:21,lat:-2,labelId:0,dataset:'training',status:'labeled',source:'queue',stratum:2,reviewer:'SYNTHETIC'},changes)));
}
const reviewPath=path.join(__dirname,'../../APP_REFERENCE_REVIEW_2021.js');const review=fs.existsSync(reviewPath)?fs.readFileSync(reviewPath,'utf8'):require('./exporters.cjs').v02+'function prepareDownloads(';
const reviewFn=review.slice(review.indexOf('function outputProperties('),review.indexOf('function prepareDownloads('));
function rf(decision='accept',changes={}){
 const p=Object.assign({sample_id:'FROZEN_SYNTHETIC_1',unit_id:'unit_1',site:'salonga',longitude:21,latitude:-2,coordinate_crs:'EPSG:4326',role:'candidate_training',reference_year:2021,legend_version:'SES410_INITIAL_2021_V1',label_source:'manual_reference',reference_protocol:'SYNTHETIC_PROTOCOL',boundary_site_id:555697863},changes);
 const e={decision,reviewed_class:0,reviewer:'SYNTHETIC',confidence:'high',imagery_source:'SYNTHETIC_SCENE',imagery_id:'SYNTHETIC_ID',imagery_dates:'2021-01-01',review_status:decision==='pending'?'pending':'completed',notes:'Synthetic software fixture'};
 const ctx={original:()=>copy(p),states:{test:{[p.sample_id]:e}}};vm.runInNewContext(reviewFn,ctx);
 return {type:'Feature',geometry:{type:'Point',coordinates:[p.longitude,p.latitude]},properties:copy(ctx.outputProperties({key:'test'},0))};
}
function mig(f,source='vedant_v32',c=detail,mapping){return h.migrate(f,source,c,mapping,opts);}
test('Actual Vedant exporter writes class zero, not observation ID',()=>{const f=vf(),r=mig(f);assert.equal(f.properties.label_id,0);assert.equal(r.class,0);assert.notEqual(r.sample_id,0);assert.equal(r.original_record.properties.label_id,0);assert.equal(r.role,'training');});
test('Two same-class points get distinct deterministic IDs',()=>{const a=mig(vf()),b=mig(vf({lon:21.01}));assert.notEqual(a.sample_id,b.sample_id);assert.notEqual(a.unit_id,b.unit_id);assert.equal(mig(vf()).sample_id,a.sample_id);assert.ok(a.migration.generated_ids.sample_id);});
test('Class changes do not change observation identity',()=>assert.equal(mig(vf()).sample_id,mig(vf({labelId:1})).sample_id));
test('Actual validation dataset becomes development',()=>assert.equal(mig(vf({dataset:'validation'})).role,'development_assessment'));
test('Both actual display names normalize and resolve source legend',()=>{const r=mig(vf({},'Skeleton Coast Park'),'vedant_v32',h.config({site:'skeleton_coast',profile:'detailed'}));assert.equal(r.site,'skeleton_coast');assert.equal(r.legend_id,'SES410_SKELETON_COAST_DETAILED_V1');assert.equal(r.migration.original_site,'Skeleton Coast Park');assert.equal(mig(vf()).legend_id,detail.legendId);});
test('Unknown site fails explicitly',()=>assert.throws(()=>mig(vf({},'unknown')),/Unknown source site/));
test('Both detailed legends preserve their highest actual class codes',()=>{assert.equal(mig(vf({labelId:3})).class,3);const r=mig(vf({labelId:5},'Skeleton Coast Park'),'vedant_v32',h.config({site:'skeleton_coast',profile:'detailed'}));assert.equal(r.class,5);});
test('Existing observation and reference unit IDs survive',()=>{const f=vf();Object.assign(f.properties,{sample_id:'real-id',unit_id:'shared-unit'});const r=mig(f);assert.equal(r.sample_id,'real-id');assert.equal(r.unit_id,'shared-unit');});
test('Feature IDs retained in deterministic identity provenance',()=>{const f=vf();f.id='feature-a';const g=copy(f);g.id='feature-b';assert.notEqual(mig(f).sample_id,mig(g).sample_id);assert.equal(mig(f).original_record.id,'feature-a');});
test('ID generation requires explicit asset identity',()=>assert.throws(()=>h.migrate(vf(),'vedant_v32',detail),/source asset/));
test('Different source assets affect generated IDs',()=>assert.notEqual(mig(vf()).sample_id,h.migrate(vf(),'vedant_v32',detail,null,{sourceAsset:'other'}).sample_id));
test('Role conflicts preserve explicit locked role',()=>{const f=vf();f.properties.role='final_validation';const r=mig(f);assert.equal(r.role,'final_validation');assert.equal(r.status,'unresolved');assert.match(r.migration.reasons.join(),/Conflicting role/);});
test('Recognized explicit training role survives',()=>{const f=vf();f.properties.role='training';assert.equal(mig(f).role,'training');});
test('Unrecognized dataset fails rather than infer from blocks',()=>assert.throws(()=>mig(vf({dataset:'train'})),/dataset/));
test('Salonga water/flooded numeric collision requires mapping',()=>assert.throws(()=>mig(rf(),'v02',detail),/mapping/));
test('Explicit water mapping preserves meanings',()=>{const f=rf();f.properties.reviewed_class=1;const r=mig(f,'v02',detail,{id:'SYNTHETIC_WATER_V1',sourceLegend:base.legendId,targetLegend:detail.legendId,classes:{1:2}});assert.equal(r.class,2);assert.equal(r.original_record.properties.reviewed_class,1);assert.equal(r.legend_version,detail.legendId);});
test('Mapping without version ID fails',()=>assert.throws(()=>mig(rf(),'v02',detail,{sourceLegend:base.legendId,targetLegend:detail.legendId,classes:{}}),/versioned/));
test('Broad forest cannot be split by explicit class lookup',()=>{const r=mig(rf(),'v02',detail,{id:'SYNTHETIC',sourceLegend:base.legendId,targetLegend:detail.legendId,classes:{0:0}});assert.equal(r.class,null);assert.equal(r.status,'unresolved');assert.match(r.migration.reasons.join(),/new review evidence/);});
for(const [decision,status] of Object.entries({accept:'accepted',reject:'rejected',unresolved:'unresolved',pending:'pending'}))test('Actual v02 '+decision+' checkpoint',()=>{const f=rf(decision),r=mig(f,'v02',base);assert.equal(r.status,status);assert.equal(r.class,0);assert.equal(r.original_record.properties.decision,decision);assert.ok(r.migration.decisions.some(s=>s.includes('Converted v0.2')));});
test('Accepted v02 complete evidence is retained',()=>{const r=mig(rf(),'v02',base);assert.deepEqual(h.validateRecord(r,base),[]);assert.equal(r.reviewer,'SYNTHETIC');assert.equal(r.imagery_id,'SYNTHETIC_ID');assert.equal(r.boundary_site_id,555697863);});
test('Missing evidence returns explicit reasons, not acceptance',()=>{const f=rf();delete f.properties.imagery_id;delete f.properties.reference_protocol;const r=mig(f,'v02',base);assert.equal(r.status,'unresolved');assert.ok(r.migration.reasons.includes('Acceptance requires imagery_id'));assert.ok(r.migration.reasons.includes('Acceptance requires reference_protocol'));});
test('Invalid evidence types cannot pass',()=>{const f=rf();f.properties.reviewer=7;f.properties.confidence='certain';const r=mig(f,'v02',base);assert.equal(r.status,'unresolved');assert.match(r.migration.reasons.join(),/reviewer/);assert.match(r.migration.reasons.join(),/confidence/);});
test('Frozen final identity, geometry and evidence survive',()=>{const f=rf('accept',{role:'validation'}),r=mig(f,'v02',base);assert.equal(r.role,'final_validation');assert.equal(r.sample_id,f.properties.sample_id);assert.deepEqual(r.coordinates,f.geometry.coordinates);assert.equal(r.status,'accepted');assert.ok(h.validateRecord(r,base).some(x=>x.includes('Locked')));assert.equal(h.importRecords(f,'v02',base,null,opts).ready,false);});
test('Repeated v4 migration is idempotent without provenance growth',()=>{const r=mig(vf());const b=h.migrate(r,'v4_schema1',detail);assert.deepEqual(b,r);assert.equal(JSON.stringify(h.migrate(b,'v4_schema1',detail)).length,JSON.stringify(b).length);});
test('Existing v4 accepted record is retained',()=>{const r=mig(rf(),'v02',base);assert.deepEqual(h.migrate(r,'v4_schema1',base),r);});
test('V4 save/reload container preserves original source and stable IDs',()=>{const a=mig(vf()),b=h.migrate(a,'v4_schema1',detail,null,{sourceAsset:'projects/SYNTHETIC/assets/resaved'});assert.equal(a.sample_id,b.sample_id);assert.equal(b.source_asset,opts.sourceAsset);assert.equal(b.migration.import_assets.length,2);assert.deepEqual(h.migrate(b,'v4_schema1',detail,null,{sourceAsset:'projects/SYNTHETIC/assets/resaved'}),b);});
test('Existing v4 cannot reassign frozen role or edit original identity',()=>{const r=mig(rf('accept',{role:'validation'}),'v02',base);for(const [key,value] of [['role','training'],['sample_id','altered'],['coordinates',[22,-2]]]){const bad=copy(r);bad[key]=value;if(key==='coordinates'){bad.longitude=22;}assert.throws(()=>h.migrate(bad,'v4_schema1',base),/cannot/);}});
test('Geometry-only Feature properties import succeeds',()=>{const f=vf();delete f.properties.lon;delete f.properties.lat;assert.deepEqual(mig(f).coordinates,[21,-2]);});
test('CSV numeric strings and .geo are normalized with original retained',()=>{const f=rf(),p=copy(f.properties);p.longitude='21';p.latitude='-2';p.reference_year='2021';p.reviewed_class='0';p['.geo']=JSON.stringify(f.geometry);const r=mig(p,'v02',base);assert.equal(r.class,0);assert.equal(r.reference_year,2021);assert.equal(r.original_record.reviewed_class,'0');});
test('Geometry/property conflict and nonpoint reject',()=>{const f=vf();f.geometry.coordinates=[22,-2];assert.throws(()=>mig(f),/Conflicting geometry/);f.geometry.type='Polygon';assert.throws(()=>mig(f),/Point/);});
test('Source legend contradiction rejects',()=>{const f=vf();f.properties.legend_id=base.legendId;assert.throws(()=>mig(f),/contradicts/);});
test('Invalid class and year types reject',()=>{const invalid=vf();invalid.properties.label_id=99;assert.throws(()=>mig(invalid),/range/);const f=vf();f.properties.label_id='water';assert.throws(()=>mig(f),/integer/);f.properties.label_id=0;f.properties.year=true;assert.throws(()=>mig(f),/integer/);});
test('Batch FeatureCollection reports duplicates without discarding review history',()=>{const f=vf(),result=h.importRecords({type:'FeatureCollection',features:[f,copy(f)]},'vedant_v32',detail,null,opts);assert.equal(result.records.length,2);assert.equal(result.duplicates.length,1);assert.equal(result.ready,false);assert.ok(result.records.every(r=>r.status==='unresolved'));});
test('Conflicting labels share same observation identity and quarantine both',()=>{const r=h.importRecords([vf(),vf({labelId:1})],'vedant_v32',detail,null,opts);assert.equal(r.conflicts.length,1);assert.equal(r.records[0].sample_id,r.records[1].sample_id);assert.ok(r.records.every(x=>x.status==='unresolved'));});
test('Different IDs cannot conceal shared coordinate conflict',()=>{const a=vf(),b=vf({labelId:1});a.id='a';b.id='b';const r=h.importRecords([a,b],'vedant_v32',detail,null,opts);assert.equal(r.conflicts.length,1);});
test('Shared pixels and units are detected separately from rounded coordinates',()=>{const a=vf(),b=vf({lon:21.000001,labelId:1});Object.assign(a.properties,{pixel_id:'p',grid_id:'grid10'});Object.assign(b.properties,{pixel_id:'p',grid_id:'grid10'});assert.equal(h.importRecords([a,b],'vedant_v32',detail,null,opts).conflicts.length,1);});
test('Import input arrays, Features, mappings and config remain unchanged',()=>{const f={type:'FeatureCollection',features:[vf(),vf({labelId:1})]},before=JSON.stringify([f,detail,opts]);h.importRecords(f,'vedant_v32',detail,null,opts);assert.equal(JSON.stringify([f,detail,opts]),before);});
test('Batch reports bad record by index and retains good records',()=>{const r=h.importRecords([vf(),vf({},'unknown')],'vedant_v32',detail,null,opts);assert.equal(r.records.length,1);assert.equal(r.errors[0].index,1);assert.equal(r.ready,false);});
test('Vedant uncertain sentinel stays unlabeled',()=>{const r=mig(vf({labelId:-1,status:'uncertain'}));assert.equal(r.class,null);assert.equal(r.status,'uncertain');});
console.log(JSON.stringify({passed,fixtureSource:'real exporter functions; synthetic state only'}));

