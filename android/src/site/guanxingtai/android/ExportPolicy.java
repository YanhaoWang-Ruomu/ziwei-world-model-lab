package site.guanxingtai.android;

final class ExportPolicy {
  static String mime(String detected,String supplied){
    String candidate=detected==null||detected.isEmpty()?supplied:detected;
    return candidate!=null&&candidate.matches("[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+")?candidate:"application/octet-stream";
  }
  static String filename(String supplied,String mime){
    if(supplied!=null&&!supplied.trim().isEmpty())return UrlPolicy.filename(supplied);
    String suffix="application/json".equals(mime)?".json":"application/pdf".equals(mime)?".pdf":"text/plain".equals(mime)?".txt":"text/csv".equals(mime)?".csv":"image/png".equals(mime)?".png":"image/jpeg".equals(mime)?".jpg":"application/zip".equals(mime)?".zip":".bin";
    return "观星台文件"+suffix;
  }
}
