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
export function defaultSettings(birth={}) {
  return {version:1,engine:SETTINGS_ENGINE,options:Object.fromEntries(SETTING_FIELDS.map(f=>[f.key, birth[f.key]??f.values[0]]))};
}
export function normalizeSettings(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','engine','options'].includes(k))||value.version!==1||value.engine!==SETTINGS_ENGINE)throw Error('这份安星方案的版本暂不支持，请保留原码。');
  const options=value.options;
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).length!==SETTING_FIELDS.length)throw Error('安星方案不完整。');
  for(const f of SETTING_FIELDS)if(!f.values.includes(options[f.key]))throw Error('安星选项无效：'+f.label);
  return {version:1,engine:SETTINGS_ENGINE,options:Object.fromEntries(SETTING_FIELDS.map(f=>[f.key,options[f.key]]))};
}
function checksum(value) {
  let crc=0xffff;
  for(const c of value){crc^=c.charCodeAt(0)<<8;for(let i=0;i<8;i++)crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;crc&=0xffff;}
  return crc.toString(16).toUpperCase().padStart(4,'0');
}
export function encodeSettings(value) {
  const {options}=normalizeSettings(value);
  const bits=SETTING_FIELDS.reduce((n,f,i)=>n|(f.values.indexOf(options[f.key])<<i),0);
  const payload='GXT1-'+bits.toString(36).toUpperCase().padStart(2,'0');
  return payload+'-'+checksum(payload);
}
export function decodeSettings(code) {
  const text=String(code||'').trim().toUpperCase();
  if(!/^GXT1-[0-9A-Z]{2}-[0-9A-F]{4}$/.test(text))throw Error('请输入完整的观星台安星码（GXT1 开头）；文墨安星码不能直接导入。');
  const [prefix,encoded,check]=text.split('-'),bits=parseInt(encoded,36);
  if(bits>=2**SETTING_FIELDS.length||checksum(prefix+'-'+encoded)!==check)throw Error('安星码校验失败，请检查是否复制完整。');
  return normalizeSettings({version:1,engine:SETTINGS_ENGINE,options:Object.fromEntries(SETTING_FIELDS.map((f,i)=>[f.key,f.values[(bits>>i)&1]]))});
}
export function settingsSummary(value) {
  const {options}=normalizeSettings(value);
  return SETTING_FIELDS.map(f=>`${f.label}：${f.labels[f.values.indexOf(options[f.key])]}`).join('；');
}
