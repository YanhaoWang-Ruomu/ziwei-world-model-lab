import {scenicRect,foregroundRect} from './scene-presence.mjs';
import {SHANHE_URL,shanheRidge} from './shanhe-profile.mjs';
export const TERRAIN_SIZE=[1672,941];
export const TERRAIN_URL=SHANHE_URL;
export function coverImage(width,height){
  // Keep the river at the bottom; portrait screens retain sky above the valley.
  const scale=Math.max(width/TERRAIN_SIZE[0],height*(width/height<.7?.84:.75)/TERRAIN_SIZE[1]);
  return {width:TERRAIN_SIZE[0]*scale,height:TERRAIN_SIZE[1]*scale,left:(width-TERRAIN_SIZE[0]*scale)/2,top:height-TERRAIN_SIZE[1]*scale};
}
export function terrainAlpha(value){const t=Math.min(1,Math.max(0,(value/255-.08)/.84));return Math.round(t*t*(3-2*t)*255);}
export function createTerrain(){
  let image=null,mask=null,alpha=null,view={},foreground=null,skyline=null;
  const rect=(width,height)=>scenicRect(coverImage(width,height),width,height,view);
  const ready=new Promise(resolve=>{
    const img=new Image();img.onload=()=>{
      image=img;mask=document.createElement('canvas');mask.width=img.width;mask.height=img.height;
      const ctx=mask.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      const pixels=ctx.getImageData(0,0,img.width,img.height);alpha=new Uint8Array(img.width*img.height);
      // One feathered mountain silhouette drives both the painted light and live sky.
      for(let x=0;x<img.width;x++){
        const ridge=shanheRidge(x/(img.width-1));
        for(let y=0;y<img.height;y++){
          const i=y*img.width+x,t=Math.max(0,Math.min(1,(y/(img.height-1)-ridge+.009)/.018));
          alpha[i]=Math.round(t*t*(3-2*t)*255);
          pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=255;pixels.data[i*4+3]=alpha[i];
        }
      }
      ctx.putImageData(pixels,0,0);
      // A contour sampled from the actual alpha lets air haze cross both sides of each ridge.
      skyline=new Float32Array(img.width);
      const contour=document.createElement('canvas');contour.width=img.width;contour.height=1;
      const cg=contour.getContext('2d'),profile=cg.createImageData(img.width,1);
      for(let x=0;x<img.width;x++){
        let y=0;while(y<img.height&&alpha[y*img.width+x]<128)y++;
        skyline[x]=y/img.height;profile.data[x*4]=Math.round(skyline[x]*255);profile.data[x*4+3]=255;
      }
      // The broad horizon lets fog span adjacent peaks instead of outlining each cut edge.
      const radius=Math.max(1,Math.round(img.width*.028));
      for(let x=0;x<img.width;x++){
        let sum=0,weight=0;
        for(let dx=-radius;dx<=radius;dx++){
          const at=Math.max(0,Math.min(img.width-1,x+dx)),w=radius+1-Math.abs(dx);
          sum+=skyline[at]*w;weight+=w;
        }
        profile.data[x*4+1]=Math.round(sum/weight*255);
      }
      cg.putImageData(profile,0,0);resolve({image,mask,contour});
    };img.onerror=()=>resolve(null);img.src=TERRAIN_URL;
  });
  return {
    ready,
    view(value){view=value;},rect,
    skyVisibility(x,y,width,height){
      if(!skyline)return 1;
      const r=rect(width,height),u=Math.max(0,Math.min(image.width-1,Math.round((x-r.left)/r.width*image.width)));
      const distance=(r.top+skyline[u]*r.height-y)/Math.max(14,r.height*.055);
      const t=Math.max(0,Math.min(1,distance));
      return t*t*(3-2*t);
    },
    foreground(img){
      const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      const pixels=ctx.getImageData(0,0,img.width,img.height).data;
      foreground={width:img.width,height:img.height,alpha:Uint8Array.from({length:img.width*img.height},(_,i)=>pixels[i*4+3])};
    },
    covers(x,y,width,height){
      if(foreground){
        const f=foreground,r=foregroundRect(width,height,view),u=Math.floor((x-r.left)/r.width*f.width),v=Math.floor((y-r.top)/r.height*f.height);
        if(u>=0&&v>=0&&u<f.width&&v<f.height&&f.alpha[v*f.width+u]>160)return true;
      }
      if(!alpha)return false;const r=rect(width,height),u=Math.floor((x-r.left)/r.width*image.width),v=Math.floor((y-r.top)/r.height*image.height);
      return u>=0&&v>=0&&u<image.width&&v<image.height&&alpha[v*image.width+u]>128;
    },
    eraseFrom(ctx,width,height){if(!mask)return;const r=rect(width,height);ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-out';ctx.drawImage(mask,r.left,r.top,r.width,r.height);ctx.restore();},
  };
}
