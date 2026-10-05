package site.guanxingtai.android;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import android.util.Base64;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.UUID;
import org.json.*;

public class MainActivity extends Activity {
  private WebView web;
  private AppUpdates updates;
  private FrameLayout root;
  private LinearLayout offline;
  private ValueCallback<Uri[]> chooser;
  private WebView auth;
  private Dialog authDialog;
  private String exportUrl,exportMime,blobSlot;
  private OutputStream exportStream;
  private ProgressDialog progress;
  private boolean exporting=false,destroyed=false;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private static final int PICK=100,SAVE=101;

  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    updates=new AppUpdates(this);
    root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(7,17,30));setContentView(root);
    root.setOnApplyWindowInsetsListener((v,insets)->{
      if(Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);}
      else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
      return insets;
    });
    web=new WebView(this);configure(web,false);root.addView(web,new FrameLayout.LayoutParams(-1,-1));
    makeOffline();
    if(state==null||web.restoreState(state)==null)web.loadUrl(UrlPolicy.SITE+"/");
    if(state==null)handler.postDelayed(()->updates.check(false),7000);
  }
  private void configure(WebView view,boolean login){
    WebSettings s=view.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    s.setMediaPlaybackRequiresUserGesture(false);s.setSupportMultipleWindows(true);s.setJavaScriptCanOpenWindowsAutomatically(false);
    s.setBuiltInZoomControls(true);s.setDisplayZoomControls(false);s.setUseWideViewPort(true);s.setLoadWithOverviewMode(true);
    s.setUserAgentString(s.getUserAgentString()+" GuanXingTaiAndroid/1.0.2");
    CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(view,false);
    view.setBackgroundColor(Color.rgb(7,17,30));
    view.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return navigation(v,r.getUrl().toString(),login,r.isForMainFrame());}
      @Override public void onPageFinished(WebView v,String url){
        CookieManager.getInstance().flush();
        if(v==web&&UrlPolicy.own(url))v.evaluateJavascript("(()=>{if(window.__gxtDownloadNames)return;const names=window.__gxtDownloadNames=new Map(),click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.href.startsWith('blob:')&&this.download){if(names.size>100)names.clear();names.set(this.href,this.download)}return click.apply(this,arguments)};document.addEventListener('click',e=>{const a=e.target.closest?.('a[download]');if(a&&a.href.startsWith('blob:')){if(names.size>100)names.clear();names.set(a.href,a.download)}},true)})()",null);
        if(login&&UrlPolicy.own(url)&&!url.contains("/signin-with-chatgpt")&&!url.contains("/signout-with-chatgpt")){if(authDialog!=null)authDialog.dismiss();web.loadUrl(UrlPolicy.SITE+"/#account");}
      }
      @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame()&&!login)showOffline();}
      @Override public void onReceivedHttpError(WebView v,WebResourceRequest r,WebResourceResponse response){if(r.isForMainFrame()&&response.getStatusCode()>=400&&!login)showOffline();}
      @Override public void onReceivedSslError(WebView v,SslErrorHandler h,SslError e){h.cancel();if(!login)showOffline();}
    });
    view.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams params){
        if(!UrlPolicy.own(v.getUrl())){cb.onReceiveValue(null);return true;}
        if(chooser!=null)chooser.onReceiveValue(null);chooser=cb;
        Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        String[] types=params.getAcceptTypes();if(types.length>0&&types[0]!=null&&types[0].contains("/"))pick.putExtra(Intent.EXTRA_MIME_TYPES,types);
        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
        try{startActivityForResult(pick,PICK);}catch(ActivityNotFoundException e){chooser.onReceiveValue(null);chooser=null;notice("此设备没有可用的文件选择器。");}return true;
      }
      @Override public boolean onJsAlert(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
      @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定",(d,w)->result.confirm()).setNegativeButton("取消",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
      @Override public boolean onJsPrompt(WebView v,String url,String message,String value,JsPromptResult result){EditText input=new EditText(MainActivity.this);input.setText(value);input.setInputType(message.contains("密码")?129:1);new AlertDialog.Builder(MainActivity.this).setMessage(message).setView(input).setPositiveButton("确定",(d,w)->result.confirm(input.getText().toString())).setNegativeButton("取消",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
      @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
      @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback cb){cb.invoke(origin,false,false);}
      @Override public boolean onCreateWindow(WebView opener,boolean dialog,boolean gesture,Message message){
        if(!gesture||!UrlPolicy.own(opener.getUrl()))return false;
        WebView temp=new WebView(MainActivity.this);temp.getSettings().setJavaScriptEnabled(false);
        temp.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){String url=r.getUrl().toString();if(UrlPolicy.blob(url))requestExport(url,null,null);else if(!navigation(web,url,false,true)&&UrlPolicy.own(url))web.loadUrl(url);handler.post(v::destroy);return true;}});
        ((WebView.WebViewTransport)message.obj).setWebView(temp);message.sendToTarget();return true;
      }
    });
    view.setDownloadListener((url,agent,disposition,mime,length)->{
      if(view!=web||!UrlPolicy.own(web.getUrl()))return;
      requestExport(url,mime,URLUtil.guessFileName(url,disposition,mime));
    });
  }
  private boolean navigation(WebView view,String url,boolean login,boolean main){
    if(!main)return !UrlPolicy.https(url);
    if(login)return !UrlPolicy.https(url);
    if(UrlPolicy.own(url)){
      if(Uri.parse(url).getPath().equals("/check-app-update")){updates.check(true);return true;}
      if(url.contains("/signin-with-chatgpt")||url.contains("/signout-with-chatgpt")){startAuth(url);return true;}
      return false;
    }
    if(UrlPolicy.blob(url)){requestExport(url,null,null);return true;}
    if(UrlPolicy.https(url))new AlertDialog.Builder(this).setMessage("在浏览器打开外部网页？\n"+Uri.parse(url).getHost()).setPositiveButton("打开",(d,w)->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(ActivityNotFoundException e){notice("未找到浏览器。");}}).setNegativeButton("取消",null).show();
    return true;
  }
  private void startAuth(String url){
    if(authDialog!=null&&authDialog.isShowing())return;
    authDialog=new Dialog(this);LinearLayout panel=new LinearLayout(this);panel.setOrientation(1);
    TextView tip=new TextView(this);tip.setText("账户登录 · 如第三方登录受限，可返回使用用户名和密码");tip.setPadding(18,14,18,14);panel.addView(tip);
    auth=new WebView(this);configure(auth,true);panel.addView(auth,new LinearLayout.LayoutParams(-1,0,1));
    Button close=new Button(this);close.setText("关闭登录窗口");close.setOnClickListener(v->authDialog.dismiss());panel.addView(close);
    authDialog.setContentView(panel);authDialog.setOnDismissListener(d->{auth.destroy();auth=null;});authDialog.show();authDialog.getWindow().setLayout(-1,-1);auth.loadUrl(url);
  }
  private void makeOffline(){
    offline=new LinearLayout(this);offline.setOrientation(1);offline.setGravity(Gravity.CENTER);offline.setPadding(28,28,28,28);offline.setBackgroundColor(Color.rgb(7,17,30));
    TextView text=new TextView(this);text.setText("✦\n\n静候星河重连\n\n暂时无法连接观星台，请检查网络。\n本机资料不会因断网被清除。");text.setTextColor(Color.rgb(213,187,134));text.setTextSize(19);text.setGravity(Gravity.CENTER);offline.addView(text);
    Button retry=new Button(this);retry.setText("重新连接");retry.setOnClickListener(v->{offline.setVisibility(View.GONE);web.setVisibility(View.VISIBLE);web.loadUrl(UrlPolicy.SITE+"/");});offline.addView(retry);root.addView(offline,new FrameLayout.LayoutParams(-1,-1));offline.setVisibility(View.GONE);
  }
  private void showOffline(){web.setVisibility(View.GONE);offline.setVisibility(View.VISIBLE);}
  private void notice(String message){if(!destroyed)Toast.makeText(this,message,Toast.LENGTH_LONG).show();}
  private void requestExport(String url,String mime,String name){
    if(exporting){notice("请等待当前文件保存完成。");return;}
    if(!UrlPolicy.own(url)&&!UrlPolicy.blob(url))return;
    exporting=true;exportUrl=url;exportMime=ExportPolicy.mime(null,mime);
    if(UrlPolicy.blob(url)){
      if(!UrlPolicy.own(web.getUrl())){exporting=false;return;}
      blobSlot="__gxtExport"+UUID.randomUUID().toString().replace("-","");String slot=JSONObject.quote(blobSlot),address=JSONObject.quote(url);
      web.evaluateJavascript("(()=>{const s=window["+slot+"]={ready:false,name:window.__gxtDownloadNames?.get("+address+")||''};fetch("+address+").then(r=>r.blob()).then(b=>{s.blob=b;s.ready=true}).catch(()=>s.error=true);return true})()",v->probeBlobMetadata(name,0));return;
    }
    openSaveDialog(ExportPolicy.filename(name,exportMime));
  }
  private void openSaveDialog(String name){
    Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(exportMime).putExtra(Intent.EXTRA_TITLE,name);
    try{startActivityForResult(save,SAVE);}catch(ActivityNotFoundException e){if(blobSlot!=null)web.evaluateJavascript("delete window["+JSONObject.quote(blobSlot)+"]",null);blobSlot=null;exporting=false;notice("此设备没有可用的文件保存器。");}
  }
  private void probeBlobMetadata(String suppliedName,int attempt){
    if(destroyed||!UrlPolicy.own(web.getUrl())||attempt>300){finishExport(false);return;}
    web.evaluateJavascript("(()=>{const s=window["+JSONObject.quote(blobSlot)+"];return !s||s.error?{error:true}:s.ready?{ready:true,type:s.blob.type,name:s.name}:{ready:false}})()",value->{try{
      JSONObject data=new JSONObject(value);if(data.optBoolean("error")){finishExport(false);return;}if(!data.optBoolean("ready")){handler.postDelayed(()->probeBlobMetadata(suppliedName,attempt+1),50);return;}
      exportMime=ExportPolicy.mime(data.optString("type"),exportMime);String name=data.optString("name");
      // A generic WebView guess may contain the blob UUID; use a useful MIME-based fallback.
      if(name.isEmpty()&&suppliedName!=null&&!suppliedName.contains(exportUrl.substring(exportUrl.lastIndexOf('/')+1)))name=suppliedName;
      openSaveDialog(ExportPolicy.filename(name,exportMime));
    }catch(Exception e){finishExport(false);}});
  }
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==PICK&&chooser!=null){Uri[] values=null;if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){values=new Uri[data.getClipData().getItemCount()];for(int i=0;i<values.length;i++)values[i]=data.getClipData().getItemAt(i).getUri();}else if(data.getData()!=null)values=new Uri[]{data.getData()};}chooser.onReceiveValue(values);chooser=null;}
    if(request==SAVE){if(result!=RESULT_OK||data==null||data.getData()==null){if(blobSlot!=null)web.evaluateJavascript("delete window["+JSONObject.quote(blobSlot)+"]",null);blobSlot=null;exporting=false;return;}Uri destination=data.getData();
      progress=new ProgressDialog(this);progress.setMessage("正在保存文件…");progress.setCancelable(false);progress.show();
      if(UrlPolicy.blob(exportUrl))saveBlob(destination);else saveNetwork(destination);
    }
  }
  private void saveNetwork(Uri destination){
    final String address=exportUrl,cookie=CookieManager.getInstance().getCookie(exportUrl),agent=web.getSettings().getUserAgentString();
    new Thread(()->{boolean success=false;try{
      String current=address;HttpURLConnection conn=null;
      for(int i=0;i<6;i++){
        if(!UrlPolicy.own(current))throw new IOException("External redirect blocked");
        conn=(HttpURLConnection)new URL(current).openConnection();conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(20000);conn.setReadTimeout(30000);conn.setRequestProperty("User-Agent",agent);if(cookie!=null)conn.setRequestProperty("Cookie",cookie);
        int status=conn.getResponseCode();if(status>=300&&status<400){String next=conn.getHeaderField("Location");conn.disconnect();if(next==null)throw new IOException();current=new URL(new URL(current),next).toString();continue;}
        if(status!=200)throw new IOException("Download failed");break;
      }
      if(conn==null||conn.getResponseCode()!=200)throw new IOException();
      try(InputStream in=conn.getInputStream();OutputStream out=getContentResolver().openOutputStream(destination,"wt")){byte[] bytes=new byte[65536];int count;while((count=in.read(bytes))!=-1)out.write(bytes,0,count);}finally{conn.disconnect();}success=true;
    }catch(Exception e){}final boolean ok=success;handler.post(()->finishExport(ok));},"observatory-download").start();
  }
  private void saveBlob(Uri destination){
    if(!UrlPolicy.own(web.getUrl())){finishExport(false);return;}
    try{exportStream=getContentResolver().openOutputStream(destination,"wt");}catch(Exception e){finishExport(false);return;}
    if(blobSlot!=null){pollBlob(0,0);return;}
    blobSlot="__gxtExport"+UUID.randomUUID().toString().replace("-","");
    String slot=JSONObject.quote(blobSlot),url=JSONObject.quote(exportUrl);
    // No JavascriptInterface is exposed. Only a user-requested export is read in bounded chunks.
    web.evaluateJavascript("(()=>{const s=window["+slot+"]={ready:false};fetch("+url+").then(r=>r.blob()).then(b=>{s.blob=b;s.ready=true}).catch(()=>s.error=true);return true})()",v->pollBlob(0,0));
  }
  private void pollBlob(int offset,int attempts){
    if(destroyed||!UrlPolicy.own(web.getUrl())||attempts>300){finishExport(false);return;}
    String key=JSONObject.quote(blobSlot);
    String script="(()=>{const s=window["+key+"];if(!s||s.error)return 'error';if(s.chunk!==undefined){const v=s.chunk;delete s.chunk;s.busy=false;return v}if(!s.ready||s.busy)return 'wait';if("+offset+">=s.blob.size)return 'done';s.busy=true;const r=new FileReader();r.onload=()=>s.chunk=String(r.result).split(',')[1];r.onerror=()=>s.error=true;r.readAsDataURL(s.blob.slice("+offset+","+(offset+196608)+"));return 'wait'})()";
    web.evaluateJavascript(script,value->{try{
      String data=(String)new JSONTokener(value).nextValue();
      if("wait".equals(data)){handler.postDelayed(()->pollBlob(offset,attempts+1),50);return;}
      if("done".equals(data)){finishExport(true);return;}if("error".equals(data)){finishExport(false);return;}
      byte[] bytes=Base64.decode(data,Base64.DEFAULT);exportStream.write(bytes);handler.post(()->pollBlob(offset+bytes.length,0));
    }catch(Exception e){finishExport(false);}});
  }
  private void finishExport(boolean ok){
    try{if(exportStream!=null)exportStream.close();}catch(Exception e){ok=false;}exportStream=null;
    if(blobSlot!=null&&!destroyed)web.evaluateJavascript("delete window["+JSONObject.quote(blobSlot)+"]",null);blobSlot=null;
    exporting=false;if(progress!=null){progress.dismiss();progress=null;}notice(ok?"文件已保存到所选位置。":"保存未完成，请删除不完整文件后重试。");
  }
  @Override public void onBackPressed(){if(authDialog!=null&&authDialog.isShowing()){authDialog.dismiss();return;}if(web.canGoBack()&&offline.getVisibility()!=View.VISIBLE)web.goBack();else new AlertDialog.Builder(this).setMessage("退出观星台？本机资料会保留。").setPositiveButton("退出",(d,w)->finish()).setNegativeButton("取消",null).show();}
  @Override protected void onSaveInstanceState(Bundle state){web.saveState(state);super.onSaveInstanceState(state);}
  @Override protected void onPause(){CookieManager.getInstance().flush();web.onPause();super.onPause();}
  @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();if(updates!=null)updates.resume();}
  @Override protected void onDestroy(){destroyed=true;if(updates!=null)updates.close();handler.removeCallbacksAndMessages(null);if(chooser!=null)chooser.onReceiveValue(null);try{if(exportStream!=null)exportStream.close();}catch(Exception e){}if(authDialog!=null)authDialog.dismiss();if(progress!=null)progress.dismiss();web.destroy();super.onDestroy();}
}
