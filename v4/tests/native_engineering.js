/** Paste into a TEMPORARY Code Editor script. Shared-core engineering fixture.
 * NO ecological observations, independent labels, embeddings, or fitted RF.
 * Creates tiny explicit SYNTHETIC export requests; submit and read back Tasks.
 */
var h=require('users/arisol/protected-area-landcover-ses410:HAMMER_CORE_v4');
var c=h.config({site:'skeleton_coast'}),crs=c.crs;
var region=ee.Geometry.Polygon([[[300000,7800000],[300200,7800000],[300000,7800200],[300000,7800000]]],crs,false);
var image=ee.Image.constant(0).rename('classification').toByte().clip(region);
var point=ee.Feature(ee.Geometry.Point([300005,7800005],crs),{sample_id:'SYNTHETIC_GRID_ONLY',unit_id:'SYNTHETIC_UNIT',prediction:0,'class':0,scope:'SYNTHETIC_NOT_REFERENCE_DATA'});
var empty=ee.FeatureCollection([]),points=ee.FeatureCollection([point]);
var cfg={synthetic:true,v4:c,v4context:{region:region,metadata:{scope:'SYNTHETIC_200M_TRIANGLE_NOT_A_PARK'}},v4records:[],v4uncertain:[],v4audit:{scope:'SYNTHETIC_ONLY'},
  runId:'SYNTHETIC_ENGINEERING_'+Date.now(),palette:['419bdf','d9c29c','397d49'],isCurrent:function(){return true;}};
var result={completed:true,config:cfg,status:'SYNTHETIC_ENGINEERING_NOT_LANDCOVER',classification:image,region:region,training:points,validation:points,predictions:points,
  summary:ee.FeatureCollection([ee.Feature(null,{scope:'SYNTHETIC_SCHEMA_TEST_NOT_MODEL_PERFORMANCE'})]),perClass:empty,matrixCells:empty,elapsedSeconds:0};
h.engineeringGridFixture(c,function(data,error){
  if(error)throw new Error(error);print('NATIVE SYNTHETIC GRID/MASK',data);
  if(data.sampled_n!==3||data.unique_pixels!==2)throw new Error('Synthetic mask/duplicate-pixel expectation failed');
  h.assessmentRasterCheck(result,function(audit,err){
    if(err)throw new Error(err);result.rasterAssessmentAudit=audit;print('NATIVE SYNTHETIC RASTER/TABLE',audit);
    print('NATIVE ALIGNED EXPORT EXTENT',h.exportBounds(region,c));
    try{print('SYNTHETIC REQUEST PREFIX',h.exportPackage(result,'SES410_v4',null,{area:true,archives:true}));}catch(e){print('SYNTHETIC EXPORT ERROR',e.message,e.stack,JSON.stringify(result.exportRequests));throw e;}
    print('Requests only; verify completed tiny files. Expected valid0=210, NoData255=190; grid hectares=2.1. Not accuracy.');
  });
});
