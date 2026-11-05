'use strict';
// Auth token is ephemeral stdin only; never saved or printed.
const fs = require('fs');
const path = require('path');
const ee = require('@google/earthengine');
const defaults = require('./config.json');
let chunks = [];
process.stdin.on('data', b => chunks.push(b));
process.stdin.on('end', () => main(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
function main(job) {
  let ended = false;
  const timer = setTimeout(() => finish({error:'Earth Engine operation exceeded 20 minutes.'}), 1200000);
  function finish(value) {
    if (ended) return;
    ended = true; clearTimeout(timer);
    process.stdout.write(JSON.stringify(value) + '\n', () => process.exit(0));
  }
  const map = {addLayer(){},centerObject(){}};
  let descriptors = [];
  function capture(kind, args) {
    let item = {kind, params:{...args}};
    const key = kind === 'image' ? 'image' : 'collection';
    item.params[key] = ee.Serializer.toJSON(args[key]);
    if (item.params.region) item.params.region = ee.Serializer.toJSON(args.region);
    descriptors.push(item);
  }
  let logs = [];
  function log(...items) { logs.push(items.filter(x => typeof x === 'string').join(' ')); }
  const exporter = {image:{toDrive:a=>capture('image',a)}, table:{toDrive:a=>capture('table',a)}};
  const core = fs.readFileSync(path.join(__dirname,'baseline/SES410_landcover_v0_2.js'),'utf8');
  const extension = fs.readFileSync(path.join(__dirname,'extension.js'),'utf8');
  const hammer = {};
  new Function('ee','Map','Export','print','exports',core+'\n'+extension)(ee,map,exporter,log,hammer);
  const site = defaults.sites[job.site];
  if (!site) {finish({error:'Unknown site.'});return;}
  const cfg = {boundarySpec:{iso3:site.iso3,name:site.name}, expectedSiteId:site.id,
    year:2021, classValues:[0,1,2], classNames:site.names,palette:site.palette,
    labelProperty:'class',scale:10,crs:site.crs,trees:200,seed:410,tileScale:4,
    worldCoverCodes:site.codes,worldCoverClasses:site.mapping,
    pilotCandidateCapPerClass:40,pilotCandidateScale:100,pilotValidationLocations:200,
    pilotExclusionMeters:100,separationMeters:100,
    mode:'smoke_test',exportPrefix:site.key,driveFolder:'SES410_v02c',
    ...job.settings,runId:job.run_id,startedUtc:job.started_utc,map,
    isCurrent:()=>true,onProgress:log,
    onError:(message, detail)=>finish({error:message,detail:detail instanceof Error?detail.message:detail,logs}),
    onComplete:(report,result)=>{
      try {
        hammer.exportCompleted(result);
        // Correct inherited provenance for the actual teacher branch.
        const last = descriptors[descriptors.length-1];
        let provenance = ee.Deserializer.fromJSON(last.params.collection);
        provenance = provenance.map(f=>f.set({software_version:'0.2c',parent_version:'0.2.0',
          candidate_source:job.action==='teacher'?'SATLAS_PRETRAIN_TRAINED_LAND_COVER_HEAD':
            job.action==='approved'?'See accepted reference protocol':'ESA/WorldCover/v200',
          teacher_provenance:JSON.stringify(job.settings?.teacherProvenance || {}),
          reference_design:job.action==='teacher'?'PSEUDOLABELS_NOT_INDEPENDENT':
            job.action==='approved'?'USER_ATTESTED_INDEPENDENT':'PRODUCT_HOLDOUT_DIAGNOSTIC_ONLY'}));
        last.params.collection = ee.Serializer.toJSON(provenance);
        finish({report,classification:ee.Serializer.toJSON(result.classification),
          region:ee.Serializer.toJSON(result.region),exports:descriptors,logs});
      } catch(e) {finish({error:e.message,logs});}
    }};
  // UI evidence-mode text must never replace the backend's execution enum.
  if (job.action === 'baseline') cfg.mode = 'smoke_test';
  if (job.action === 'prepare') cfg.mode = 'candidate_preparation';
  process.once('uncaughtException',err=>finish({error:err.message,logs}));
  if (!job.token || !job.project) {finish({error:'Google authentication and project ID required.'});return;}
  try {
    ee.data.setAuthToken('', 'Bearer', job.token, 3600, [], undefined, false);
    ee.initialize(null,null,()=>{
      try {
        if(job.action==='prepare') hammer.prepareTeacher(cfg,d=>finish({frames:d,logs}));
        else if(job.action==='baseline') hammer.runPilot(cfg);
        else if(job.action==='teacher') hammer.runTeacher(cfg);
        else if(job.action==='approved') {
          cfg.boundary=hammer.resolveWdpa(cfg.boundarySpec);
          cfg.training=ee.FeatureCollection(job.settings.trainingAsset);
          cfg.validation=ee.FeatureCollection(job.settings.validationAsset);
          hammer.runWorkflow(cfg);
        } else finish({error:'Unknown action.'});
      } catch(e) {finish({error:e.message,logs});}
    },err=>finish({error:String(err),logs}),null,job.project);
  } catch(e) {finish({error:e.message,logs});}
}
