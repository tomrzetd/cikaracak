package id.cikaracak

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

/**
 * Fungsi native yang dipanggil aplikasi web lewat window.AndroidJembatan.
 * Dipakai oleh web/js/util.js (unduh, salin) dan web/js/views/cetak.js (cetak).
 * Semua metode dipanggil dari thread JavaScript, jadi pekerjaan UI dipindah ke thread utama.
 */
class Jembatan(private val aktivitas: AppCompatActivity, private val web: WebView) {

    private var isiTertunda: ByteArray? = null

    private val simpanDokumen = aktivitas.registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val isi = isiTertunda; isiTertunda = null
        if (uri == null || isi == null) return@registerForActivityResult
        try {
            aktivitas.contentResolver.openOutputStream(uri)?.use { it.write(isi) }
            Toast.makeText(aktivitas, R.string.file_tersimpan, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(aktivitas, aktivitas.getString(R.string.file_gagal, e.message), Toast.LENGTH_LONG).show()
        }
    }

    /** Simpan file yang dibuat aplikasi web (CSV riwayat, cadangan JSON). Guru memilih lokasinya. */
    @JavascriptInterface
    fun simpanFile(namaFile: String, base64: String) {
        val isi = Base64.decode(base64, Base64.DEFAULT)
        aktivitas.runOnUiThread {
            isiTertunda = isi
            simpanDokumen.launch(namaFile)
        }
    }

    /** Cetak isi #cetak (LJK) lewat layanan cetak Android: ke printer atau simpan sebagai PDF. */
    @JavascriptInterface
    fun cetak(judul: String) {
        aktivitas.runOnUiThread {
            val pm = aktivitas.getSystemService(Context.PRINT_SERVICE) as PrintManager
            val atribut = PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build()
            pm.print(judul, web.createPrintDocumentAdapter(judul), atribut)
        }
    }

    /** Salin teks (ringkasan WhatsApp) ke papan klip. */
    @JavascriptInterface
    fun salin(teks: String): Boolean {
        aktivitas.runOnUiThread {
            val cm = aktivitas.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("Cikaracak", teks))
        }
        return true
    }

    @JavascriptInterface
    fun versi(): String = BuildConfig.VERSION_NAME
}
