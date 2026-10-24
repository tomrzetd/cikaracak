# Pertahankan metode jembatan JavaScript (dipanggil lewat refleksi oleh WebView).
-keepclassmembers class id.cikaracak.Jembatan {
    @android.webkit.JavascriptInterface <methods>;
}
