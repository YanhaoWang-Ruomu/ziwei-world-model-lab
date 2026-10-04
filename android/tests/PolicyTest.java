import site.guanxingtai.android.UrlPolicy;
public class PolicyTest {
  private static void check(boolean result){if(!result)throw new AssertionError();}
  public static void main(String[] args){
    check(UrlPolicy.own(UrlPolicy.SITE+"/#account"));
    check(!UrlPolicy.own(UrlPolicy.SITE+".evil.test"));
    check(!UrlPolicy.own("http://ziwei-world-model-lab.vocal-chime-3672.chatgpt.site"));
    check(!UrlPolicy.own("https://user@ziwei-world-model-lab.vocal-chime-3672.chatgpt.site"));
    check(!UrlPolicy.own("file:///etc/passwd"));
    check(!UrlPolicy.https("javascript:alert(1)"));
    check(!UrlPolicy.https("intent://unsafe"));
    check(UrlPolicy.blob("blob:"+UrlPolicy.SITE+"/fictional"));
    check(!UrlPolicy.blob("blob:https://other.test/fictional"));
    check(UrlPolicy.filename("../../fictional.json").equals(".._.._fictional.json"));
    System.out.println("PASS: 10 Android navigation and export policy checks");
  }
}
