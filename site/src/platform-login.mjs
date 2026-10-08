// The same interface can run behind Sites login or with standalone personal accounts.
export function configurePlatformLogin(viewer,root=document){
  if(viewer.platformLoginAvailable!==false)return;
  for(const link of root.querySelectorAll('a[href^="/signin-with-chatgpt"]')){
    if(link.id==='personal-signin'){link.hidden=true;continue;}
    link.setAttribute('href','#account');link.removeAttribute('target');
  }
}
