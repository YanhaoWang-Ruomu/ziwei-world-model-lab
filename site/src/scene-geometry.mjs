import {horizontalVector} from './world-time.mjs';
export function earthGeometry(width,height){const radius=Math.min(width*.67,height*.4);return {x:width*.5,y:height+radius*.31,radius};}
export function viewVector(vector,world,{skyOnly=true,depth=false}={}){
  // Both scenic views use the time-dependent observer frame. Depth comparison remains inertial.
  return skyOnly&&!depth?horizontalVector(vector,world.matrix):vector;
}
