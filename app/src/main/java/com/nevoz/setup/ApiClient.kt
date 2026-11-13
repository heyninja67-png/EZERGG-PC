package com.nevoz.setup

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class AppPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("nevoz_device", Context.MODE_PRIVATE)
    var baseUrl: String
        get() = prefs.getString("base_url", "") ?: ""
        set(value) { prefs.edit().putString("base_url", value.trim().trimEnd('/')).apply() }
    var deviceToken: String
        get() = prefs.getString("device_token", "") ?: ""
        set(value) { prefs.edit().putString("device_token", value).apply() }
    fun clearToken() { prefs.edit().remove("device_token").apply() }
}

data class GpuOption(val id: String, val label: String)
data class Catalog(
    val os: List<Pair<String, String>>,
    val cpu: List<Int>,
    val ram: List<Int>,
    val disk: List<Int>,
    val gpus: List<GpuOption>,
    val providerReady: Boolean,
    val providerMessage: String
)
data class CloudMachine(
    val id: String,
    val name: String,
    val os: String,
    val cpu: Int,
    val ram: Int,
    val disk: Int,
    val gpu: String,
    val state: String,
    val connectionUrl: String,
    val errorMessage: String,
    val providerReady: Boolean
)

class NevozApi(private val baseUrl: String, private val token: String) {
    private suspend fun request(path: String, method: String = "GET", body: JSONObject? = null, auth: Boolean = true): JSONObject =
        withContext(Dispatchers.IO) {
            val cleanBase = baseUrl.trim().trimEnd('/')
            require(cleanBase.startsWith("https://", ignoreCase = true)) { "Use uma URL HTTPS para proteger a conexão." }
            val connection = (URL(cleanBase + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 15000
                readTimeout = 120000
                setRequestProperty("Accept", "application/json")
                if (auth && token.isNotBlank()) setRequestProperty("Authorization", "Bearer $token")
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                }
            }
            try {
                if (body != null) connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val code = connection.responseCode
                val stream = if (code in 200..299) connection.inputStream else connection.errorStream
                val raw = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
                val json = if (raw.isBlank()) JSONObject() else JSONObject(raw)
                if (code !in 200..299) throw IllegalStateException(json.optString("error", "Erro HTTP $code"))
                json
            } finally { connection.disconnect() }
        }

    suspend fun pair(pairingCode: String, deviceName: String): String {
        val result = request("/api/pair", "POST", JSONObject()
            .put("pairingCode", pairingCode)
            .put("deviceName", deviceName), auth = false)
        return result.getString("token")
    }

    suspend fun catalog(): Catalog {
        val j = request("/api/catalog", auth = false)
        fun ints(key: String) = j.optJSONArray(key).toIntList()
        val osArray = j.optJSONArray("operatingSystems") ?: JSONArray()
        val os = (0 until osArray.length()).map { i ->
            val item = osArray.getJSONObject(i)
            item.optString("id") to item.optString("label")
        }
        val gpuArray = j.optJSONArray("gpuProfiles") ?: JSONArray()
        val gpus = (0 until gpuArray.length()).map { i ->
            val item = gpuArray.getJSONObject(i)
            GpuOption(item.optString("id"), item.optString("label"))
        }
        val provider = j.optJSONObject("provider") ?: JSONObject()
        return Catalog(os, ints("cpuCores"), ints("ramGb"), ints("diskGb"), gpus,
            provider.optBoolean("ready", false), provider.optString("message", ""))
    }

    suspend fun machines(): List<CloudMachine> {
        val array = request("/api/machines").optJSONArray("machines") ?: JSONArray()
        return (0 until array.length()).map { parseMachine(array.getJSONObject(it)) }
    }

    suspend fun createMachine(name: String, os: String, cpu: Int, ram: Int, disk: Int, gpu: String): CloudMachine {
        val body = JSONObject().put("name", name).put("os", os).put("vCpu", cpu)
            .put("ramGb", ram).put("diskGb", disk).put("gpuProfile", gpu)
        return parseMachine(request("/api/machines", "POST", body).getJSONObject("machine"))
    }

    suspend fun action(id: String, action: String): CloudMachine {
        val safe = URLEncoder.encode(id, "UTF-8")
        return parseMachine(request("/api/machines/$safe/$action", "POST").getJSONObject("machine"))
    }

    suspend fun delete(id: String) {
        val safe = URLEncoder.encode(id, "UTF-8")
        request("/api/machines/$safe", "DELETE")
    }

    private fun parseMachine(j: JSONObject) = CloudMachine(
        id = j.optString("id"), name = j.optString("name"), os = j.optString("osLabel", j.optString("os")),
        cpu = j.optInt("vCpu"), ram = j.optInt("ramGb"), disk = j.optInt("diskGb"),
        gpu = j.optString("gpuLabel", j.optString("gpuProfile")), state = j.optString("state", "unknown"),
        connectionUrl = j.optString("connectionUrl"), errorMessage = j.optString("errorMessage"),
        providerReady = j.optString("providerId").isNotBlank()
    )

    private fun JSONArray?.toIntList(): List<Int> = this?.let { array -> (0 until array.length()).mapNotNull { index -> array.optInt(index).takeIf { value -> value > 0 } } } ?: emptyList()
}
