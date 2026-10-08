// Only reviewed public HTTPS endpoints are proxied. Other gateways need an operator allowlist.
export const AI_PROVIDERS=[
  {id:'qwen-beijing',name:'千问 · 百炼北京',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus'},
  {id:'qwen-singapore',name:'千问 · 百炼新加坡',baseUrl:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',model:'qwen-plus'},
  {id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com/v1',model:'deepseek-chat'},
  {id:'siliconflow',name:'硅基流动',baseUrl:'https://api.siliconflow.cn/v1',model:''}
];
export function canonicalBase(value){
  if(typeof value!=='string'||value.length>300)throw Error('请填写服务商提供的 HTTPS 接口地址。');
  let u;try{u=new URL(value);}catch{throw Error('接口地址格式不正确。');}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(u.hostname)||/\.(localhost|local|internal)$/.test(u.hostname))throw Error('仅支持公开 HTTPS 服务地址。');
  const path=u.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'');
  return u.origin+path;
}
export function validateConnection(connection,allowed=[]){
  if(!connection||typeof connection!=='object')throw Error('请先配置个人 AI 接口。');
  const baseUrl=canonicalBase(connection.baseUrl);
  if(![...AI_PROVIDERS.map(p=>p.baseUrl),...allowed].includes(baseUrl))throw Error('这个接口地址尚未开放。请使用已支持的服务商，或联系创建者加入可信接口。');
  if(typeof connection.apiKey!=='string'||!/^[\x21-\x7e]{12,512}$/.test(connection.apiKey))throw Error('请填写有效的 API 密钥，不能包含空格或换行。');
  if(typeof connection.model!=='string'||!connection.model.trim()||connection.model.length>160||/[\x00-\x1f]/.test(connection.model))throw Error('请填写服务商提供的模型 ID。');
  return {baseUrl,apiKey:connection.apiKey,model:connection.model.trim()};
}
