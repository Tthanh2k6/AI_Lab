package ai.arena.android

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var txtChecks: TextView
    private lateinit var txtStatus: TextView
    private val ui = Handler(Looper.getMainLooper())

    private val requestNotification = registerForActivityResult(ActivityResultContracts.RequestPermission()) { refreshChecks() }

    private val requestProjection = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val intent = Intent(this, AgentService::class.java)
                .setAction(AgentService.ACTION_START)
                .putExtra(AgentService.EXTRA_RESULT_CODE, result.resultCode)
                .putExtra(AgentService.EXTRA_RESULT_DATA, result.data)
            ContextCompat.startForegroundService(this, intent)
            Toast.makeText(this, "Đã bắt đầu — mở game Flappy Bird lên", Toast.LENGTH_LONG).show()
        } else {
            Toast.makeText(this, "Bạn chưa cho phép chụp màn hình", Toast.LENGTH_SHORT).show()
        }
    }

    private val poll = object : Runnable {
        override fun run() {
            refreshChecks()
            txtStatus.text = if (AgentStatus.running) {
                "ĐANG CHẠY · khung ${AgentStatus.frames} · tap ${AgentStatus.taps}\n${AgentStatus.text}" +
                    (if (AgentStatus.lastError.isNotEmpty()) "\nLỗi: ${AgentStatus.lastError}" else "")
            } else {
                getString(R.string.status_idle) + (if (AgentStatus.lastError.isNotEmpty()) "\nLỗi: ${AgentStatus.lastError}" else "")
            }
            ui.postDelayed(this, 500)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        txtChecks = findViewById(R.id.txtChecks)
        txtStatus = findViewById(R.id.txtStatus)

        findViewById<Button>(R.id.btnAccessibility).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        findViewById<Button>(R.id.btnNotification).setOnClickListener {
            requestNotification.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        findViewById<Button>(R.id.btnStart).setOnClickListener {
            if (TapAccessibilityService.instance == null) {
                Toast.makeText(this, "Bật dịch vụ Trợ năng trước (bước 1)", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            val mpm = getSystemService(MediaProjectionManager::class.java)
            requestProjection.launch(mpm.createScreenCaptureIntent())
        }
        findViewById<Button>(R.id.btnStop).setOnClickListener {
            startService(Intent(this, AgentService::class.java).setAction(AgentService.ACTION_STOP))
        }
    }

    override fun onResume() { super.onResume(); ui.post(poll) }
    override fun onPause() { super.onPause(); ui.removeCallbacks(poll) }

    private fun refreshChecks() {
        val acc = TapAccessibilityService.instance != null
        val notif = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        txtChecks.text = buildString {
            append(if (acc) "✓" else "✗").append(" Trợ năng: ").append(if (acc) "đã bật" else "chưa bật").append('\n')
            append(if (notif) "✓" else "✗").append(" Thông báo: ").append(if (notif) "đã cấp" else "chưa cấp")
        }
    }
}
