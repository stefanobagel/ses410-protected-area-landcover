/** Shared review/checkpoint and request-state contracts. No Earth Engine or UI. */
function reviewCopy(x){return JSON.parse(JSON.stringify(x));}
function observationIdentity(r){return {sample_id:r.sample_id,unit_id:r.unit_id,coordinates:r.coordinates,role:r.role,site:r.site,reference_year:r.reference_year,legend_id:r.legend_id};}
function checkpointDocument(rows,drafts){return {type:'FeatureCollection',checkpoint_schema:'HAMMER_CHECKPOINT_V4_1',features:rows.map(function(row){
  var r=reviewCopy(row);r.checkpoint_identity=r.checkpoint_identity||observationIdentity(r);
  if(drafts&&drafts[r.sample_id])r.pending_draft=reviewCopy(drafts[r.sample_id]);
  return {type:'Feature',geometry:{type:'Point',coordinates:reviewCopy(r.coordinates)},properties:r};
})};}
function draftCommit(prior,draft,status,validate){
  var r=reviewCopy(prior),identity=observationIdentity(prior);
  Object.keys(draft||{}).forEach(function(k){if(Object.prototype.hasOwnProperty.call(identity,k)&&JSON.stringify(draft[k])!==JSON.stringify(identity[k]))throw new Error('Draft cannot change '+k);r[k]=reviewCopy(draft[k]);});
  r.status=status;delete r.pending_draft;
  var errors=validate(r);if(errors.length)throw new Error(errors.join('; '));
  if(status==='accepted'&&r.migration&&r.migration.reasons&&r.migration.reasons.length){
    r.migration.resolutions=(r.migration.resolutions||[]).concat([{reviewer:r.reviewer,reviewed_at:r.reviewed_at||null,reasons:reviewCopy(r.migration.reasons)}]);
    r.migration.reasons=[];
  }
  r.review_history=(prior.review_history||[]).concat([reviewCopy(prior)]);
  // History snapshots do not recursively repeat all earlier history.
  delete r.review_history[r.review_history.length-1].review_history;
  return r;
}
function requestOutput(result,key,make){
  var ledger=result.exportRequests||(result.exportRequests={}),previous=ledger[key];
  if(previous&&previous.state!=='CREATION_FAILED')return false;
  var entry={state:'NOT_REQUESTED',attempt:previous?previous.attempt+1:1,prior_attempts:previous?previous.prior_attempts||[]:[],retry_of:previous?previous.retry_of||null:null};ledger[key]=entry;
  try{make();entry.state='REQUEST_CREATED';entry.created_utc=new Date().toISOString();}
  catch(e){entry.state='CREATION_FAILED';entry.error=String(e.message||e);throw e;}
  return true;
}
function recordObservedTask(result,observation){
  var entry=result.exportRequests&&result.exportRequests[observation.key];
  if(!entry||!observation.task_id||!observation.observed_utc||['SUBMITTED','RUNNING','COMPLETED','FAILED'].indexOf(observation.state)<0)throw new Error('Explicit observed task ID, timestamp, output key and remote state required');
  if(entry.task_id&&entry.task_id!==observation.task_id)throw new Error('Task identity conflict');
  entry.task_id=observation.task_id;entry.state=observation.state;entry.observed_utc=observation.observed_utc;
}
function authorizeOutputRetry(result,key,failedTaskId){
  var e=result.exportRequests&&result.exportRequests[key];
  if(!e||e.state!=='FAILED'||e.task_id!==failedTaskId)throw new Error('Retry requires the observed failed task identity');
  e.prior_attempts=(e.prior_attempts||[]).concat([{task_id:e.task_id,state:e.state,observed_utc:e.observed_utc}]);
  e.state='CREATION_FAILED';e.retry_of=failedTaskId;
}
exports.observationIdentity=observationIdentity;exports.checkpointDocument=checkpointDocument;
exports.draftCommit=draftCommit;
exports.requestOutput=requestOutput;exports.recordObservedTask=recordObservedTask;exports.authorizeOutputRetry=authorizeOutputRetry;
