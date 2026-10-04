// Follow the transparent seams of the four approved painted poses.
const seams=[
  [[0,0],[0,768]],
  [[512,0],[512,260],[553,285],[553,334],[512,365],[480,385],[480,465],[512,490],[512,768]],
  [[1024,0],[1024,260],[1065,285],[1065,334],[1024,365],[992,385],[992,465],[1024,490],[1024,768]],
  [[1536,0],[1536,260],[1565,285],[1565,334],[1510,355],[1488,395],[1494,463],[1550,525],[1605,575],[1605,645],[1536,768]],
  [[2048,0],[2048,768]],
];

export function createSilkCranes(){
  let birds=null;
  const clips=Array.from({length:4},(_,i)=>{
    const path=new Path2D(),points=[...seams[i],...seams[i+1].slice().reverse()];
    points.forEach(([x,y],j)=>path[j?'lineTo':'moveTo'](x-i*512,y));path.closePath();return path;
  });
  const ready=new Promise(resolve=>{
    const image=new Image();image.onload=()=>{birds=image;resolve(true);};image.onerror=()=>resolve(false);
    image.src='./sky/crane-silk-right-atlas.png';
  });
  function draw(ctx,{time,width:w,height:h,weight=1,scene=0,size=1}){
    if(!birds||!ctx||weight<.01||scene===2)return;
    const travel=((time+(scene===0?8:15))%48)/48;
    if(travel>.90)return;
    const progress=travel/.90,leading=(-.20+progress*1.45)*w;
    const tile=512,count=scene===0?2:1;
    for(let i=0;i<count;i++){
      const wing=Math.floor((time*3+i*.65)%4);
      const birdW=Math.min(156,Math.max(76,w*.093))*(1-i*.19)*size,birdH=birdW*768/tile;
      const x=leading-i*birdW*.9;
      const y=h*((scene===0?.50:.42)-progress*.055)+i*birdH*.35+Math.sin(time*.28+i)*h*.008;
      const fade=Math.min(1,travel*12,(.90-travel)*12)*weight*(i===0?.94:.72);
      ctx.save();ctx.globalAlpha=Math.max(0,fade);ctx.translate(x,y);ctx.rotate(Math.sin(time*.21+i)*.022);
      ctx.translate(-birdW/2,-birdH/2);ctx.scale(birdW/tile,birdW/tile);
      ctx.clip(clips[wing]);ctx.drawImage(birds,-tile*wing,0);ctx.restore();
    }
  }
  return {ready,draw};
}
