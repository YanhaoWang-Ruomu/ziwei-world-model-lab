export const VERSION='fictional-retrieval-v1';
export const SOURCES=[
 {book:'garden-a',page:1,text:'藍色花盆每天澆水一次。紅色花盆每三天澆水一次。'},
 {book:'garden-a',page:120,text:'冬季園圃花木每七天澆水一次。'},
 {book:'garden-a',page:240,text:'最後一頁記錄：白色花盆已移至西側窗臺。'},
 {book:'garden-b',page:1,text:'冬季園圃花木每十天澆水一次，應參考所在地濕度。'},
 {book:'garden-b',page:2,text:'長期乾燥時，給盆栽補水以免枯萎。'},
 {book:'garden-b',page:3,text:'虛構觀測站每週二校準溫度計，週五檢查雨量筒。'},
 {book:'garden-b',page:4,text:'晴天在東窗觀察植株；陰天在南窗記錄葉片。'},
 {book:'restricted',page:1,text:'虛構受限樣本暗號：石榴鐘樓。',level:'special'}
];
export const QUESTIONS=[
 {id:'simplified',query:'蓝色花盆每天浇水一次',expected:['garden-a:1']},
 {id:'traditional',query:'藍色花盆每天澆水一次',expected:['garden-a:1']},
 {id:'page120',query:'冬季园圃花木每七天浇水',expected:['garden-a:120']},
 {id:'lastpage',query:'最后一页白色花盆',expected:['garden-a:240']},
 {id:'crossbook',query:'冬季园圃花木浇水',expected:['garden-a:120','garden-b:1']},
 {id:'concept',query:'给盆栽补水以免枯萎',expected:['garden-b:2']},
 {id:'paraphrase',query:'植物渴了该怎么办',expected:['garden-b:2']},
 {id:'instrument',query:'什么时候校准温度计',expected:['garden-b:3']},
 {id:'window',query:'阴天在哪个窗户记录叶片',expected:['garden-b:4']},
 {id:'absent',query:'飞机售票退改签',expected:[]},
 {id:'restricted',query:'石榴钟楼',expected:[]},
 {id:'unrelated',query:'海底潜艇燃料',expected:[]}
];
