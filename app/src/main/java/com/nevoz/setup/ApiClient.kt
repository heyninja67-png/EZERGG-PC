package com.nevoz.setup

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.UUID

class AppPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("nevoz_installation", Context.MODE_PRIVATE)

    val deviceId: String
        get() = prefs.getString("device_id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("device_id", it).apply()
        }

    val deviceSecret: String
        get() = prefs.getString("device_secret", null) ?: ByteArray(32).also { SecureRandom().nextBytes(it) }
            .let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }
            .also { prefs.edit().putString("device_secret", it).apply() }

    fun deviceName(): String = "Android ${android.os.Build.MODEL ?: "NEVOZ"}".take(80)
}

data class GpuOption(val id: String, val label: String)
data class Catalog(
    val os: List<Pair<String, String>>,
    val cpu: List<Int>,
    val ram: List<Int>,
    val disk: List<Int>,
    val gpus: List<GpuOption>,
    val providerReady: Boolean,
    val consoleReady: Boolean,
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
    val connectionAvailable: Boolean,
    val errorMessage: String,
    val providerReady: Boolean
)

class NevozApi(
    private val deviceId: String,
    private val deviceSecret: String,
    private val baseUrl: String = BuildConfig.API_BASE_URL
) {
    private suspend fun request(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        authenticated: Boolean = true
    ): JSONObject = withContext(Dispatchers.IO) {
        val cleanBase = baseUrl.trim().trimEnd('/')
        require(cleanBase.startsWith("https://", ignoreCase = true)) {
            "O endereço central do NEVOZ ainda não foi publicado nesta versão do aplicativo."
        }
        val connection = (URL(cleanBase + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 12000
            readTimeout = 120000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("X-NEVOZ-Device-ID", deviceId)
            if (authenticated) setRequestProperty("Authorization", "Bearer $deviceSecret")
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
        } finally {
            connection.disconnect()
        }
    }

    suspend fun bootstrap(deviceName: String) {
        request(
            "/api/device/bootstrap",
            "POST",
            JSONObject().put("deviceId", deviceId).put("deviceSecret", deviceSecret).put("deviceName", deviceName),
            authenticated = false
        )
    }

    suspend fun catalog(): Catalog {
        val json = request("/api/catalog", authenticated = false)
        fun ints(key: String): List<Int> = json.optJSONArray(key).toIntList()
        val osArray = json.optJSONArray("operatingSystems") ?: JSONArray()
        val os = (0 until osArray.length()).map { index ->
            val item = osArray.getJSONObject(index)
            item.optString("id") to item.optString("label")
        }
        val gpuArray = json.optJSONArray("gpuProfiles") ?: JSONArray()
        val gpus = (0 until gpuArray.length()).map { index ->
            val item = gpuArray.getJSONObject(index)
            GpuOption(item.optString("id"), item.optString("label"))
        }
        val provider = json.optJSONObject("provider") ?: JSONObject()
        return Catalog(
            os, ints("cpuCores"), ints("ramGb"), ints("diskGb"), gpus,
            provider.optBoolean("ready", false), json.optBoolean("consoleReady", false), provider.optString("message", "")
        )
    }

    suspend fun machines(): List<CloudMachine> {
        val array = request("/api/machines").optJSONArray("machines") ?: JSONArray()
        return (0 until array.length()).map { index -> parseMachine(array.getJSONObject(index)) }
    }

    suspend fun createMachine(name: String, os: String, cpu: Int, ram: Int, disk: Int, gpu: String): CloudMachine {
        val body = JSONObject().put("name", name).put("os", os).put("vCpu", cpu)
            .put("ramGb", ram).put("diskGb", disk).put("gpuProfile", gpu)
        return parseMachine(request("/api/machines", "POST", body).getJSONObject("machine"))
    }

    suspend fun action(id: String, action: String): CloudMachine =
        parseMachine(request("/api/machines/$id/$action", "POST").getJSONObject("machine"))

    suspend fun delete(id: String) {
        request("/api/machines/$id", "DELETE")
    }

    suspend fun connectUrl(id: String): String =
        request("/api/machines/$id/connect", "POST").getString("url")

    private fun parseMachine(json: JSONObject) = CloudMachine(
        id = json.optString("id"),
        name = json.optString("name"),
        os = json.optString("osLabel", json.optString("os")),
        cpu = json.optInt("vCpu"),
        ram = json.optInt("ramGb"),
        disk = json.optInt("diskGb"),
        gpu = json.optString("gpuLabel", json.optString("gpuProfile")),
        state = json.optString("state", "unknown"),
        connectionAvailable = json.optBoolean("connectionAvailable", false),
        errorMessage = json.optString("errorMessage"),
        providerReady = json.optString("providerId").isNotBlank()
    )

    private fun JSONArray?.toIntList(): List<Int> = this?.let { array ->
        (0 until array.length()).mapNotNull { index -> array.optInt(index).takeIf { it > 0 } }
    } ?: emptyList()
}
