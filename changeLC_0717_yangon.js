var year1_start = '2007-01-01';  
var year1_end   = '2007-12-31';

var year2_start = '2017-01-01';
var year2_end   = '2017-12-31';

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


// Get Image Collection
var l5_collection = ee.ImageCollection('LANDSAT/LT5_L1T_TOA');
var l8_collection = ee.ImageCollection('LANDSAT/LC8_L1T_TOA');


// Filter Boundary and Date
var ls_2007 = l5_collection.filterBounds(roi)
              .filterDate(year1_start,year1_end);
var ls_2017 = l8_collection.filterBounds(roi)
              .filterDate(year2_start,year2_end);   
            

//remove Cloud  
var ls_2007_noCloud = ls_2007.map(cloudFunction);
var ls_2017_noCloud = ls_2017.map(cloudFunction);


//reduce to median value per pixel
var m_2007 = ls_2007_noCloud.median();
var m_2017 = ls_2017_noCloud.median();

Map.addLayer(m_2017,{bands: ['B4', 'B3', 'B2'], gamma: 1.5} , '2017' );

//select bands 1-5 and rename to append year
m_2007 = m_2007.select(['B1','B2','B3','B4','B5','B6','B7']);
m_2017 = m_2017.select(['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11']);


// Use these bands for prediction.
var band07 = ['B1','B2','B3','B4','B5','B6','B7'];
var band17 = ['B1','B2','B3','B4','B5','B6','B7'];

// Merge the hand-drawn features into a single FeatureCollection.
var newfc = buildUp.merge(vegetation).merge(bareLand).merge(water); 

// Make training data by 'overlaying' the points on the image.
var training = m_2007.select(band07).sampleRegions({
  collection: newfc, 
  properties: ['landcover'], 
  scale: 30
});
var training2 = m_2017.select(band17).sampleRegions({
  collection: newfc, 
  properties: ['landcover'], 
  scale: 30
});


// Get a CART classifier and train it.
var classifier = ee.Classifier.randomForest().train({
  features: training, 
  classProperty: 'landcover', 
  inputProperties: band07
});
var classifier2 = ee.Classifier.randomForest().train({
  features: training2, 
  classProperty: 'landcover', 
  inputProperties: band17
});
 
// Classify the image.
var classified = m_2007.select(band07).classify(classifier);
var classified2 = m_2017.select(band17).classify(classifier2);


// Create a palette to display the classes.
var p = ['ff0000', '00ff00', '000000', '0000ff'];


// Display the classification results.
Map.addLayer(classified, {palette: p, min: 0, max: 3}, 'classification2007');
Map.addLayer(classified2, {palette: p, min: 0, max: 3}, 'classification2017');
Map.setCenter(96, 16, 9)

// accuracy assessement
var confMat = classifier.confusionMatrix();
print('Confusion matrix: ', confMat);
print('Overall accuracy: ', confMat.accuracy());

var confMat2 = classifier2.confusionMatrix();
print('Confusion matrix: ', confMat2);
print('Overall accuracy: ', confMat2.accuracy());

  Export.image.toDrive({
  image: classified,
  folder: 'GEE_EXPORTS',
  description: 'Landcover2007', 
  scale: 30,
  region: geometry
});

Export.image.toDrive({
  image: classified2, 
  folder: 'GEE_EXPORTS',
  description: 'Landcover2008', 
  scale: 30 ,
   region: geometry
});
