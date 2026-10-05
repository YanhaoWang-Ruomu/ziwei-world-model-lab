package site.guanxingtai.android;
public final class ExportPolicyTest {
  static void check(boolean value){if(!value)throw new AssertionError("Export metadata contract failed");}
  public static void main(String[] args){
    check("application/json".equals(ExportPolicy.mime("application/json","application/pdf")));
    check(ExportPolicy.filename(null,"application/json").endsWith(".json"));
    check(ExportPolicy.filename(null,"image/png").endsWith(".png"));
    check("我的命例.json".equals(ExportPolicy.filename("我的命例.json","application/json")));
    check("application/octet-stream".equals(ExportPolicy.mime("text/plain\r\nX:bad",null)));
    check(!ExportPolicy.filename("../bad.json","application/json").contains("/"));
    System.out.println("Android export metadata checks passed");
  }
}
