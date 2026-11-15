// Local contract tests for run isolation, export gating and reference failures.
// Earth Engine server execution is verified separately in the live editor.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
let checks = 0;
function check(name, fn) {fn(); checks++; console.log('PASS', name);}

function Widget(value) {
  this.value = value; this.disabled = false; this.children = []; this.handler = null;
  this.styles = {set() {}};
}
Widget.prototype.getValue = function() {return this.value;};
Widget.prototype.setValue = function(v, trigger = true) {this.value = v; if (trigger && this.handler) this.handler(v); return this;};
Widget.prototype.onChange = Widget.prototype.onClick = function(fn) {this.handler = fn;};
Widget.prototype.setDisabled = function(v) {this.disabled = v;};
Widget.prototype.style = function() {return this.styles;};
Widget.prototype.add = function(v) {this.children.push(v); return this;};
Widget.prototype.clear = function() {this.children = [];};
let queued = [], exportCalls = [], layers = [];
function widget(arg) {return new Widget(arg && typeof arg === 'object' ? arg.value : arg);}
const Panel = arg => {const w = new Widget(); if (Array.isArray(arg)) w.children = arg; return w;};
Panel.Layout = {flow() {}};
const map = {setOptions() {}, setCenter() {}, centerObject() {}, addLayer(...args) {layers.push(args);},
  layers() {return {reset() {layers = [];}};}};
const ui = {Panel, Label: widget, Select: widget, Textbox: widget,
  Checkbox: (label, value) => new Widget(value), Button: arg => {const w = new Widget(arg.label); w.disabled = !!arg.disabled; return w;},
  Map: () => map, root: {clear() {}, setLayout() {}, add() {}}};
const hammer = {runPilot(cfg) {queued.push(cfg);}, runWorkflow(cfg) {queued.push(cfg);},
  exportCompleted(result) {assert.ok(result.config.isCurrent()); exportCalls.push(result);}};
const ctx = vm.createContext({ui, require: () => hammer, print() {}, Date, JSON, isFinite});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'APP_LANDCOVER_v0_2.js'), 'utf8'), ctx);
const run = () => ctx.generate.handler();
const report = {overall_accuracy: 0.83, evaluation_n: 200, training_n: 120,
  per_class: [], matrix: [[0,0,0],[0,158,33],[0,1,8]]};
function complete(cfg) {const r = {config: cfg, status: 'PRODUCT_LABEL_PILOT_NOT_VALIDATED', completed: true}; cfg.onComplete(report,r); return r;}
check('Initial state has no exportable map', () => assert.equal(ctx.exportButton.disabled, true));
check('Diagnostic uses shared core, fixed year and copied legend', () => {
  run(); assert.equal(queued.length, 1); const cfg = queued[0];
  assert.equal(cfg.year,2021); assert.equal(cfg.expectedSiteId,885); assert.equal(cfg.trees,200);
  assert.notEqual(cfg.classNames,ctx.SITES['Skeleton Coast Park'].names);
  assert.equal(cfg.createExportTasks,false);
});
check('Repeated generate is blocked while a run is pending', () => {run(); assert.equal(queued.length,1);});
check('Changing park invalidates callbacks, results, approval and exports', () => {
  ctx.approvalCheck.setValue(true,false); ctx.trainingId.setValue('users/a/train',false);
  ctx.siteSelect.setValue('Salonga National Park');
  assert.equal(queued[0].isCurrent(),false); assert.equal(ctx.trainingId.value,''); assert.equal(ctx.approvalCheck.value,false);
  complete(queued[0]); assert.equal(ctx.completed,null); assert.equal(ctx.exportButton.disabled,true); assert.equal(layers.length,0);
});
check('A completed current run enables frozen-result exports', () => {
  run(); const cfg=queued[1]; assert.equal(cfg.expectedSiteId,555697863);
  const result=complete(cfg); assert.equal(ctx.completed,result); assert.equal(ctx.exportButton.disabled,false);
  ctx.exportButton.handler(); assert.equal(exportCalls[0],result);
});
check('Clear invalidates pending errors as well as successes', () => {
  ctx.clearButton.handler(); const message=ctx.status.value;
  queued[1].onError('OLD FAILURE'); assert.equal(ctx.status.value,message); assert.equal(ctx.completed,null);
});
check('Approved mode without attested assets cannot launch', () => {
  ctx.modeSelect.setValue('Approved-reference evaluation'); run(); assert.equal(queued.length,2);
  assert.match(ctx.status.value,/confirmation/); assert.equal(ctx.exportButton.disabled,true);
});
check('Identical training/validation assets are rejected locally', () => {
  ctx.trainingId.setValue('users/a/same'); ctx.validationId.setValue('users/a/same');
  ctx.designBox.setValue('Documented design'); ctx.protocolBox.setValue('Protocol v1'); ctx.approvalCheck.setValue(true);
  run(); assert.match(ctx.status.value,/different asset IDs/); assert.equal(queued.length,2);
});
check('Changing protocol revokes approval and invalidates output', () => {
  ctx.protocolBox.setValue('Protocol v2'); assert.equal(ctx.approvalCheck.value,false); assert.equal(ctx.completed,null);
});

// Minimal lazy EE objects let us exercise real core preflight/sampling callbacks.
let callbacks = [], errors = [], outputs = [], current = true;
const lazy = new Proxy(function(){}, {get(target,key) {
  if (key === 'evaluate') return fn => callbacks.push(fn);
  return () => lazy;
}});
function Geometry() {}
const ee = {Geometry, FeatureCollection: () => lazy, ImageCollection: () => lazy,
  Dictionary: () => ({evaluate: fn => callbacks.push(fn)}),
  Filter: new Proxy({}, {get: () => () => lazy}), Join: {simple: () => lazy},
  Projection: () => lazy, Image: {pixelCoordinates: () => lazy, constant: () => lazy}, Date: {fromYMD: () => lazy}};
ee.FeatureCollection.randomPoints = () => lazy;
const coreCtx = vm.createContext({ee, exports: {}, print(...args) {outputs.push(args);}, Map: map,
  Export: {image: {toDrive() {}}, table: {toDrive() {}}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','SES410_landcover_v0_2.js'),'utf8'),coreCtx);
function config() {return {boundary: new Geometry(), year:2021, training:lazy, validation:lazy,
  independentReferencesConfirmed:true, validationUsedForTuning:false, validationDesign:'probability design',referenceProtocol:'protocol v1',
  classValues:[0,1,2],classNames:{0:'A',1:'B',2:'C'},crs:'EPSG:32733',scale:10,trees:200,separationMeters:100,
  isCurrent:()=>current,onError:m=>errors.push(m)};}
const valid = {embedding_tiles:8,training_features:120,validation_features:200,invalid_training:0,invalid_validation:0,
  duplicate_training_ids:0,duplicate_validation_ids:0,shared_ids:0,shared_reference_units:0,spatial_collisions:0,
  training_outside:0,validation_outside:0,training_geometry_types:{Point:120},validation_geometry_types:{Point:200}};
check('Stale backend reference callback performs no actions', () => {
  callbacks=[];current=true;coreCtx.exports.runWorkflow(config());const cb=callbacks.shift();current=false;
  const count=outputs.length;cb(valid,null);assert.equal(callbacks.length,0);assert.equal(outputs.length,count);current=true;
});
for (const key of ['invalid_validation','duplicate_validation_ids','shared_ids','shared_reference_units','spatial_collisions','validation_outside']) {
  check('Backend rejects '+key, () => {
    callbacks=[];errors=[];coreCtx.exports.runWorkflow(config());callbacks.shift()({...valid,[key]:1},null);
    assert.equal(errors.length,1);assert.equal(callbacks.length,0);
  });
}
check('Backend stops when a validation point disappears during sampling', () => {
  callbacks=[];errors=[];coreCtx.exports.runWorkflow(config());callbacks.shift()(valid,null);
  callbacks.shift()({train_n:120,validation_n:199,original_training_n:120,original_validation_n:200,
    train_unique_pixels:120,validation_unique_pixels:199,shared_pixels:0},null);
  assert.match(errors[0],/Missing reference imagery/);
});
check('Backend stops on shared analysis pixels after sampling', () => {
  callbacks=[];errors=[];coreCtx.exports.runWorkflow(config());callbacks.shift()(valid,null);
  callbacks.shift()({train_n:120,validation_n:200,original_training_n:120,original_validation_n:200,
    train_unique_pixels:120,validation_unique_pixels:200,shared_pixels:1},null);
  assert.match(errors[0],/shared analysis pixels/);
});
check('Export gate rejects incomplete and stale results', () => {
  const cfg=config(); assert.throws(()=>coreCtx.exports.exportCompleted({config:cfg,completed:false}),/completed current/);
  current=false;assert.throws(()=>coreCtx.exports.exportCompleted({config:cfg,completed:true}),/completed current/);current=true;
});
check('Duplicate export submission is rejected', () => {
  assert.throws(()=>coreCtx.exports.exportCompleted({config:config(),completed:true,exported:true}),/already created/);
});
function pilotConfig() {return {...config(), boundary:lazy, expectedSiteId:885,
  boundarySpec:{name:'Skeleton Coast',iso3:'NAM'}, mode:'smoke_test', seed:410,exportPrefix:'test',
  pilotValidationLocations:200,pilotExclusionMeters:100,pilotCandidateCapPerClass:40,pilotCandidateScale:100,
  worldCoverCodes:[80,60,10],worldCoverClasses:[0,1,2]};}
const pilotCounts = {training_n:120,drawn_validation_locations:200,labelled_product_holdout_n:200,
  unique_holdout_pixels:200,shared_ids:0,shared_units:0,shared_locations:0,candidate_training_per_class:{0:40,1:40,2:40}};
function pilotPreflight(counts) {
  callbacks=[];errors=[];coreCtx.exports.runPilot(pilotConfig());
  callbacks.shift()({count:1,ids:[885],metadata:[]},null);
  callbacks.shift()({tile_count:8},null);
  callbacks.shift()(counts,null);
}
check('Diagnostic stops if a reserved holdout observation disappears', () => {
  pilotPreflight({...pilotCounts,labelled_product_holdout_n:199,unique_holdout_pixels:199});
  assert.match(errors[0],/Missing diagnostic holdout/);
});
check('Diagnostic stops if holdout observations share an analysis pixel', () => {
  pilotPreflight({...pilotCounts,unique_holdout_pixels:199});
  assert.match(errors[0],/sample collisions/);
});
check('Diagnostic stops if any declared training class has no support', () => {
  pilotPreflight({...pilotCounts,candidate_training_per_class:{0:40,1:40}});
  assert.match(errors[0],/unsupported training classes/);
});
console.log(`${checks} contract checks passed. Live EE and real approved-reference validation remain separate.`);
