importScripts('floor-plate-fem.js');
self.onmessage=event=>{
  try{self.postMessage({result:FloorPlateFEM.calculate(event.data)});}
  catch(error){self.postMessage({error:error.message});}
};
