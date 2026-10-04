package site.guanxingtai.android;
import java.net.URI;
public final class UrlPolicy {
  public static final String SITE="https://ziwei-world-model-lab.vocal-chime-3672.chatgpt.site";
  public static boolean own(String url) {
    try { URI u=URI.create(url);return "https".equals(u.getScheme()) && "ziwei-world-model-lab.vocal-chime-3672.chatgpt.site".equals(u.getHost()) && (u.getPort()==-1||u.getPort()==443) && u.getUserInfo()==null; } catch(Exception e){return false;}
  }
  public static boolean https(String url) {
    try {URI u=URI.create(url);return "https".equals(u.getScheme())&&u.getHost()!=null&&u.getUserInfo()==null;}catch(Exception e){return false;}
  }
  public static boolean blob(String url){return url!=null&&url.startsWith("blob:")&&own(url.substring(5));}
  public static String filename(String name){
    String s=(name==null?"观星台导出文件":name).replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_");
    return s.isEmpty()?"观星台导出文件":s.substring(0,Math.min(s.length(),140));
  }
}
