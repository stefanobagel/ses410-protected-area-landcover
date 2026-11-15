/** TEMPORARY native shared-core test. Synthetic numeric classes/predictors only.
 * No ecological labels, real final references, imagery acquisitions or accuracy.
 * Normal app contexts cannot fit engineering_fixture records.
 */
var h=require('users/arisol/protected-area-landcover-ses410:HAMMER_CORE_v4');
var c=h.config({site:'skeleton_coast'});
c.legendId='SYNTHETIC_ENGINEERING_LEGEND_V1';
c.classNames=['SYNTHETIC_C0','SYNTHETIC_C1','SYNTHETIC_C2'];
c.classDefinitions=['Arbitrary numeric software fixture','Arbitrary numeric software fixture','Arbitrary numeric software fixture'];
var crs=c.crs,region=ee.Geometry.Rectangle([300000,7800000,300700,7800600],crs,false),bands=[];
var x=ee.Image.pixelCoordinates(h.grid(c)).select('x').floor();
var predictors=x.mod(3).toFloat().rename('A00');
for(var b=1;b<64;b++)predictors=predictors.addBands(x.mod(3).add(b/100).toFloat().rename('A'+('0'+b).slice(-2)));
var projected=[];
for(var i=0;i<30;i++)projected.push(ee.Feature(ee.Geometry.Point([300005+i*20,7800005],crs),{sample_id:'SYNTHETIC_T_'+i,unit_id:'SYNTHETIC_T_'+i,role:'training'}));
for(var j=0;j<3;j++)projected.push(ee.Feature(ee.Geometry.Point([300005+j*20,7800405],crs),{sample_id:'SYNTHETIC_F_'+j,unit_id:'SYNTHETIC_F_'+j,role:'final_validation'}));
var context={engineeringOnly:true,config:c,image:predictors.clip(region),region:region,boundary:ee.FeatureCollection([ee.Feature(region)]),metadata:{scope:'SYNTHETIC_NUMERIC_FIXTURE_NO_PARK_REFERENCES'}};
var token={id:'SYNTHETIC_REVIEWED_'+Date.now(),started:new Date().toISOString()};
var fc=predictors.sampleRegions({collection:ee.FeatureCollection(projected),projection:h.grid(c),scale:10,geometries:true});
fc.evaluate(function(doc,error){
  if(error)throw new Error(error);
  var rows=doc.features.map(function(f){var p=f.properties;return {engineering_fixture:true,schema_version:'HAMMER_REFERENCE_V4_1',sample_id:p.sample_id,unit_id:p.unit_id,coordinates:f.geometry.coordinates,site:c.site,reference_year:c.year,legend_id:c.legendId,role:p.role,status:'accepted','class':Math.round(p.A00),
    reviewer:'SYNTHETIC_SOFTWARE_FIXTURE',confidence:'high',imagery_source:'SYNTHETIC_NO_ACQUISITION',imagery_id:'SYNTHETIC_SCHEMA_FIELD_NOT_A_SCENE',imagery_dates:'2021-01-01',reference_protocol:'SYNTHETIC_NOT_A_REFERENCE_PROTOCOL',label_source:'independent_reference',source_asset:'SYNTHETIC_ONLY'};});
  h.runReviewed(context,rows,c,token,{isCurrent:function(){return true;},onProgress:function(s){print('SYNTHETIC PHASE',s);},onError:function(s,d){print('SYNTHETIC ERROR',s,d);},onComplete:function(report,result){
    print('SYNTHETIC SOFTWARE CHECK ONLY',report);print('NO PARK ACCURACY OR INDEPENDENT REFERENCE QUALIFICATION');
    h.exportPackage(result,'SES410_v4',null,{area:true,archives:true});print('SYNTHETIC REQUEST LEDGER',JSON.stringify(result.exportRequests));
  }},{finalWorkflow:true,independentConfirmed:true,design:'SYNTHETIC_DETERMINISTIC_LAYOUT_NOT_SAMPLING_INFERENCE',protocol:'SYNTHETIC_NOT_APPROVED',destination:'SES410_v4'});
});
