import site.guanxingtai.android.UpdatePolicy;
public class UpdatePolicyTest {
  static void check(boolean value){if(!value)throw new AssertionError();}
  public static void main(String[] args){
    String hash="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    check(UpdatePolicy.valid("1.0.1",2,100,hash,"/downloads/GuanXingTai-1.0.1.apk"));
    check(!UpdatePolicy.valid("1.0.1",0,100,hash,"/downloads/GuanXingTai-1.0.1.apk"));
    check(!UpdatePolicy.valid("1.0.1",2,0,hash,"/downloads/GuanXingTai-1.0.1.apk"));
    check(!UpdatePolicy.valid("1.0.1",2,100,"bad","/downloads/GuanXingTai-1.0.1.apk"));
    check(!UpdatePolicy.valid("1.0.1",2,100,hash,"https://evil.test/app.apk"));
    check(!UpdatePolicy.valid("1.0.1",2,100,hash,"/downloads/GuanXingTai-2.0.0.apk"));
    boolean rejected=false;try{UpdatePolicy.address("/downloads/../secret");}catch(IllegalArgumentException e){rejected=true;}check(rejected);
    System.out.println("PASS: 7 Android update metadata checks");
  }
}
