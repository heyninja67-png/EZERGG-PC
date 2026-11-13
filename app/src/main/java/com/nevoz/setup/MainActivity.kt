package com.nevoz.setup

import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var db: PcDatabase
    private lateinit var page: LinearLayout
    private val white = Color.rgb(246, 247, 255)
    private val muted = Color.rgb(163, 174, 218)
    private val cyan = Color.rgb(0, 205, 255)
    private val purple = Color.rgb(174, 55, 255)
    private val panel = Color.argb(232, 9, 13, 38)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        db = PcDatabase(this)
        window.statusBarColor = Color.rgb(4, 5, 17)
        window.navigationBarColor = Color.rgb(4, 5, 17)

        val root = FrameLayout(this)
        root.addView(ImageView(this).apply {
            setImageResource(R.drawable.nevoz_wallpaper)
            scaleType = ImageView.ScaleType.CENTER_CROP
            contentDescription = null
        }, FrameLayout.LayoutParams(-1, -1))
        root.addView(View(this).apply {
            setBackgroundColor(Color.argb(176, 3, 5, 18))
        }, FrameLayout.LayoutParams(-1, -1))

        val scroll = ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
            setPadding(0, 0, 0, 16)
        }
        page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(18, 18, 18, 24)
        }
        scroll.addView(page)
        root.addView(scroll, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        renderDashboard()

        // Restore cloud-synced profiles first; local records remain available offline.
        NevozApi.pullPcs(this, db) {
            runOnUiThread {
                renderDashboard()
                db.getPcs().forEach { NevozApi.syncPc(this, it) }
            }
        }
    }

    private fun renderDashboard() {
        page.removeAllViews()
        page.addView(header())
        page.addView(space(20))
        page.addView(hero())
        page.addView(space(22))
        page.addView(sectionHeader("MEUS CLOUD PCS", "SALVOS"))
        page.addView(space(10))

        val pcs = db.getPcs()
        if (pcs.isEmpty()) {
            page.addView(emptyState())
        } else {
            pcs.forEachIndexed { index, pc ->
                val card = pcCard(pc)
                card.alpha = 0f
                card.translationY = 22f
                page.addView(card)
                card.animate().alpha(1f).translationY(0f)
                    .setStartDelay((index * 75L).coerceAtMost(300L))
                    .setDuration(420L)
                    .setInterpolator(DecelerateInterpolator())
                    .start()
                page.addView(space(12))
            }
        }

        val create = primaryButton("＋   CRIAR CLOUD PC")
        page.addView(create, LinearLayout.LayoutParams(-1, 54))
        create.setOnClickListener { showCreateDialog() }

        page.addView(space(22))
        page.addView(sectionHeader("RECURSOS", "NEVOZ SETUP"))
        page.addView(space(10))
        page.addView(quickActions())
        page.addView(space(17))
        page.addView(persistenceCard())
        page.addView(space(18))
        page.addView(footer())
    }

    private fun header(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val logo = ImageView(this).apply {
            setImageResource(R.drawable.nevoz_logo)
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = "Logo NEVOZ SETUP"
        }
        row.addView(logo, LinearLayout.LayoutParams(62, 62))
        val titleBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(12, 0, 0, 0)
        }
        titleBox.addView(text("NEVOZ SETUP", 18, white, true))
        titleBox.addView(space(2))
        titleBox.addView(text("CLOUD PC CONTROL", 9, muted, true))
        row.addView(titleBox, LinearLayout.LayoutParams(0, -2, 1f))
        val settings = smallIconButton("⚙")
        row.addView(settings, LinearLayout.LayoutParams(44, 44))
        settings.setOnClickListener { showSettingsDialog() }
        return row
    }

    private fun hero(): View {
        val outer = FrameLayout(this).apply {
            background = gradient(intArrayOf(Color.rgb(6, 39, 82), Color.rgb(22, 13, 67), Color.rgb(9, 10, 36)), 23, cyan)
            setPadding(18, 18, 18, 18)
        }
        val textBlock = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        textBlock.addView(text("SUA CENTRAL DE COMPUTAÇÃO", 9, Color.rgb(117, 226, 255), true))
        textBlock.addView(space(7))
        textBlock.addView(text("Seu mundo.\nSeu Cloud PC.", 22, white, true))
        textBlock.addView(space(8))
        textBlock.addView(text("Perfis e anotações salvos neste dispositivo.", 11, muted, false))
        val cp = FrameLayout.LayoutParams(0, -2)
        val textParams = FrameLayout.LayoutParams(-1, -2, Gravity.CENTER_VERTICAL)
        textParams.rightMargin = 132
        outer.addView(textBlock, textParams)

        val art = ImageView(this).apply {
            setImageResource(R.drawable.art_pc_tower)
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = "Ilustração isolada de computador gamer"
        }
        val artParams = FrameLayout.LayoutParams(136, 160, Gravity.RIGHT or Gravity.CENTER_VERTICAL)
        artParams.rightMargin = -7
        outer.addView(art, artParams)
        return outer
    }

    private fun pcCard(pc: CloudPc): View {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(panel, 21, Color.rgb(56, 71, 149), 1)
            setPadding(15, 15, 15, 15)
        }

        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val name = text(pc.name, 15, white, true)
        top.addView(name, LinearLayout.LayoutParams(0, -2, 1f))
        val badge = TextView(this).apply {
            text = "● PERFIL SALVO"
            textSize = 9f
            letterSpacing = .03f
            setTextColor(Color.rgb(85, 240, 190))
            background = rounded(Color.argb(38, 0, 220, 170), 15, Color.argb(150, 0, 220, 170), 1)
            setPadding(10, 7, 10, 7)
        }
        top.addView(badge)
        card.addView(top)
        card.addView(space(4))
        card.addView(text("${pc.os}  •  ${pc.ramGb} GB RAM  •  ${pc.storageGb} GB SSD", 11, muted, false))
        card.addView(space(13))

        val hardware = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        hardware.addView(specChip("CPU", "8 vCPU"), LinearLayout.LayoutParams(0, -2, 1f))
        hardware.addView(spaceWidth(6))
        hardware.addView(specChip("GPU", pc.gpu), LinearLayout.LayoutParams(0, -2, 1f))
        hardware.addView(spaceWidth(6))
        hardware.addView(specChip("RAM", "${pc.ramGb} GB"), LinearLayout.LayoutParams(0, -2, 1f))
        card.addView(hardware)
        card.addView(space(10))
        card.addView(text("DISCO ID: ${pc.volumeId.take(19)}…", 9, Color.rgb(112, 177, 226), false))
        card.addView(space(8))
        val progressLine = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        progressLine.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_save)
            imageTintList = android.content.res.ColorStateList.valueOf(Color.rgb(49, 230, 172))
        }, LinearLayout.LayoutParams(17, 17))
        progressLine.addView(text(
            if (pc.progressNote.isBlank()) "Nenhum checkpoint salvo ainda" else "Último progresso: ${pc.progressNote.take(54)}",
            10, Color.rgb(172, 234, 219), false
        ).apply { setPadding(7, 0, 0, 0) })
        card.addView(progressLine)
        card.addView(space(13))

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val save = secondaryButton("SALVAR PROGRESSO")
        val connect = secondaryButton("CONECTAR")
        actions.addView(save, LinearLayout.LayoutParams(0, 43, 1f).apply { marginEnd = 7 })
        actions.addView(connect, LinearLayout.LayoutParams(0, 43, 1f))
        save.setOnClickListener { showSaveProgressDialog(pc) }
        connect.setOnClickListener { showProviderPendingDialog() }
        card.addView(actions)
        return card
    }

    private fun specChip(label: String, value: String): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = rounded(Color.argb(110, 22, 25, 66), 12, Color.argb(100, 75, 102, 180), 1)
            setPadding(5, 9, 5, 9)
        }
        box.addView(text(label, 8, muted, true))
        box.addView(space(3))
        box.addView(text(value, 10, white, true))
        return box
    }

    private fun emptyState(): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = rounded(Color.argb(185, 10, 13, 39), 20, Color.rgb(53, 67, 140), 1)
            setPadding(18, 23, 18, 23)
        }
        val art = ImageView(this).apply {
            setImageResource(R.drawable.art_cloud_servers)
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = "Ilustração de servidores na nuvem"
        }
        box.addView(art, LinearLayout.LayoutParams(116, 104))
        box.addView(space(8))
        box.addView(text("Seu primeiro Cloud PC começa aqui", 15, white, true))
        box.addView(space(5))
        box.addView(text("Crie um perfil; ele ficará salvo mesmo depois de fechar o app.", 11, muted, false))
        return box
    }

    private fun quickActions(): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row.addView(quickTile(R.drawable.ic_server, "Meus PCs"), LinearLayout.LayoutParams(0, 92, 1f).apply { marginEnd = 7 })
        row.addView(quickTile(R.drawable.ic_storage, "Armazenamento"), LinearLayout.LayoutParams(0, 92, 1f).apply { marginEnd = 7 })
        row.addView(quickTile(R.drawable.ic_settings, "Configurações"), LinearLayout.LayoutParams(0, 92, 1f))
        return row
    }

    private fun quickTile(icon: Int, title: String): View {
        val tile = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = rounded(Color.argb(215, 12, 15, 43), 15, Color.rgb(49, 63, 130), 1)
            setPadding(5, 10, 5, 10)
        }
        val image = ImageView(this).apply {
            setImageResource(icon)
            imageTintList = android.content.res.ColorStateList.valueOf(cyan)
        }
        tile.addView(image, LinearLayout.LayoutParams(27, 27))
        tile.addView(space(6))
        tile.addView(text(title, 9, white, true))
        tile.setOnClickListener {
            if (title == "Configurações") showSettingsDialog()
            else Toast.makeText(this, "Seus registros estão salvos no app.", Toast.LENGTH_SHORT).show()
        }
        return tile
    }

    private fun persistenceCard(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(Color.argb(180, 5, 39, 49), 16, Color.rgb(0, 164, 165), 1)
            setPadding(13, 13, 13, 13)
        }
        val icon = ImageView(this).apply {
            setImageResource(R.drawable.ic_save)
            imageTintList = android.content.res.ColorStateList.valueOf(Color.rgb(61, 239, 187))
        }
        row.addView(icon, LinearLayout.LayoutParams(29, 29))
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(10, 0, 0, 0)
        }
        col.addView(text("PROGRESSO SALVO", 10, Color.rgb(89, 247, 198), true))
        col.addView(space(3))
        col.addView(text("Perfis e checkpoints ficam no SQLite local; sincronize com a API HTTPS para cópia no servidor.", 10, Color.rgb(191, 224, 224), false))
        row.addView(col, LinearLayout.LayoutParams(0, -2, 1f))
        return row
    }

    private fun footer(): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(8, 6, 8, 8)
        }
        box.addView(text("NEVOZ SETUP  •  VERSÃO 0.5.0", 9, muted, true))
        box.addView(space(4))
        box.addView(text("PC Virtual criado por Nevoz Setup!!", 9, muted, false))
        return box
    }

    private fun sectionHeader(title: String, subtitle: String): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        row.addView(text(title, 11, white, true), LinearLayout.LayoutParams(0, -2, 1f))
        row.addView(text(subtitle, 9, cyan, true))
        return row
    }

    private fun showCreateDialog() {
        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(20, 8, 20, 0)
        }
        val name = EditText(this).apply {
            hint = "Nome do Cloud PC"
            setSingleLine()
            setTextColor(white)
            setHintTextColor(muted)
            background = rounded(Color.rgb(17, 20, 51), 12, Color.rgb(70, 91, 176), 1)
            setPadding(13, 12, 13, 12)
        }
        val os = spinner(listOf("Windows 11", "Windows 11 Pro", "Windows 11 Enterprise"))
        val ram = spinner(listOf("4 GB", "8 GB", "16 GB", "32 GB"))
        val storage = spinner(listOf("100 GB", "200 GB", "500 GB", "1 TB", "2 TB"))
        val gpu = spinner(listOf("Sem GPU", "NVIDIA GeForce", "AMD Radeon"))
        form.addView(fieldLabel("Nome"))
        form.addView(name)
        form.addView(fieldLabel("Sistema operacional"))
        form.addView(os)
        form.addView(fieldLabel("Memória RAM"))
        form.addView(ram)
        form.addView(fieldLabel("Armazenamento"))
        form.addView(storage)
        form.addView(fieldLabel("Placa de vídeo"))
        form.addView(gpu)

        val scroll = ScrollView(this).apply { addView(form) }
        AlertDialog.Builder(this)
            .setTitle("Criar perfil de Cloud PC")
            .setView(scroll)
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("SALVAR PERFIL") { _, _ ->
                val pcName = name.text.toString().trim().ifBlank { "NEVOZ-PC-${db.getPcs().size + 1}" }
                val ramGb = ram.selectedItem.toString().substringBefore(" ").toInt()
                val storageLabel = storage.selectedItem.toString()
                val storageGb = when (storageLabel) {
                    "1 TB" -> 1024
                    "2 TB" -> 2048
                    else -> storageLabel.substringBefore(" ").toInt()
                }
                val pc = db.createPc(
                    pcName,
                    os.selectedItem.toString(),
                    ramGb,
                    storageGb,
                    gpu.selectedItem.toString()
                )
                NevozApi.syncPc(this, pc)
                renderDashboard()
                Toast.makeText(this, "Perfil salvo neste dispositivo.", Toast.LENGTH_LONG).show()
            }
            .show()
    }

    private fun showSaveProgressDialog(pc: CloudPc) {
        val input = EditText(this).apply {
            hint = "Ex.: projeto aberto, última etapa, observações..."
            setText(pc.progressNote)
            setTextColor(white)
            setHintTextColor(muted)
            minLines = 3
            maxLines = 5
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            background = rounded(Color.rgb(17, 20, 51), 12, Color.rgb(70, 91, 176), 1)
            setPadding(13, 12, 13, 12)
        }
        AlertDialog.Builder(this)
            .setTitle("Salvar progresso • ${pc.name}")
            .setView(input)
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("SALVAR CHECKPOINT") { _, _ ->
                val note = input.text.toString().trim()
                db.saveProgress(pc.id, note)
                val updated = db.getPcs().firstOrNull { it.id == pc.id }
                if (updated != null) {
                    NevozApi.syncPc(this, updated)
                    NevozApi.saveCheckpoint(this, updated, note)
                }
                renderDashboard()
                Toast.makeText(this, "Checkpoint salvo localmente.", Toast.LENGTH_SHORT).show()
            }
            .show()
    }

    private fun showSettingsDialog() {
        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(20, 8, 20, 0)
        }
        val urlInput = EditText(this).apply {
            hint = "https://api.seudominio.com"
            setSingleLine()
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(getSharedPreferences("nevoz_settings", MODE_PRIVATE).getString("api_base_url", ""))
            setTextColor(white)
            setHintTextColor(muted)
            background = rounded(Color.rgb(17, 20, 51), 12, Color.rgb(70, 91, 176), 1)
            setPadding(13, 12, 13, 12)
        }
        val tokenInput = EditText(this).apply {
            hint = "Token privado da API (mínimo 32 caracteres)"
            setSingleLine()
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setText(getSharedPreferences("nevoz_settings", MODE_PRIVATE).getString("api_token", ""))
            setTextColor(white)
            setHintTextColor(muted)
            background = rounded(Color.rgb(17, 20, 51), 12, Color.rgb(70, 91, 176), 1)
            setPadding(13, 12, 13, 12)
        }
        form.addView(fieldLabel("URL HTTPS da API"))
        form.addView(urlInput)
        form.addView(fieldLabel("Token privado"))
        form.addView(tokenInput)

        AlertDialog.Builder(this)
            .setTitle("Sincronização segura")
            .setMessage("Sem API configurada, perfis e checkpoints continuam salvos no celular. Use HTTPS e um token privado forte.")
            .setView(form)
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("SALVAR") { _, _ ->
                val url = urlInput.text.toString().trim().trimEnd('/')
                val token = tokenInput.text.toString().trim()
                if (url.isNotBlank() && !url.startsWith("https://", true)) {
                    Toast.makeText(this, "Use uma URL HTTPS segura.", Toast.LENGTH_LONG).show()
                } else if (url.isNotBlank() && token.length < 32) {
                    Toast.makeText(this, "O token deve ter pelo menos 32 caracteres.", Toast.LENGTH_LONG).show()
                } else {
                    getSharedPreferences("nevoz_settings", MODE_PRIVATE).edit()
                        .putString("api_base_url", url)
                        .putString("api_token", token)
                        .apply()
                    db.getPcs().forEach { NevozApi.syncPc(this, it) }
                    Toast.makeText(this, "Configuração salva.", Toast.LENGTH_SHORT).show()
                }
            }
            .show()
    }

    private fun showProviderPendingDialog() {
        AlertDialog.Builder(this)
            .setTitle("Provedor de Cloud PC pendente")
            .setMessage("O aplicativo já salva seus perfis e checkpoints, mas ainda não existe um provedor conectado para iniciar uma VM Windows real. O disco persistente de Windows só poderá ser criado e anexado depois da integração com o provedor.")
            .setPositiveButton("Entendi", null)
            .show()
    }

    private fun spinner(items: List<String>): Spinner {
        val s = Spinner(this)
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, items).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        s.adapter = adapter
        s.background = rounded(Color.rgb(17, 20, 51), 12, Color.rgb(70, 91, 176), 1)
        return s
    }

    private fun fieldLabel(value: String) = text(value, 10, muted, true).apply { setPadding(2, 12, 2, 5) }

    private fun primaryButton(value: String) = Button(this).apply {
        text = value
        isAllCaps = false
        textSize = 12f
        letterSpacing = .04f
        setTextColor(white)
        typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
        background = gradient(intArrayOf(Color.rgb(0, 168, 255), Color.rgb(83, 43, 255), Color.rgb(181, 20, 235)), 16, cyan)
        stateListAnimator = null
        elevation = 4f
    }

    private fun secondaryButton(value: String) = Button(this).apply {
        text = value
        isAllCaps = false
        textSize = 10f
        letterSpacing = .025f
        setTextColor(white)
        background = rounded(Color.rgb(18, 22, 58), 13, Color.rgb(69, 84, 166), 1)
        stateListAnimator = null
    }

    private fun smallIconButton(glyph: String) = TextView(this).apply {
        text = glyph
        textSize = 20f
        gravity = Gravity.CENTER
        setTextColor(cyan)
        background = rounded(Color.argb(200, 15, 18, 50), 14, Color.rgb(58, 81, 159), 1)
    }

    private fun text(value: String, size: Int, color: Int, bold: Boolean): TextView =
        TextView(this).apply {
            text = value
            textSize = size.toFloat()
            setTextColor(color)
            if (bold) typeface = Typeface.create("sans-serif", Typeface.BOLD)
        }

    private fun rounded(color: Int, radius: Int, stroke: Int, strokeWidth: Int) =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = radius.toFloat()
            setStroke(strokeWidth, stroke)
        }

    private fun gradient(colors: IntArray, radius: Int, stroke: Int) =
        GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, colors).apply {
            cornerRadius = radius.toFloat()
            setStroke(1, stroke)
        }

    private fun space(height: Int) = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(1, height)
    }

    private fun spaceWidth(width: Int) = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(width, 1)
    }
}
