// Both layouts use the calculated palace records. Only their geometry differs.
export function palaceStemBranch(palace){return palace.heavenlyStem+palace.earthlyBranch;}
export function palaceAngle(index){return (index-4)*30;} // 午 above, 子 below, as in the square chart.
export function palaceAtAngle(angle){return ((Math.round(angle/30)+4)%12+12)%12;}
export function chartSource(result){return result?.provider==='public-server'?'若木安星 · 服务器计算':'公开算法 · 浏览器计算';}
export function chartStemSummary(result){
  const life=result.chart.palaces.find(p=>p.name==='命宫');
  return `本命宫干 · ${result.chart.rawDates.chineseDate.yearly.join('')}年生 · 命宫 ${palaceStemBranch(life)}`;
}
