package site.guanxingtai.android;
import java.net.URI;
public final class UpdatePolicy {
  public static boolean valid(String version,long code,long size,String hash,String url){
    return version!=null&&version.matches("[0-9]{1,6}\\.[0-9]{1,6}\\.[0-9]{1,6}")&&code>0&&code<Integer.MAX_VALUE&&size>0&&size<=150*1024*1024L&&hash!=null&&hash.matches("[a-f0-9]{64}")&&("/downloads/GuanXingTai-"+version+".apk").equals(url);
  }
  public static String address(String relative){
    if(relative==null||!relative.matches("/downloads/GuanXingTai-[0-9]{1,6}\\.[0-9]{1,6}\\.[0-9]{1,6}\\.apk"))throw new IllegalArgumentException();
    return UrlPolicy.SITE+relative;
  }
}
