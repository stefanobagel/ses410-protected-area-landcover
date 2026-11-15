'use strict';
const assert=require('node:assert/strict'),h=require('../contracts.js');
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
for(const site of ['salonga','skeleton_coast'])for(const profile of ['baseline','detailed'])test(site+' '+profile,()=>{
 const c=h.config({site,profile});assert.equal(c.classValues.length,profile==='baseline'?3:site==='salonga'?4:6);assert.deepEqual(c.gridTransform,[10,0,0,0,-10,0]);assert.equal(c.variablesPerSplit,8);assert.equal(c.maxNodes,null);
});
test('No missing-class qualification',()=>{const m=h.metrics([[10,0],[0,0]]);assert.equal(m.macroF1,null);assert.equal(m.classes[1].recall,null);assert.equal(m.scientificAcceptance,false);});
test('Valid class zero',()=>assert.equal(h.metrics([[2,0],[1,3]]).correct,5));
test('Year diagnostic gate',()=>assert.throws(()=>h.config({site:'salonga',year:2024,spatialProfile:'diagnostic_2021'})));
test('Canonical analysis scale',()=>assert.throws(()=>h.config({site:'salonga',scale:30})));
test('Unknown fields fail',()=>assert.throws(()=>h.config({site:'salonga',typoSeed:42})));
test('Salonga numeric collision requires mapping',()=>assert.throws(()=>h.migrate({site:'salonga',class:1},'v02',h.config({site:'salonga',profile:'detailed'}))));
test('Broad forest migration unresolved',()=>{const r=h.migrate({site:'salonga',class:0,role:'training',coordinates:[21,-2],sample_id:'synthetic',unit_id:'unit'},'v02',h.config({site:'salonga',profile:'detailed'}),{id:'TEST_ONLY',sourceLegend:'SES410_INITIAL_2021_V1',targetLegend:'SES410_SALONGA_DETAILED_V1',classes:{}});assert.equal(r.class,null);assert.equal(r.status,'unresolved');assert.equal(r.original_record.class,0);});
test('Final roles preserved, never block-reassigned',()=>{const r=h.migrate({sample_id:'frozen',unit_id:'unit',role:'validation',longitude:1,latitude:2,site:'salonga',reference_year:2021},'v02',h.config({site:'salonga'}));assert.equal(r.role,'final_validation');assert.equal(r.sample_id,'frozen');assert.deepEqual(r.coordinates,[1,2]);assert.ok(h.validateRecord(r,h.config({site:'salonga'})).some(e=>e.includes('Locked')));});
test('Legacy labeled is unresolved',()=>{const r=h.migrate({site:'salonga',status:'labeled',dataset:'validation',label_id:0,source_asset:'synthetic/test',lon:1,lat:2,year:2021},'vedant_v32',h.config({site:'salonga',profile:'detailed'}));assert.equal(r.role,'development_assessment');assert.equal(r.status,'unresolved');});
test('Stale callbacks and duplicate export',()=>{const life=h.lifecycle(),c=h.config({site:'salonga'}),a=life.begin(c);life.invalidate();assert.equal(life.complete(a),false);const b=life.begin(c);assert.equal(life.complete(b),true);life.exportOnce(b);assert.throws(()=>life.exportOnce(b));});
console.log(JSON.stringify({passed:checks}));
