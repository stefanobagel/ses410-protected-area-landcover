// Exercise the ACTUAL additive server preflight callbacks, with controlled EE doubles.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');let callbacks=[],errors=[],fits=0;
const lazy=new Proxy(function(){},{get(t,k){if(k==='evaluate')return fn=>callbacks.push(fn);return ()=>lazy;}});
function Geometry(){}
const ee={Geometry,FeatureCollection:()=>lazy,ImageCollection:()=>lazy,Dictionary:()=>({evaluate:fn=>callbacks.push(fn)}),
  Filter:new Proxy({},{get:()=>()=>lazy}),Join:{simple:()=>lazy},Projection:()=>lazy,
  Image:{pixelCoordinates:()=>lazy,constant:()=>lazy},Date:{fromYMD:()=>lazy}};
const ctx=vm.createContext({ee,exports:{},print(){},Map:{},Export:{}});
vm.runInContext(fs.readFileSync(path.join(root,'baseline/SES410_landcover_v0_2.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'extension.js'),'utf8'),ctx);
ctx.fitAndEvaluate=()=>fits++;
function config(){return {teacherProvenance:{sha:'test'},year:2021,boundarySpec:{},scale:10,crs:'EPSG:32733',classValues:[0,1,2],separationMeters:100,onError:m=>errors.push(m)};}
const valid={train_n:3,val_n:2,train_ids:3,val_ids:2,shared_ids:0,shared_units:0,collisions:0,inside_train:3,inside_val:2,train_classes:{0:1,1:1,2:1},val_classes:{0:2}};
let count=0;
for(const field of ['shared_ids','shared_units','collisions']){
  callbacks=[];errors=[];ctx.exports.runTeacher(config());callbacks.shift()({...valid,[field]:1},null);assert.equal(errors.length,1);assert.equal(fits,0);count++;
}
callbacks=[];errors=[];ctx.exports.runTeacher(config());callbacks.shift()(valid,null);callbacks.shift()({train_n:3,val_n:2,train_pixels:3,val_pixels:2,shared:0,support:{0:1,1:1,2:1}},null);assert.equal(fits,1);count++;
callbacks=[];errors=[];ctx.exports.runTeacher(config());callbacks.shift()(valid,null);callbacks.shift()({train_n:3,val_n:1,train_pixels:3,val_pixels:1,shared:0,support:{0:1,1:1,2:1}},null);assert.equal(errors.length,1);assert.equal(fits,1);count++;
callbacks=[];errors=[];ctx.exports.runTeacher(config());callbacks.shift()(valid,null);callbacks.shift()({train_n:3,val_n:2,train_pixels:3,val_pixels:2,shared:0,support:{0:2,1:1}},null);assert.equal(errors.length,1);assert.equal(fits,1);count++;
console.log('PASS '+count+' v0.2c server-preflight contracts (test doubles, no EE execution).');
