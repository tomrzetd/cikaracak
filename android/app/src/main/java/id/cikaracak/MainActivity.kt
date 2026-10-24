package id.cikaracak

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * Aplikasi Android Cikaracak.
 * Membuka aplikasi web dari aset APK (folder web/ disalin saat build) lewat
 * https://appassets.androidplatform.net/assets/web/ sehingga IndexedDB dan modul JavaScript berfungsi,
 * lalu menambahkan hal yang tidak didukung WebView bawaan: memilih/memotret file, menyimpan file, mencetak.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var jembatan: Jembatan
    private var callbackFile: ValueCallback<Array<Uri>>? = null
    private var uriFotoKamera: Uri? = null

    private val pilihFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { hasil ->
        val cb = callbackFile ?: return@registerForActivityResult
        callbackFile = null
        val data = hasil.data
        val uris: Array<Uri>? = when {
            hasil.resultCode != RESULT_OK -> null
            data?.clipData != null -> Array(data.clipData!!.itemCount) { data.clipData!!.getItemAt(it).uri }
            data?.data != null -> arrayOf(data.data!!)
            uriFotoKamera != null && fotoKameraAda() -> arrayOf(uriFotoKamera!!)
            else -> null
        }
        cb.onReceiveValue(uris)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web = WebView(this)
        setContentView(web)

        val pemuat = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true            // IndexedDB & localStorage
            allowFileAccess = false
            allowContentAccess = true           // untuk content:// dari pemilih file
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_NO_CACHE
            setSupportZoom(false)
        }

        jembatan = Jembatan(this, web)
        web.addJavascriptInterface(jembatan, "AndroidJembatan")

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                pemuat.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == HOST) return false
                // Tautan luar (mis. GitHub) dibuka di browser, bukan di dalam aplikasi
                try { startActivity(Intent(Intent.ACTION_VIEW, url)) } catch (_: ActivityNotFoundException) { }
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                callbackFile?.onReceiveValue(null)
                callbackFile = cb
                val terima = params.acceptTypes.joinToString(",").ifBlank { "*/*" }
                val gambar = terima.contains("image")
                val pilih = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = if (gambar) "image/*" else "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                }
                val tambahan = mutableListOf<Intent>()
                uriFotoKamera = null
                if (gambar) {
                    // Tawarkan kamera langsung (dipakai untuk memotret LJK dan foto siswa)
                    val berkas = File(cacheDir, "kamera").apply { mkdirs() }.let { File(it, "foto-${System.currentTimeMillis()}.jpg") }
                    uriFotoKamera = FileProvider.getUriForFile(this@MainActivity, "$packageName.foto", berkas)
                    val kamera = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                        putExtra(MediaStore.EXTRA_OUTPUT, uriFotoKamera)
                        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    if (kamera.resolveActivity(packageManager) != null) tambahan += kamera
                }
                // Atribut capture di <input> berarti "langsung kamera"
                val langsungKamera = params.isCaptureEnabled && tambahan.isNotEmpty()
                val intent = if (langsungKamera) tambahan.first() else Intent.createChooser(pilih, getString(R.string.pilih_file)).apply {
                    if (tambahan.isNotEmpty()) putExtra(Intent.EXTRA_INITIAL_INTENTS, tambahan.toTypedArray())
                }
                return try { pilihFile.launch(intent); true } catch (_: ActivityNotFoundException) {
                    callbackFile = null; false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Tutup jendela yang sedang terbuka di aplikasi web dulu; bila tidak ada, keluar.
                web.evaluateJavascript("(function(){var l=document.getElementById('lapis');if(l&&!l.hidden){l.click();return 1}return 0})()") { r ->
                    if (r != "1") { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
                }
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl("https://$HOST/assets/web/index.html")
    }

    private fun fotoKameraAda(): Boolean = try {
        contentResolver.openInputStream(uriFotoKamera!!)?.use { it.read() != -1 } ?: false
    } catch (_: Exception) { false }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        File(cacheDir, "kamera").listFiles()?.forEach { it.delete() } // foto LJK tidak disimpan
        web.destroy()
        super.onDestroy()
    }

    companion object { const val HOST = "appassets.androidplatform.net" }
}
