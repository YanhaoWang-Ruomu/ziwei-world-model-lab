package site.guanxingtai.android;
import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.widget.Toast;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.Arrays;
import org.json.*;

public final class AppUpdates {
  private final Activity activity;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private volatile boolean closed=false,busy=false;
  private boolean awaitingPermission=false;
  private ProgressDialog progress;
  private JSONObject pending;
  public AppUpdates(Activity activity){this.activity=activity;}
  private boolean alive(){return !closed&&!activity.isFinishing()&&!activity.isDestroyed();}
  private void ui(Runnable task){handler.post(()->{if(alive())task.run();});}
  private void notice(String message){if(alive())Toast.makeText(activity,message,Toast.LENGTH_LONG).show();}
  private PackageInfo installed()throws Exception{return activity.getPackageManager().getPackageInfo(activity.getPackageName(),Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES);}
  private long code(PackageInfo info){return Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode;}
  private HttpURLConnection connection(String url)throws Exception{
    if(!UrlPolicy.own(url))throw new IOException();
    HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(25000);c.setRequestProperty("Cache-Control","no-cache");
    if(c.getResponseCode()!=200){c.disconnect();throw new IOException();}return c;
  }
  public void check(boolean manual){
    if(busy||!alive())return;busy=true;
    new Thread(()->{try{
      HttpURLConnection c=connection(UrlPolicy.SITE+"/downloads-manifest.json?t="+System.currentTimeMillis());
      ByteArrayOutputStream data=new ByteArrayOutputStream();
      try(InputStream in=c.getInputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(data.size()+n>65536)throw new IOException();data.write(b,0,n);}}finally{c.disconnect();}
      JSONObject release=new JSONObject(data.toString("UTF-8")).getJSONObject("android");
      if(!valid(release))throw new IOException();
      if(release.getLong("versionCode")<=code(installed())){busy=false;if(manual)ui(()->notice("已是最新版本。"));return;}
      ui(()->{new AlertDialog.Builder(activity).setTitle("发现新版本 "+release.optString("version"))
        .setMessage(release.optString("notes","改进功能与使用体验。")+"\n\n下载完成后由系统确认安装，账户与本机资料会保留。")
        .setPositiveButton("下载更新",(d,w)->download(release)).setNegativeButton("稍后",(d,w)->busy=false).setOnCancelListener(d->busy=false).show();});
    }catch(Exception e){busy=false;if(manual)ui(()->notice("暂时无法检查更新，请检查网络后重试。"));}},"observatory-update-check").start();
  }
  private boolean valid(JSONObject r){return UpdatePolicy.valid(r.optString("version"),r.optLong("versionCode"),r.optLong("size"),r.optString("sha256"),r.optString("url"));}
  private String hex(byte[] bytes){StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format("%02x",b&255));return s.toString();}
  private void download(JSONObject release){
    progress=new ProgressDialog(activity);progress.setTitle("正在下载更新");progress.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);progress.setMax(100);progress.setCancelable(false);progress.show();
    new Thread(()->{File partial=new File(activity.getCacheDir(),"update.apk.part");try{
      long expected=release.getLong("size"),total=0;MessageDigest digest=MessageDigest.getInstance("SHA-256");HttpURLConnection c=connection(UpdatePolicy.address(release.getString("url")));
      int previous=-1;
      try(InputStream in=c.getInputStream();OutputStream out=new FileOutputStream(partial)){byte[] bytes=new byte[65536];int n;while((n=in.read(bytes))!=-1){if(closed)throw new IOException();total+=n;if(total>expected)throw new IOException();out.write(bytes,0,n);digest.update(bytes,0,n);final int percent=(int)(100*total/expected);if(percent!=previous){previous=percent;ui(()->{if(progress!=null)progress.setProgress(percent);});}}}finally{c.disconnect();}
      if(total!=expected||!hex(digest.digest()).equals(release.getString("sha256")))throw new IOException();
      verifyPackage(partial,release);
      File target=new File(activity.getCacheDir(),"update.apk");if(target.exists()&&!target.delete())throw new IOException();if(!partial.renameTo(target))throw new IOException();
      pending=release;ui(()->{dismissProgress();busy=false;new AlertDialog.Builder(activity).setTitle("更新已准备好").setMessage("现在打开系统安装页面？请先保存未提交的内容。").setPositiveButton("安装更新",(d,w)->install()).setNegativeButton("稍后",null).show();});
    }catch(Exception e){partial.delete();busy=false;ui(()->{dismissProgress();notice("更新下载或校验未完成，请重试。原软件和资料不受影响。");});}},"observatory-update-download").start();
  }
  private byte[][] certificates(PackageInfo info){
    android.content.pm.Signature[] signatures=Build.VERSION.SDK_INT>=28?(info.signingInfo==null?null:info.signingInfo.getApkContentsSigners()):info.signatures;
    if(signatures==null)return new byte[0][];byte[][] result=new byte[signatures.length][];for(int i=0;i<result.length;i++)result[i]=signatures[i].toByteArray();return result;
  }
  private void verifyPackage(File apk,JSONObject release)throws Exception{
    PackageInfo candidate=activity.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(),Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES);
    PackageInfo current=installed();
    if(candidate==null||!activity.getPackageName().equals(candidate.packageName)||code(candidate)!=release.getLong("versionCode")||code(candidate)<=code(current)||!release.getString("version").equals(candidate.versionName))throw new IOException();
    byte[][] a=certificates(current),b=certificates(candidate);if(a.length!=1||b.length!=1||!Arrays.equals(a[0],b[0]))throw new IOException();
  }
  private void install(){
    if(pending==null||!alive())return;
    try{
      verifyPackage(new File(activity.getCacheDir(),"update.apk"),pending);
      if(!activity.getPackageManager().canRequestPackageInstalls()){
        new AlertDialog.Builder(activity).setTitle("允许观星台安装更新").setMessage("请在系统设置中允许此来源安装应用，然后返回继续安装。")
          .setPositiveButton("前往设置",(d,w)->{try{awaitingPermission=true;activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));}catch(Exception e){awaitingPermission=false;notice("请从系统设置允许观星台安装应用。");}}).setNegativeButton("取消",null).show();return;
      }
      Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(UpdateProvider.URI,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      intent.setClipData(ClipData.newRawUri("观星台更新",UpdateProvider.URI));activity.startActivity(intent);
    }catch(Exception e){notice("暂时无法打开安装程序，请从官网下载更新。");}
  }
  public void resume(){if(awaitingPermission){awaitingPermission=false;if(activity.getPackageManager().canRequestPackageInstalls())install();else notice("尚未允许安装更新，可稍后重试。");}}
  private void dismissProgress(){if(progress!=null){progress.dismiss();progress=null;}}
  public void close(){closed=true;handler.removeCallbacksAndMessages(null);dismissProgress();}
}
