// Build complete graphs using real EE client classes and Google's bundled static
// API signatures. Responses are fixtures: this is NOT a live fit or validation.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict'),ee=require('@google/earthengine');
const signatures=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
ee.data.getAlgorithms=()=>signatures;
ee.initialize(null,null,null,null,null,'offline-test');
let responses=[
  {train_n:3,val_n:2,train_ids:3,val_ids:2,shared_ids:0,shared_units:0,collisions:0,inside_train:3,inside_val:2,train_classes:{0:1,1:1,2:1},val_classes:{0:2}},
  {train_n:3,val_n:2,train_pixels:3,val_pixels:2,shared:0,support:{0:1,1:1,2:1}},
  {matrix:[[2,0,0],[0,0,0],[0,0,0]],overall_accuracy:1,evaluation_n:2,training_n:3,per_class:[],classified_pixel_probe:[0]}
];
ee.data.computeValue=(obj,cb)=>cb(responses.shift(),null);
let descriptors=[];
const exporter={image:{toDrive:p=>descriptors.push({kind:'image',params:p})},table:{toDrive:p=>descriptors.push({kind:'table',params:p})}};
const root=path.join(__dirname,'..'),ctx=vm.createContext({ee,exports:{},Map:{addLayer(){}},print(){},Export:exporter});
vm.runInContext(fs.readFileSync(path.join(root,'baseline/SES410_landcover_v0_2.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'extension.js'),'utf8'),ctx);
const fc={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[15,-20]},properties:{class:0,sample_id:'test'}}]};
let completed=false;
ctx.exports.runTeacher({teacherProvenance:{checkpoint:'test'},year:2021,boundarySpec:{iso3:'NAM',name:'Skeleton Coast'},
  training:fc,validation:fc,scale:10,crs:'EPSG:32733',classValues:[0,1,2],classNames:{0:'water',1:'bare',2:'vegetation'},
  palette:['blue','yellow','green'],trees:200,seed:410,tileScale:4,labelProperty:'class',separationMeters:100,
  exportPrefix:'offline',runId:'offline',driveFolder:'offline',onError:(m)=>{throw Error(m);},
  onComplete:(report,result)=>{ctx.exports.exportCompleted(result);completed=true;}});
assert.equal(completed,true);assert.equal(descriptors.length,6);
const serialized=descriptors.map(x=>{
  const key=x.kind==='image'?'image':'collection';
  const params={...x.params,[key]:ee.Serializer.toJSON(x.params[key])};
  if(params.region)params.region=ee.Serializer.toJSON(params.region);
  return {kind:x.kind,params};
});
fs.writeFileSync(process.argv[3],JSON.stringify(serialized));
console.log('PASS real-client teacher/RF/metrics/six-export graph construction with fixture responses; zero server requests.');
