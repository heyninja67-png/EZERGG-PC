package com.nevoz.setup

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.concurrent.Executors

object NevozApi {
    private val executor = Executors.newSingleThreadExecutor()

    private fun credentials(context: Context): Pair<String, String>? {
        val prefs = context.getSharedPreferences("nevoz_settings", Context.MODE_PRIVATE)
        val base = prefs.getString("api_base_url", "")?.trim().orEmpty().trimEnd('/')
        val token = prefs.getString("api_token", "")?.trim().orEmpty()
        if (base.isBlank() || !base.startsWith("https://", ignoreCase = true) || token.length < 32) {
            return null
        }
        return base to token
    }

    fun pullPcs(context: Context, db: PcDatabase, complete: (Boolean) -> Unit) {
        val (base, token) = credentials(context) ?: run {
            complete(false)
            return
        }
        executor.execute {
            var success = false
            var conn: HttpURLConnection? = null
            try {
                conn = (URL("$base/api/pcs").openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 8000
                    readTimeout = 8000
                    setRequestProperty("Authorization", "Bearer $token")
                }
                if (conn.responseCode in 200..299) {
                    val payload = conn.inputStream.bufferedReader().use { it.readText() }
                    val array = JSONArray(payload)
                    for (i in 0 until array.length()) {
                        val item = array.getJSONObject(i)
                        val updated = try {
                            Instant.parse(item.optString("updated_at")).toEpochMilli()
                        } catch (_: Exception) {
                            System.currentTimeMillis()
                        }
                        db.upsertRemotePc(
                            CloudPc(
                                id = item.getString("id"),
                                name = item.getString("name"),
                                os = item.getString("os"),
                                ramGb = item.getInt("ram_gb"),
                                storageGb = item.getInt("storage_gb"),
                                gpu = item.optString("gpu", "Sem GPU"),
                                volumeId = item.getString("volume_id"),
                                status = item.optString("vm_status", "profile_saved"),
                                progressNote = item.optString("progress_note", ""),
                                updatedAt = updated
                            )
                        )
                    }
                    success = true
                }
            } catch (_: Exception) {
                // Offline: never delete or overwrite the local SQLite copy.
            } finally {
                conn?.disconnect()
                complete(success)
            }
        }
    }

    fun syncPc(context: Context, pc: CloudPc) {
        val (base, token) = credentials(context) ?: return
        val body = JSONObject().apply {
            put("id", pc.id)
            put("name", pc.name)
            put("os", pc.os)
            put("ram_gb", pc.ramGb)
            put("storage_gb", pc.storageGb)
            put("gpu", pc.gpu)
            put("volume_id", pc.volumeId)
            put("progress_note", pc.progressNote)
        }
        request("$base/api/pcs/sync", token, body)
    }

    fun saveCheckpoint(context: Context, pc: CloudPc, note: String) {
        val (base, token) = credentials(context) ?: return
        val body = JSONObject().apply {
            put("note", note)
            put("source", "android-app")
        }
        request("$base/api/pcs/${pc.id}/checkpoints", token, body)
    }

    private fun request(endpoint: String, token: String, body: JSONObject) {
        executor.execute {
            var conn: HttpURLConnection? = null
            try {
                conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 8000
                    readTimeout = 8000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Authorization", "Bearer $token")
                    outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                    responseCode
                }
            } catch (_: Exception) {
                // Offline mode: local SQLite remains the source of truth.
            } finally {
                conn?.disconnect()
            }
        }
    }
}
