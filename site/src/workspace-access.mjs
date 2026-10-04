export const VIEW_LABELS=Object.freeze({world:'世界状态与复盘',community:'社区讨论',model:'星辰与命盘',library:'书籍与文章',cards:'技法卡片库',submissions:'我的提交',review:'审核中心',rules:'规则编辑与测试',materials:'材料管理',private:'本机私密入口',members:'核心账户',lab:'研究实验室',history:'历史记录',account:'账户与访问'});
const publicViews=new Set(['model','world','community','library','account']);
const specialViews=new Set(['cards','submissions']);
// Presentation policy only. Each API continues to enforce its own authorization.
export function viewAccess(viewer={},key,context={}){
  if(!Object.hasOwn(VIEW_LABELS,key))return {allowed:false,reason:'页面不存在'};
  if(publicViews.has(key))return {allowed:true,reason:''};
  const core=viewer.role==='core'&&Boolean(viewer.core);
  if(key==='members')return {allowed:core&&Boolean(viewer.founder),reason:'创建者权限开启后可管理账户授权'};
  if(key==='rules'&&viewer.role==='special'&&context.ruleDraft)return {allowed:true,reason:''};
  if(specialViews.has(key))return {allowed:core||viewer.role==='special',reason:'特殊或核心权限开启后可使用'};
  return {allowed:core,reason:'核心管理人权限开启后可使用'};
}
