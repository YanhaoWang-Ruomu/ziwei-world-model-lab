import {NAMED_STARS,PROFILES,SOURCES} from './star-profiles.mjs';

// Display radii and animation periods are compressed, never ephemeris coordinates.
export const SOLAR_PLANETS=[
  {id:'mercury',name:'水星',modern:'Mercury · 辰星',color:'#aaa69d',radius:5,rx:52,period:24,year:'约 88 天',intro:'太阳系最内侧的岩质行星，表面布满撞击坑。'},
  {id:'venus',name:'金星',modern:'Venus · 太白',color:'#e6cba0',radius:7.1,rx:73,period:35,year:'约 225 天',intro:'浓厚云层包裹的岩质行星。暖色云纹表现其大气。'},
  {id:'earth',name:'地球',modern:'Earth',color:'#6eafd5',radius:7.6,rx:96,period:46,year:'约 365 天',intro:'海洋、陆地与云层共同构成蓝色地球；月球随地球一起绕太阳运行。'},
  {id:'mars',name:'火星',modern:'Mars · 荧惑',color:'#cb8062',radius:5.8,rx:119,period:59,year:'约 687 天',intro:'红色岩质行星。深色地貌和明亮极冠构成表面层次。'},
  {id:'jupiter',name:'木星',modern:'Jupiter · 岁星',color:'#d5b494',radius:13,rx:157,period:83,year:'约 11.9 年',intro:'太阳系最大的行星。明暗云带环绕球面，大红斑点缀其中。'},
  {id:'saturn',name:'土星',modern:'Saturn · 镇星',color:'#d1bd94',radius:11,rx:188,period:106,year:'约 29.5 年',intro:'拥有醒目环系的气态巨行星。无数冰与岩石碎块组成明亮而轻薄的光环。'},
  {id:'uranus',name:'天王星',modern:'Uranus',color:'#8bced2',radius:9,rx:222,period:134,year:'约 84 年',intro:'蓝绿色的冰巨星，自转轴大幅倾斜。这里以倾斜环系表现其独特姿态。'},
  {id:'neptune',name:'海王星',modern:'Neptune',color:'#5084cf',radius:8.8,rx:250,period:162,year:'约 165 年',intro:'八大行星中距离太阳最远的一颗冰巨星。云纹在蓝色大气中缓慢流动。'},
];
export const SMALL_BODIES=[
  {id:'ceres',name:'谷神星',modern:'Ceres · 矮行星',color:'#a19a8e',radius:2.7,rx:138,period:72,intro:'位于火星与木星之间的主小行星带，是该区域最大的天体。'},
  {id:'pluto',name:'冥王星',modern:'Pluto · 矮行星',color:'#c9b29f',radius:3.8,rx:273,period:189,intro:'柯伊伯带中的矮行星，以明暗相间的冰质表面呈现。它不计入八大行星。'},
];
export const MOON={id:'moon',name:'月球',modern:'Moon · 太阴',color:'#d5d6d2',radius:2.4,intro:'地球的天然卫星。地月系统共同绕日运行，月球同时绕地球运行。'};
export const SOLAR_ITEMS=[
  {id:'sun',name:'太阳',modern:'Sun · 太阳系恒星',color:'#ffd38b',intro:'太阳位于这座日心天仪中央。行星绕日运行，日冕与光芒缓缓舒展。'},
  ...SOLAR_PLANETS,MOON,...SMALL_BODIES,
  {id:'asteroids',name:'主小行星带',modern:'Main asteroid belt',intro:'火星与木星轨道之间的碎屑环带。点状粒子仅表达分布层次，不代表逐颗小行星的位置。'},
  {id:'kuiper',name:'柯伊伯带',modern:'Kuiper Belt',intro:'海王星轨道之外的冰质小天体区域。这里显示环带与冥王星这一代表天体。'},
].map(p=>({...p,group:'太阳系',source:'https://science.nasa.gov/solar-system/planets/'}));
SOLAR_ITEMS.find(p=>p.id==='kuiper').source='https://science.nasa.gov/solar-system/kuiper-belt/facts/';

// HYG 4.1 / J2000, selected from the site's public catalogue. CC BY-SA 4.0.
// Columns: HIP, right ascension (hours), declination (degrees), distance (pc), magnitude.
const ASTROMETRY=[
  [54061,11.062155,61.751033,37.679,1.81],[53910,11.030677,56.382427,24.4499,2.34],
  [58001,11.897168,53.69476,25.5037,2.41],[59774,12.257086,57.032617,24.6853,3.32],
  [62956,12.900472,55.959821,25.31,1.76],[65378,13.398747,54.925362,26.3089,2.23],
  [67301,13.792354,49.313265,31.8674,1.85],[11767,2.52975,89.264109,132.626,1.97],
  [92041,18.76094,-26.990778,73.3676,3.17],[90496,18.466179,-25.4217,23.9693,2.82],
  [89341,18.229392,-21.058834,null,3.84],[92855,18.92109,-26.296722,69.8324,2.05],
  [93864,19.11567,-27.670423,37.2856,3.32],[93506,19.043532,-29.880105,27.0416,2.6],
  [48319,9.849867,59.038735,35.6379,3.78],[48402,9.868433,54.064332,156.0062,4.55],
  [46853,9.547715,51.6773,13.4789,3.17],[44901,9.147863,51.604648,28.8184,4.46],
  [45493,9.269808,54.021857,35.8423,4.8],
];
export const ORRERY_STARS=ASTROMETRY.map(([hip,ra,dec,pc,mag])=>{
  const star=NAMED_STARS.find(s=>s.hip===hip);
  return {...star,id:'hip-'+hip,ra,dec,pc,mag,source:SOURCES.hyg,
    intro:star.group==='北极'?'勾陈一，当前北天极附近的恒星。它属于遥远恒星背景，并不绕太阳公转。':star.group==='文昌'?`${star.tag}。文昌在北斗斗勺上方，古称六星；此处只绘制星表已核定的五颗，文昌一现代对应未定。点击命盘文昌会点亮这个星官，表示文化意象，不是单一恒星认定。`:`${star.group==='北斗'?'大熊座':'人马座'}方向的${star.group}星官成员。${star.symbol?`传统文化对照：${star.symbol}。${PROFILES[star.symbol]?.intro||''}`:''}`};
});
// The two hidden stars are cultural entries, never catalogue coordinates.
export const NORTH_HIDDEN_STARS=[
  {id:'north-dongming',name:'洞明',symbol:'左辅',order:8,group:'北斗',kind:'cultural',modern:'现代恒星对应未核定',intro:'北斗第八隐曜，传统辅星意象。本页采用洞明—左辅的文化对照；点击命盘左辅时辉映。图中位置为示意，不代表真实恒星坐标。'},
  {id:'north-yinyuan',name:'隐元',symbol:'右弼',order:9,group:'北斗',kind:'cultural',modern:'现代恒星对应未核定',intro:'北斗第九隐曜，传统弼星意象。本页采用隐元—右弼的文化对照；点击命盘右弼时辉映。图中位置为示意，不代表真实恒星坐标。'},
].map(s=>({...s,source:'https://zh.wikisource.org/zh-hans/雲笈七籤/24'}));
export const ORRERY_ITEMS=[...SOLAR_ITEMS,...ORRERY_STARS,...NORTH_HIDDEN_STARS];
const ANCIENT_NAMES={mercury:'辰星',venus:'太白',mars:'荧惑',jupiter:'岁星',saturn:'镇星',moon:'太阴'};
// Later discoveries keep their established names instead of inventing ancient aliases.
export const traditionalName=item=>ANCIENT_NAMES[item.id]||item.name;

// Each asterism gets its own tangent-plane projection; the two panels are not one sky map.
export function projectAsterism(group,box){
  const stars=ORRERY_STARS.filter(s=>s.group===group),rad=Math.PI/180;
  const a0=stars.reduce((a,s)=>a+s.ra,0)/stars.length*15*rad,d0=stars.reduce((a,s)=>a+s.dec,0)/stars.length*rad;
  const points=stars.map(s=>{const a=s.ra*15*rad-a0,d=s.dec*rad,c=Math.sin(d0)*Math.sin(d)+Math.cos(d0)*Math.cos(d)*Math.cos(a);return {...s,x:-Math.cos(d)*Math.sin(a)/c,y:-(Math.cos(d0)*Math.sin(d)-Math.sin(d0)*Math.cos(d)*Math.cos(a))/c};});
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0,scale=Math.min(box.w/w,box.h/h);
  return points.map(p=>({...p,x:box.x+(box.w-w*scale)/2+(p.x-x0)*scale,y:box.y+(box.h-h*scale)/2+(p.y-y0)*scale}));
}
