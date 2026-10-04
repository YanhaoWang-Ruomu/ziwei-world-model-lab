package site.guanxingtai.android;
import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

// Only the verified update APK can be read through a temporary URI grant.
public class UpdateProvider extends ContentProvider {
  public static final String AUTHORITY="site.guanxingtai.android.updates";
  public static final Uri URI=Uri.parse("content://"+AUTHORITY+"/update.apk");
  private File file(Uri uri) throws FileNotFoundException {
    if(!URI.equals(uri))throw new FileNotFoundException();
    return new File(getContext().getCacheDir(),"update.apk");
  }
  @Override public boolean onCreate(){return true;}
  @Override public String getType(Uri uri){return URI.equals(uri)?"application/vnd.android.package-archive":null;}
  @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{
    if(!"r".equals(mode))throw new FileNotFoundException();
    return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);
  }
  @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
    try{File apk=file(uri);String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor result=new MatrixCursor(columns);Object[] row=new Object[columns.length];for(int i=0;i<columns.length;i++)row[i]=OpenableColumns.DISPLAY_NAME.equals(columns[i])?"GuanXingTai-update.apk":OpenableColumns.SIZE.equals(columns[i])?apk.length():null;result.addRow(row);return result;}catch(FileNotFoundException e){return null;}
  }
  @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
  @Override public int update(Uri uri,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
  @Override public int delete(Uri uri,String s,String[] a){throw new UnsupportedOperationException();}
}
