// Public, wholly fictional fixtures. Never substitute an uploaded book or private rule here.
export const EVALUATION_VERSION='fictional-reading-v1';
export const READING_FIXTURES=[
 {id:'literal',name:'原文问答',question:'蓝色花盆多久浇水一次？',sources:['蓝色花盆每天浇水一次，红色花盆每三天浇水一次。'],expected:'只回答蓝色花盆每天一次，并引用对应原文。',markers:['每天'],refuse:false},
 {id:'conflict',name:'跨文献分歧',question:'两份记录对冬季蓝色花盆的浇水频率是否一致？',sources:['甲记录：冬季蓝色花盆每七天浇水一次。','乙记录：冬季蓝色花盆每十天浇水一次。'],expected:'分别指出七天和十天，说明记录存在分歧，不自行合并成唯一答案。',markers:['七天','十天'],refuse:false},
 {id:'insufficient',name:'缺少依据',question:'蓝色花盆的购买价格是多少？',sources:['蓝色花盆每天浇水一次，置于东侧窗台。'],expected:'明确说明资料没有价格，不能编造金额。',markers:[],refuse:true}
];
export function evaluationInput(id){
 const fixture=READING_FIXTURES.find(x=>x.id===id);if(!fixture)throw Error('请选择预设的虚构验收题。');
 return {fixture,input:{kind:'answer',question:fixture.question,citations:fixture.sources.map((quote,i)=>({book_id:'fictional-evaluation-'+id,page:i+1,title:'虚构验收资料 '+(i+1),quote}))}};
}
export function evaluationChecks(fixture,result){
 const answer=result.claims.map(x=>x.text).join('\n')+'\n'+result.uncertainties.join('\n');
 return {citationValid:true,expectedMarkersPresent:fixture.markers.every(x=>answer.includes(x)),refusalObserved:result.claims.length===0&&result.uncertainties.length>0,needsHumanReview:true};
}
