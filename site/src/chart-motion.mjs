export const FLIGHT_COLORS=['#9ae0c0','#d4acf0','#9cccf2','#e9a3b1'];
const point=p=>p.map(n=>Number(n.toFixed(2))).join(' ');
export function flightCurve(from,to,center,lane=0){
  if(Math.hypot(to[0]-from[0],to[1]-from[1])<1){
    const dx=center[0]-from[0],dy=center[1]-from[1],length=Math.hypot(dx,dy)||1;
    const ux=dx/length,uy=dy/length,r=40+lane*8;
    return `M${point(from)} C${point([from[0]+ux*r-uy*r,from[1]+uy*r+ux*r])} ${point([from[0]+ux*r+uy*r,from[1]+uy*r-ux*r])} ${point(to)}`;
  }
  const dx=to[0]-from[0],dy=to[1]-from[1],length=Math.hypot(dx,dy),bend=(lane-1.5)*13;
  const control=[center[0]-dy/length*bend,center[1]+dx/length*bend];
  return `M${point(from)} Q${point(control)} ${point(to)}`;
}
export function innerAnchor(rect,center){
  const mid=[rect.x+rect.width/2,rect.y+rect.height/2],dx=center[0]-mid[0],dy=center[1]-mid[1];
  const factor=Math.min(dx===0?Infinity:rect.width/2/Math.abs(dx),dy===0?Infinity:rect.height/2/Math.abs(dy));
  return [mid[0]+dx*factor,mid[1]+dy*factor];
}
export function meteorMarkup(d,index,from,to){
  const color=FLIGHT_COLORS[index%4],style=`--flight-color:${color};--flight-duration:${5.4+index*.3}s;--flight-delay:${-index*1.3}s`;
  return `<g class="flight-stream" aria-hidden="true" style="${style}"><path class="flight-memory" d="${d}"/><path class="flight-tail flight-tail-halo" pathLength="100" d="${d}"/><path class="flight-tail" pathLength="100" d="${d}"/><circle class="flight-comet" r="3.1" style="offset-path:path('${d}')"/><circle class="flight-origin" cx="${from[0]}" cy="${from[1]}" r="3"/><circle class="flight-arrival" cx="${to[0]}" cy="${to[1]}" r="7"/></g>`;
}

export {orreryMarkup} from './orrery.mjs';
let squareObserver;
export function clearSquareFlights(){squareObserver?.disconnect();squareObserver=null;}
export function directionalArrow(rect,center,direction,lane=0){
  const mid=[rect.x+rect.width/2,rect.y+rect.height/2],dx=center[0]-mid[0],dy=center[1]-mid[1],len=Math.hypot(dx,dy)||1;
  const sign=direction==='outward'?-1:1,ux=dx/len*sign,uy=dy/len*sign;
  const distance=Math.min(Math.abs(ux)<.001?Infinity:rect.width/2/Math.abs(ux),Math.abs(uy)<.001?Infinity:rect.height/2/Math.abs(uy));
  const shift=(lane%3)*9;
  const end=[mid[0]+ux*(distance-4)-uy*shift,mid[1]+uy*(distance-4)+ux*shift];
  return {from:[end[0]-ux*22,end[1]-uy*22],to:end};
}
export function arrowMarkup(from,to,mutagen,index=0){
  const color=FLIGHT_COLORS[['禄','权','科','忌'].indexOf(mutagen)],dx=to[0]-from[0],dy=to[1]-from[1],length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
  return `<path class="intrinsic-arrow" data-mutagen="${mutagen}" d="M${point(from)}L${point(to)}M${point([to[0]-ux*7-uy*4,to[1]-uy*7+ux*4])}L${point(to)}L${point([to[0]-ux*7+uy*4,to[1]-uy*7-ux*4])}" style="--flight-color:${color};--marker-delay:${index*.2}s"/>`;
}
export function squareFlightOverlay(board,flights,intrinsic=[],selected=null){
  clearSquareFlights();
  if(!flights.length&&!intrinsic.length&&!Number.isInteger(selected))return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('square-flight-overlay');svg.setAttribute('aria-hidden','true');board.append(svg);
  const paint=()=>{
    const rect=board.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const center=[rect.width/2,rect.height/2];svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
    const cellRect=index=>{const r=board.querySelector(`[data-palace="${index}"]`).getBoundingClientRect();return {x:r.x-rect.x,y:r.y-rect.y,width:r.width,height:r.height};};
    const anchor=index=>innerAnchor(cellRect(index),center);
    const relations=Number.isInteger(selected)?[4,6,8].map(d=>`<path class="square-relation-line" d="M${point(anchor(selected))}L${point(anchor((selected+d)%12))}"/>`).join(''):'';
    const lanes=new Map();
    const permanent=intrinsic.map((f,i)=>{const key=f.sourceIndex+'/'+f.direction,lane=lanes.get(key)||0;lanes.set(key,lane+1);const a=directionalArrow(cellRect(f.sourceIndex),center,f.direction,lane);return `<g data-transform="${f.direction}" data-source="${f.sourceIndex}">${arrowMarkup(a.from,a.to,f.mutagen,i)}</g>`;}).join('');
    svg.innerHTML=relations+permanent+flights.map((f,i)=>{const a=anchor(f.sourceIndex),b=anchor(f.targetIndex);if(f.self){const outward=directionalArrow(cellRect(f.sourceIndex),center,'outward');return meteorMarkup(`M${point(outward.from)}L${point(outward.to)}`,i,outward.from,outward.to);}return meteorMarkup(flightCurve(a,b,center,i),i,a,b);}).join('');
  };
  squareObserver=new ResizeObserver(paint);squareObserver.observe(board);
}
