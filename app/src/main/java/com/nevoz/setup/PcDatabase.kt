package com.nevoz.setup

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.util.UUID

data class CloudPc(
    val id: String,
    val name: String,
    val os: String,
    val ramGb: Int,
    val storageGb: Int,
    val gpu: String,
    val volumeId: String,
    val status: String,
    val progressNote: String,
    val updatedAt: Long
)

class PcDatabase(context: Context) :
    SQLiteOpenHelper(context, "nevoz_local.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE cloud_pcs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                os TEXT NOT NULL,
                ram_gb INTEGER NOT NULL,
                storage_gb INTEGER NOT NULL,
                gpu TEXT NOT NULL,
                volume_id TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'profile_saved',
                progress_note TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            )
        """.trimIndent())
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Future schema changes must use additive migrations; do not drop user records.
    }

    fun createPc(name: String, os: String, ram: Int, storage: Int, gpu: String): CloudPc {
        val id = UUID.randomUUID().toString()
        val volumeId = "nevoz-volume-${UUID.randomUUID()}"
        val now = System.currentTimeMillis()
        val values = ContentValues().apply {
            put("id", id)
            put("name", name)
            put("os", os)
            put("ram_gb", ram)
            put("storage_gb", storage)
            put("gpu", gpu)
            put("volume_id", volumeId)
            put("status", "profile_saved")
            put("progress_note", "")
            put("updated_at", now)
        }
        writableDatabase.insertOrThrow("cloud_pcs", null, values)
        return CloudPc(id, name, os, ram, storage, gpu, volumeId, "profile_saved", "", now)
    }

    fun getPcs(): List<CloudPc> {
        val result = mutableListOf<CloudPc>()
        readableDatabase.rawQuery(
            "SELECT id,name,os,ram_gb,storage_gb,gpu,volume_id,status,progress_note,updated_at FROM cloud_pcs ORDER BY updated_at DESC",
            null
        ).use { c ->
            while (c.moveToNext()) {
                result.add(
                    CloudPc(
                        c.getString(0), c.getString(1), c.getString(2),
                        c.getInt(3), c.getInt(4), c.getString(5),
                        c.getString(6), c.getString(7), c.getString(8), c.getLong(9)
                    )
                )
            }
        }
        return result
    }


    fun upsertRemotePc(pc: CloudPc) {
        val local = getPcs().firstOrNull { it.id == pc.id }
        // Never overwrite a newer local checkpoint with stale server data.
        if (local != null && local.updatedAt > pc.updatedAt) return
        val values = ContentValues().apply {
            put("id", pc.id)
            put("name", pc.name)
            put("os", pc.os)
            put("ram_gb", pc.ramGb)
            put("storage_gb", pc.storageGb)
            put("gpu", pc.gpu)
            put("volume_id", pc.volumeId)
            put("status", pc.status)
            put("progress_note", pc.progressNote)
            put("updated_at", pc.updatedAt)
        }
        writableDatabase.insertWithOnConflict(
            "cloud_pcs", null, values, SQLiteDatabase.CONFLICT_REPLACE
        )
    }

    fun saveProgress(pcId: String, note: String): Boolean {
        val values = ContentValues().apply {
            put("progress_note", note)
            put("updated_at", System.currentTimeMillis())
        }
        return writableDatabase.update("cloud_pcs", values, "id=?", arrayOf(pcId)) > 0
    }
}
