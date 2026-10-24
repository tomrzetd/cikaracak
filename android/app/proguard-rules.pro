# Pertahankan metode jembatan JavaScript (dipanggil lewat refleksi oleh WebView).
-keepclassmembers class id.pendampingkuis.Jembatan {
    @android.webkit.JavascriptInterface <methods>;
}
