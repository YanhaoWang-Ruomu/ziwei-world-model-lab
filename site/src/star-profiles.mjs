export const SOURCES = {
  hyg:'https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md',
  stars:'https://docs.iztro.com/learn/major-star',
  chart:'https://docs.iztro.com/posts/config-n-plugin',
  north:'https://hk.space.museum/tc/web/spm/resources/curators-blog/2022/03/the-big-dipper-a-pointer-in-the-sky.html',
  culture:'https://zh.wikisource.org/wiki/太上玄靈北斗本命延生真經',
  chinese:'https://github.com/Stellarium/stellarium-skycultures/blob/master/chinese/index.json',
  south:'https://zh.wikipedia.org/w/index.php?title=南斗六星&oldid=94291277',
  brightNames:'https://hk.space.museum/en/web/spm/resources/teachers-corner/constellations-and-myths/glossary-of-bright-stars.html',
};
// A cultural association is not a physical cause or a computed sky position.
export const NAMED_STARS = [
  {hip:54061,name:'天枢',modern:'Dubhe · α Ursae Majoris',symbol:'贪狼',group:'北斗',tag:'北斗第一星'},
  {hip:53910,name:'天璇',modern:'Merak · β Ursae Majoris',symbol:'巨门',group:'北斗',tag:'北斗第二星'},
  {hip:58001,name:'天玑',modern:'Phecda · γ Ursae Majoris',symbol:'禄存',group:'北斗',tag:'北斗第三星'},
  {hip:59774,name:'天权',modern:'Megrez · δ Ursae Majoris',symbol:'文曲',group:'北斗',tag:'北斗第四星'},
  {hip:62956,name:'玉衡',modern:'Alioth · ε Ursae Majoris',symbol:'廉贞',group:'北斗',tag:'北斗第五星'},
  {hip:65378,name:'开阳',modern:'Mizar · ζ Ursae Majoris',symbol:'武曲',group:'北斗',tag:'北斗第六星'},
  {hip:67301,name:'摇光',modern:'Alkaid · η Ursae Majoris',symbol:'破军',group:'北斗',tag:'北斗第七星'},
  {hip:11767,name:'勾陈一',modern:'Polaris · α Ursae Minoris · 北极星',group:'北极',tag:'勾陈一 · 当前北极附近的恒星'},
  // Astronomical numbering follows Stellarium; cultural order follows the explicitly linked south table.
  // These are cultural associations, not a unique physical identification across all traditions.
  {hip:92041,name:'斗宿一',modern:'φ Sagittarii',symbol:'天同',group:'南斗',order:4,tag:'斗宿一 · 人马座 φ'},
  {hip:90496,name:'斗宿二',modern:'Kaus Borealis · λ Sagittarii',symbol:'天相',group:'南斗',order:5,tag:'斗宿二 · 人马座 λ'},
  {hip:89341,name:'斗宿三',modern:'Polis · μ Sagittarii',symbol:'七杀',group:'南斗',order:6,tag:'斗宿三 · 人马座 μ'},
  {hip:92855,name:'斗宿四',modern:'Nunki · σ Sagittarii',symbol:'天机',group:'南斗',order:3,tag:'斗宿四 · 人马座 σ'},
  {hip:93864,name:'斗宿五',modern:'τ Sagittarii',symbol:'天梁',group:'南斗',order:2,tag:'斗宿五 · 人马座 τ'},
  {hip:93506,name:'斗宿六',modern:'Ascella · ζ Sagittarii',symbol:'天府',group:'南斗',order:1,tag:'斗宿六 · 人马座 ζ'},
  // Stellarium identifies five members of the traditional six-star Wenchang asterism.
  // Wenchang I has no verified modern identification here; do not invent a sixth coordinate.
  {hip:48319,name:'次将',modern:'υ Ursae Majoris',group:'文昌',tag:'文昌星官 · 文昌二'},
  {hip:48402,name:'贵相',modern:'φ Ursae Majoris',group:'文昌',tag:'文昌星官 · 文昌三'},
  {hip:46853,name:'司命',modern:'θ Ursae Majoris',group:'文昌',tag:'文昌星官 · 文昌四'},
  {hip:44901,name:'司中',modern:'15 Ursae Majoris',group:'文昌',tag:'文昌星官 · 文昌五'},
  {hip:45493,name:'司禄',modern:'18 Ursae Majoris',group:'文昌',tag:'文昌星官 · 文昌六'},
];
export const PROFILES = {
  紫微:{keywords:'统筹 · 主导',intro:'十四主星之一，传统上借帝座象征组织与统领。',relation:'与紫微垣、帝座意象有关；命盘紫微不等同于现代北极星。'},
  天机:{keywords:'思考 · 变动',intro:'十四主星之一，常用来讨论机变、计划与行动的转折。'},
  太阳:{keywords:'外显 · 付出',intro:'十四主星之一，借日的意象讨论外向表达与照拂。',relation:'现代天体为太阳（Sun）。本页恒星星表不含太阳；命盘位置不是太阳黄道位置。'},
  武曲:{keywords:'执行 · 资源',intro:'十四主星之一，常与务实、执行和财务资源的主题相连。'},
  天同:{keywords:'和缓 · 享受',intro:'十四主星之一，常用于讨论舒适感、协调与生活体验。'},
  廉贞:{keywords:'边界 · 约束',intro:'十四主星之一，传统解读涉及规矩、人际边界与情感。'},
  天府:{keywords:'积蓄 · 管理',intro:'十四主星之一，传统以府库比喻储备与管理。',group:'南斗'},
  太阴:{keywords:'内敛 · 积累',intro:'十四主星之一，借月的意象讨论内在感受与累积。',relation:'现代天体为月球（Moon）。命盘太阴的位置不等同于月球天文位置。'},
  贪狼:{keywords:'探索 · 交往',intro:'十四主星之一，常涉及兴趣、欲望与人际互动。'},
  巨门:{keywords:'表达 · 辨析',intro:'十四主星之一，传统解读常涉及言语与辨析。'},
  天相:{keywords:'协调 · 辅佐',intro:'十四主星之一，以辅佐与协调为常见象征。'},
  天梁:{keywords:'庇护 · 原则',intro:'十四主星之一，常借长者意象讨论原则与照顾。'},
  七杀:{keywords:'决断 · 开拓',intro:'十四主星之一，常用于讨论决断、独立与变化。'},
  破军:{keywords:'破旧 · 重建',intro:'十四主星之一，传统以破旧重建描绘改变。'},
  禄存:{keywords:'禄 · 资源',intro:'斗数辅星，用于描述禄与资源的传统概念。'},
  文曲:{keywords:'文艺 · 表达',intro:'斗数辅星，常与文艺、表达等文化意象相连。'},
  左辅:{keywords:'辅佐 · 协作',intro:'斗数辅星，以辅佐、协作等作为传统文化意象。',relation:'天仪以北斗第八隐曜洞明联动辉映。属于传统九星意象，不认定为单一现代恒星。'},
  右弼:{keywords:'襄助 · 配合',intro:'斗数辅星，以襄助、配合等作为传统文化意象。',relation:'天仪以北斗第九隐曜隐元联动辉映。属于传统九星意象，不认定为单一现代恒星。'},
  文昌:{keywords:'文书 · 学识',intro:'斗数辅星，常借文书、学识与表达的意象说明其传统含义。',relation:'天仪以文昌星官联动辉映，这是文化意象，不把斗数文昌断定为其中某一颗恒星。星官古称六星；其中五颗采用已核定的星表坐标；上将另列为文化意象星标，不赋予虚构坐标。'},
};
export const NORTH_LINES=[[54061,53910],[53910,58001],[58001,59774],[59774,54061],[59774,62956],[62956,65378],[65378,67301]];
export const SOUTH_LINES=[[89341,90496],[90496,92041],[92041,92855],[92855,93864],[93864,93506],[93506,92041]];
export const WENCHANG_LINES=[[48319,48402],[48402,46853],[46853,44901],[44901,45493]];
export const SOUTH_STARS=NAMED_STARS.filter(s=>s.group==='南斗').sort((a,b)=>a.order-b.order);
export const starLabel=star=>star.name;
export function profileFor(name){
  const association=NAMED_STARS.find(s=>s.symbol===name);
  const base=PROFILES[name]||{keywords:'传统星曜',intro:'排盘中的辅助星曜；需结合所在宫位、组合与明确规则理解。'};
  return {...base,name,association,relation:base.relation||(association?`本页${association.group}文化对照：${association.name}（${association.modern}）。命盘安星依历法规则计算；文化对照不代表恒星的实际运行轨迹。`:'属于命理符号。本版没有核定单一现代恒星对应，不虚构天文坐标。')};
}
