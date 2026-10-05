export function scanRange({unit,first,last,startDate,endDate}){
  if(unit==='current')return;
  if(['yearly','monthly'].includes(unit)){const max=unit==='yearly'?120:20;if(!Number.isInteger(first)||!Number.isInteger(last)||first<1901||last>2099||first>last||last-first>=max)throw Error('请选择 1901—2099 年内、跨度不超过 '+max+' 年的区间。');return;}
  if(!['daily','hourly'].includes(unit))throw Error('筛选单位不正确。');
  const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s&&s>='1901-01-01'&&s<='2099-12-31';
  const days=(Date.parse(endDate)-Date.parse(startDate))/86400000+1,max=unit==='daily'?366:31;
  if(!valid(startDate)||!valid(endDate)||days<1||days>max)throw Error('请选择有效的公历日期；本次'+(unit==='daily'?'流日最多 366 天。':'流时最多 31 天。'));
}
export function* datedPeriods(input){
  scanRange(input);if(!['daily','hourly'].includes(input.unit))return;
  for(let stamp=Date.parse(input.startDate+'T12:00:00Z');stamp<=Date.parse(input.endDate+'T12:00:00Z');stamp+=86400000){const date=new Date(stamp).toISOString().slice(0,10);
    if(input.unit==='daily')yield {start:date,end:date,time:'12:00',label:date};
    else for(let i=0;i<13;i++){const time=i===0?'00:00':String(i*2-1).padStart(2,'0')+':00',endTime=i===0?'00:59':i===12?'23:59':String(i*2).padStart(2,'0')+':59';yield {start:date,end:date,time,endTime,label:date+' · '+(i===0?'早子':i===12?'晚子':'子丑寅卯辰巳午未申酉戌亥'[i]+'时')+' '+time+'–'+endTime};}
  }
}
