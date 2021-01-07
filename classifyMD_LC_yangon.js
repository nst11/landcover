var start_date = '2017-01-01';
var end_date = '2017-12-31';

//landsat 8 2017
var l8Col = ee.ImageCollection('LANDSAT/LC8_L1T_TOA') 
    .filterBounds(roi)
    .filterDate(start_date,end_date);
    
//sentinel 2 2017
var senCol = ee.ImageCollection('COPERNICUS/S2')
    .filterBounds(roi)
    .filterDate(start_date,end_date); 
    
//SRTM 2017
var srtm = ee.Image('USGS/SRTMGL1_003');

//var fc = ee.FeatureCollection('ft:19fN1jLhXqzda_trBzIiy72BBsAJAh0MR6fghBDtR');
  
//remove Cloud in landsat
//--- Cloud Function ---
var cloud_thresh = 40;
var cloudFunction = function(image){
    //use add the cloud likelihood band to the image
    var CloudScore = ee.Algorithms.Landsat.simpleCloudScore(image);
    //isolate the cloud likelihood band
    var quality = CloudScore.select('cloud');
    //get pixels above the threshold
    var cloud01 = quality.gt(cloud_thresh);
    //create a mask from high likelihood pixels
    var cloudmask = image.mask().and(cloud01.not());
    //mask those pixels from the image
    return image.mask(cloudmask);
}
var l8_NoCloud = l8Col.map(cloudFunction);

//Remove Cloud for sentinel2
// Bits 10 and 11 are clouds and cirrus, respectively.
var cloudBitMask = ee.Number(2).pow(10).int();
var cirrusBitMask = ee.Number(2).pow(11).int();
var qa = senCol.select('QA60');
function maskS2clouds(image) {
  var qa = image.select('QA60');
  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
             qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask);
}

var sen_NoCloud = senCol.map(maskS2clouds);

//reduce to median value per pixel
var l8_2017 = l8_NoCloud.median();
var sen_2017 = sen_NoCloud.min();

//NDBI Calculation
var ndbi_l8 = l8_2017.normalizedDifference(['B5','B4']);
var ndbi_sen = sen_2017.normalizedDifference(['B8','B4']);

//NBVI Calculation
var ndvi_l8 = l8_2017.normalizedDifference(['B4','B3']);
var ndvi_sen = sen_2017.normalizedDifference(['B4','B3']);

//select bands to display
var l8b = l8_2017.select(['B2','B3','B4','B5','B6','B1'])
        .rename(['B2_l8','B3_l8','B4_l8','B5_l8','B6_l8','B1_l8']);
var senb = sen_2017.select(['B2','B3','B4','B8','B11','B1',])
        .rename(['B2_sen','B3_sen','B4_sen','B8_sen','B11_sen','B1_sen']);
var srtmb = srtm.select(['elevation']);


//var l8b = l8_2017.select(['B2','B3','B4','B5']);
//var senb = sen_2017.select(['B2','B3','B4','B8']);
//var srtmb = srtm.select(['elevation']);

//Create Composite
var combined = l8b.addBands(ndbi_l8).addBands(ndvi_l8).addBands(senb).addBands(ndbi_sen).addBands(ndvi_sen).addBands(srtmb);

//var bands = ['B2','B3','B4','B5'];
var bands = ['B1_l8','B2_l8','B3_l8','B4_l8','B5_l8','B6_l8','B1_sen','B2_sen','B3_sen','B4_sen','B8_sen','B11_sen'];
// Make training data by 'overlaying' the points on the image.
var training = combined.sampleRegions({
  collection: table, 
  properties: ['Code'], 
  scale: 30
});

 
// Get a Random Forest classifier and train it.
var classifier = ee.Classifier.minimumDistance("cosine").train({
  features: training, 
  classProperty: 'Code', 
  inputProperties: bands
});


// Classify the image.
var classified = combined.select(bands).classify(classifier);

// Define a palette for the IGBP classification.
var igbp = [
  'aec3d4', // water
  '152106', '225129', '369b47', '30eb5b', '387242', // forest
  '6a2325', 'c3aa69', 'b76031', 'd9903d', '91af40',  // shrub, grass
  '111149', // wetlands
  'cdb33b', // croplands
  'cc0013', // urban
  '33280d', // crop mosaic
  ];

Map.centerObject(roi, 10);
Map.addLayer(classified, {palette: igbp, min: 0, max: 17}, 'classification');

// accuracy assessement
var confMat = classifier.confusionMatrix();
print('Confusion matrix: ', confMat);
print('Overall accuracy: ', confMat.accuracy());
print('Producer Accuracy: ', confMat.producersAccuracy());
print('Consumer Accuracy: ', confMat.consumersAccuracy());



  Export.image.toDrive({
  image: classified,
  folder: 'GEE_EXPORTS',
  description: 'LC_minDist_OSM', 
  scale: 30,
  region: roi
});

