package id.cikaracak

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Base64
import android.graphics.BitmapFactory
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode
import org.json.JSONObject
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

    /**
     * OCR sampul buku dari input kamera HP (FileChooser memanggil kamera sistem).
     * Hanya JPEG <= 4.5MB dalam base64. Model ML Kit bekerja di perangkat.
     * Tidak menyimpan foto / NISN / metadata ke server.
     */
    @JavascriptInterface
    fun ocrBuku(id: String, fotoBase64: String) {
        prosesGambar(id, fotoBase64, "cikaracak:ocr") { img, selesai ->
            val client = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            client.process(img).addOnSuccessListener { selesai(it.text, null) }
                .addOnFailureListener { selesai(null, it.message ?: "Gagal mengenali teks") }
                .addOnCompleteListener { client.close() }
        }
    }

    /** Baca Code39/QR/EAN dari foto label buku menggunakan ML Kit offline. */
    @JavascriptInterface
    fun pindaiKodeBuku(id: String, fotoBase64: String) {
        prosesGambar(id, fotoBase64, "cikaracak:barcode") { img, selesai ->
            val options = BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_CODE_39, Barcode.FORMAT_QR_CODE, Barcode.FORMAT_EAN_13)
                .build()
            val client = BarcodeScanning.getClient(options)
            client.process(img)
                .addOnSuccessListener { codes -> selesai(codes.firstOrNull()?.rawValue ?: "", null) }
                .addOnFailureListener { selesai(null, it.message ?: "Barcode tidak terbaca") }
                .addOnCompleteListener { client.close() }
        }
    }

    private fun prosesGambar(
        id: String, base64: String, event: String,
        jalankan: (InputImage, (String?, String?) -> Unit) -> Unit
    ) {
        if (!id.matches(Regex("^[a-z0-9-]{5,100}$")) || base64.length > 4_500_000) {
            kirimHasil(event, id, null, "Gambar terlalu besar atau ID tidak sah")
            return
        }
        Thread {
            try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    ?: throw IllegalArgumentException("Foto tidak dapat dibaca")
                val img = InputImage.fromBitmap(bitmap, 0)
                jalankan(img) { hasil, error ->
                    kirimHasil(event, id, hasil, error)
                    bitmap.recycle()
                }
            } catch (e: Exception) {
                kirimHasil(event, id, null, e.message ?: "Gagal membaca gambar")
            }
        }.start()
    }

    private fun kirimHasil(event: String, id: String, teks: String?, galat: String?) {
        val detail = JSONObject().put("id", id).put("text", teks ?: "").put("error", galat ?: JSONObject.NULL)
        aktivitas.runOnUiThread {
            web.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('" + event + "',{detail:" + detail.toString() + "}));",
                null
            )
        }
    }

    @JavascriptInterface
    fun versi(): String = BuildConfig.VERSION_NAME
}
