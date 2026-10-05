// Versioned public engine options only. No birth information or custom rule code.
export const SETTINGS_ENGINE = 'iztro 2.6.1';
export const REMOTE_PROVIDER = 'public-server';
export const SETTING_FIELDS = Object.freeze([
  {key:'algorithm',label:'安星版本',values:['default','zhongzhou'],labels:['通行版本','中州派版本']},
  {key:'yearDivide',label:'本命年界',values:['normal','exact'],labels:['农历正月初一','立春']},
  {key:'horoscopeDivide',label:'运限干支分界',values:['normal','exact'],labels:['农历年、月','节气年、月']},
  {key:'ageDivide',label:'小限虚岁分界',values:['normal','birthday'],labels:['自然年','农历生日']},
  {key:'dayDivide',label:'晚子时换日',values:['forward','current'],labels:['23:00 起归次日','00:00 起归次日']},
  {key:'fixLeap',label:'本命闰月处理',values:[true,false],labels:['十五日为界','闰月全部作本月']},
]);
// Stable ordering is part of GXT2's wire format. Never reorder these fields.
export const METHOD_FIELDS = Object.freeze([
  {key:'tianma',label:'安天马',values:['year','month'],labels:['依据年支','依据月支'],hint:'月支按农历月取，闰月沿用下方闰月设置。'},
  {key:'tiankong',label:'安天空',values:['normal','hour'],labels:['常规排法','顺加生时'],hint:'顺加生时以常规天空宫位起子时。'},
  {key:'brightness',label:'星曜亮度',values:['iztro'],labels:['现用公开亮度表'],unavailable:['依据中州派理论','现代修订亮度一','现代修订亮度二'],hint:'其余亮度表尚未核对，暂不可选。'},
  {key:'kongwang',label:'安截空旬空',values:['engine','single','double'],labels:['沿用基础版本','常规单星法','正副双星法'],unavailable:['占验派排法'],hint:'单星显示截空、旬空；双星增加副截、副旬。占验派尚未接入。'},
  {key:'tianshi',label:'安天使天伤',values:['default','zhongzhou'],labels:['常规排法','中州派排法']},
  {key:'kuiyue',label:'安魁钺',values:['xinHorseTiger','xinTigerHorse','gengXinHorseTiger','gengXinTigerHorse'],labels:['六辛逢马虎','六辛逢虎马','庚辛逢马虎','庚辛逢虎马'],hint:'同时用于本命魁钺与运限流曜。'},
  {key:'soul',label:'安命主',values:['palace','year'],labels:['依据命宫地支（全书）','依据生年地支（中州）']},
  {key:'yearlyMutagen',label:'流年四化',values:['year','palace'],labels:['依据流年天干','依据流年命宫天干']},
  {key:'changshengDirection',label:'长生十二神 · 顺逆',values:['gender','forward'],labels:['区分阴阳顺逆','不分阴阳，一律顺行']},
  {key:'earthChangsheng',label:'长生十二神 · 土局',values:['water','fire'],labels:['水土共长生','火土共长生']},
]);
export const ALL_SETTING_FIELDS=Object.freeze([...SETTING_FIELDS,...METHOD_FIELDS]);
export function legacySettings(birth={}){return {version:1,engine:SETTINGS_ENGINE,options:Object.fromEntries(SETTING_FIELDS.map(f=>[f.key,birth[f.key]??f.values[0]]))};}
export function defaultSettings(birth={}) {
  const options=Object.fromEntries(ALL_SETTING_FIELDS.map(f=>[f.key,birth[f.key]??f.values[0]]));
  if(options.algorithm==='zhongzhou'){options.tianshi=birth.tianshi??'zhongzhou';options.soul=birth.soul??'year';}
  return {version:2,engine:SETTINGS_ENGINE,options};
}
export function normalizeSettings(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','engine','options'].includes(k))||![1,2].includes(value.version)||value.engine!==SETTINGS_ENGINE)throw Error('这份安星方案的版本暂不支持，请保留原码。');
  const options=value.options,fields=value.version===1?SETTING_FIELDS:ALL_SETTING_FIELDS;
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).length!==fields.length)throw Error('安星方案不完整。');
  for(const f of fields)if(!f.values.includes(options[f.key]))throw Error('安星选项无效：'+f.label);
  return {version:value.version,engine:SETTINGS_ENGINE,options:Object.fromEntries(fields.map(f=>[f.key,options[f.key]]))};
}
export function upgradeSettings(value){const normalized=normalizeSettings(value);return normalized.version===1?defaultSettings(normalized.options):normalized;}
function checksum(value) {
  let crc=0xffff;
  for(const c of value){crc^=c.charCodeAt(0)<<8;for(let i=0;i<8;i++)crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;crc&=0xffff;}
  return crc.toString(16).toUpperCase().padStart(4,'0');
}
export function encodeSettings(value) {
  const {version,options}=normalizeSettings(value),fields=version===1?SETTING_FIELDS:ALL_SETTING_FIELDS;
  let bits=0,multiplier=1;
  for(const f of fields){bits+=f.values.indexOf(options[f.key])*multiplier;multiplier*=f.values.length;}
  const payload=`GXT${version}-`+bits.toString(36).toUpperCase().padStart(version===1?2:5,'0');
  return payload+'-'+checksum(payload);
}
export function decodeSettings(code) {
  const text=String(code||'').trim().toUpperCase();
  if(!/^(GXT1-[0-9A-Z]{2}|GXT2-[0-9A-Z]{5})-[0-9A-F]{4}$/.test(text))throw Error('请输入完整的观星台安星码（GXT1 或 GXT2 开头）；文墨安星码不能直接导入。');
  const [prefix,encoded,check]=text.split('-'),version=Number(prefix.slice(-1)),fields=version===1?SETTING_FIELDS:ALL_SETTING_FIELDS;
  let bits=parseInt(encoded,36);const count=fields.reduce((n,f)=>n*f.values.length,1);
  if(bits>=count||checksum(prefix+'-'+encoded)!==check)throw Error('安星码校验失败，请检查是否复制完整。');
  const options={};for(const f of fields){options[f.key]=f.values[bits%f.values.length];bits=Math.floor(bits/f.values.length);}
  return normalizeSettings({version,engine:SETTINGS_ENGINE,options});
}
export function settingsSummary(value) {
  const {options}=upgradeSettings(value);
  return ALL_SETTING_FIELDS.map(f=>`${f.label}：${f.labels[f.values.indexOf(options[f.key])]}`).join('；');
}
