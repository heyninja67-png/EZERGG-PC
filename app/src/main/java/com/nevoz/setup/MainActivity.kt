package com.nevoz.setup

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

private val Bg = Color(0xFF070B1C)
private val Panel = Color(0xFF111936)
private val Panel2 = Color(0xFF172247)
private val Cyan = Color(0xFF45E5FF)
private val Blue = Color(0xFF12B8F5)
private val Purple = Color(0xFF713BFF)
private val Muted = Color(0xFF9CAAD0)
private val Good = Color(0xFF48E0B2)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = AppPrefs(this)
        setContent { NevozTheme { NevozApp(prefs) } }
    }
}

@Composable
private fun NevozTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Cyan, secondary = Purple, background = Bg, surface = Panel,
            onPrimary = Bg, onBackground = Color.White, onSurface = Color.White
        ), content = content
    )
}

@Composable
private fun NevozApp(prefs: AppPrefs) {
    var page by remember { mutableStateOf("home") }
    var baseUrl by remember { mutableStateOf(prefs.baseUrl) }
    var token by remember { mutableStateOf(prefs.deviceToken) }
    var catalog by remember { mutableStateOf<Catalog?>(null) }
    var machines by remember { mutableStateOf<List<CloudMachine>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    fun refresh() {
        if (baseUrl.isBlank() || token.isBlank()) return
        scope.launch {
            busy = true
            try {
                val api = NevozApi(baseUrl, token)
                catalog = api.catalog()
                machines = api.machines()
                message = "Dados sincronizados com a NEVOZ API."
            } catch (e: Exception) { message = e.message ?: "Falha ao sincronizar." }
            finally { busy = false }
        }
    }

    LaunchedEffect(baseUrl, token) { refresh() }
    val provisioningInProgress = machines.any { it.state == "provisioning" || it.state == "starting" }
    LaunchedEffect(baseUrl, token, provisioningInProgress) {
        if (token.isNotBlank() && provisioningInProgress) {
            while (true) {
                delay(8000)
                try { machines = NevozApi(baseUrl, token).machines() }
                catch (e: Exception) { message = e.message ?: "Falha ao atualizar o estado do PC." }
            }
        }
    }

    Scaffold(
        containerColor = Bg,
        bottomBar = {
            NavigationBar(containerColor = Color(0xFF0B1128), contentColor = Cyan) {
                NavigationBarItem(selected = page == "home", onClick = { page = "home" }, icon = { Icon(Icons.Default.Home, null) }, label = { Text("Início") })
                NavigationBarItem(selected = page == "create", onClick = { page = "create" }, icon = { Icon(Icons.Default.Add, null) }, label = { Text("Criar PC") })
                NavigationBarItem(selected = page == "settings", onClick = { page = "settings" }, icon = { Icon(Icons.Default.Settings, null) }, label = { Text("Conexão") })
            }
        }
    ) { padding ->
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF101D47), Bg, Color(0xFF090D20)))).padding(padding)) {
            Column(Modifier.fillMaxSize()) {
                Header(onRefresh = { refresh() }, busy = busy)
                AnimatedVisibility(visible = message.isNotBlank(), enter = fadeIn(), exit = fadeOut()) {
                    Text(message, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
                }
                when (page) {
                    "create" -> CreatePage(catalog, busy, onCreate = { name, os, cpu, ram, disk, gpu ->
                        scope.launch {
                            busy = true
                            try {
                                val created = NevozApi(baseUrl, token).createMachine(name, os, cpu, ram, disk, gpu)
                                machines = listOf(created) + machines
                                message = "Solicitação enviada. Acompanhe o estado real do provisionamento."
                                page = "home"
                            } catch (e: Exception) { message = e.message ?: "Não foi possível criar o Cloud PC." }
                            finally { busy = false }
                        }
                    }, onConfigure = { page = "settings" })
                    "settings" -> SettingsPage(baseUrl, token.isNotBlank(), busy,
                        onPair = { url, code ->
                            scope.launch {
                                busy = true
                                try {
                                    val newToken = NevozApi(url, "").pair(code, "Android NEVOZ")
                                    token = newToken; prefs.baseUrl = url; prefs.deviceToken = newToken
                                    baseUrl = url
                                    message = "Dispositivo pareado com sucesso."
                                    page = "home"
                                } catch (e: Exception) { message = e.message ?: "Falha no pareamento." }
                                finally { busy = false }
                            }
                        }, onUnpair = { prefs.clearToken(); token = ""; machines = emptyList(); message = "Dispositivo desconectado." })
                    else -> HomePage(machines, catalog, busy,
                        onCreate = { page = "create" }, onRefresh = { refresh() },
                        onAction = { machine, action ->
                            scope.launch {
                                busy = true
                                try {
                                    val updated = NevozApi(baseUrl, token).action(machine.id, action)
                                    machines = machines.map { if (it.id == updated.id) updated else it }
                                    message = "Comando enviado: $action"
                                } catch (e: Exception) { message = e.message ?: "Falha ao executar comando." }
                                finally { busy = false }
                            }
                        }, onDelete = { machine ->
                            scope.launch {
                                busy = true
                                try { NevozApi(baseUrl, token).delete(machine.id); machines = machines.filterNot { it.id == machine.id }; message = "Cloud PC removido." }
                                catch (e: Exception) { message = e.message ?: "Falha ao excluir." }
                                finally { busy = false }
                            }
                        }, onConnect = { url ->
                            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                                .onFailure { message = "Não foi possível abrir o cliente de conexão." }
                        }, onSettings = { page = "settings" })
                }
            }
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter), color = Cyan, trackColor = Color.Transparent)
        }
    }
}

@Composable
private fun Header(onRefresh: () -> Unit, busy: Boolean) {
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 14.dp, top = 14.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(42.dp).clip(RoundedCornerShape(13.dp)).background(Brush.linearGradient(listOf(Blue, Purple))), contentAlignment = Alignment.Center) {
            Text("N", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Black)
        }
        Column(Modifier.weight(1f).padding(start = 11.dp)) {
            Text("NEVOZ", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, letterSpacing = 2.sp)
            Text("CLOUD PC CONTROL", color = Cyan, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = 1.6.sp)
        }
        IconButton(onClick = onRefresh, enabled = !busy) { Icon(Icons.Default.Refresh, "Atualizar", tint = Cyan) }
    }
}

@Composable
private fun HomePage(
    machines: List<CloudMachine>, catalog: Catalog?, busy: Boolean,
    onCreate: () -> Unit, onRefresh: () -> Unit,
    onAction: (CloudMachine, String) -> Unit, onDelete: (CloudMachine) -> Unit,
    onConnect: (String) -> Unit, onSettings: () -> Unit
) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Panel), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF244C79))) {
                Column(Modifier.fillMaxWidth().background(Brush.horizontalGradient(listOf(Color(0xFF10294D), Color(0xFF17143D)))).padding(20.dp)) {
                    Text("SUA NUVEM. SEU CONTROLE.", color = Cyan, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("Seu Cloud PC,\nsem atalhos falsos.", color = Color.White, fontSize = 27.sp, lineHeight = 31.sp, fontWeight = FontWeight.ExtraBold)
                    Spacer(Modifier.height(8.dp))
                    Text("O painel mostra apenas máquinas registradas pelo provedor conectado.", color = Muted, fontSize = 13.sp)
                }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("MEUS CLOUD PCS", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("${machines.size} PC(s)", color = Cyan, fontSize = 12.sp)
            }
        }
        if (machines.isEmpty()) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.fillMaxWidth().padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.Cloud, null, tint = Cyan, modifier = Modifier.size(36.dp))
                        Spacer(Modifier.height(10.dp))
                        Text("Nenhum Cloud PC provisionado", color = Color.White, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(5.dp))
                        Text("Pareie o aplicativo com a sua API e conecte um provedor de infraestrutura para criar a primeira máquina.", color = Muted, fontSize = 12.sp)
                        Spacer(Modifier.height(14.dp))
                        Button(onClick = onSettings, colors = ButtonDefaults.buttonColors(containerColor = Panel2)) { Text("Configurar conexão") }
                    }
                }
            }
        }
        items(machines, key = { it.id }) { machine ->
            MachineCard(machine, onAction, onDelete, onConnect)
        }
        item {
            Button(onClick = onCreate, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent), contentPadding = PaddingValues(0.dp), enabled = !busy) {
                Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Blue, Purple))), contentAlignment = Alignment.Center) {
                    Text("＋  CRIAR CLOUD PC", color = Color.White, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.sp)
                }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0F1C34)), shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF1C5265))) {
                Row(Modifier.padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Terminal, null, tint = Cyan)
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text("Infraestrutura real", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text(catalog?.providerMessage ?: "Configure a API para consultar o provedor.", color = Muted, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun MachineCard(machine: CloudMachine, onAction: (CloudMachine, String) -> Unit, onDelete: (CloudMachine) -> Unit, onConnect: (String) -> Unit) {
    val running = machine.state.equals("running", true)
    val stateColor = if (running) Good else if (machine.state == "provisioning" || machine.state == "starting") Cyan else Color(0xFFFFB76B)
    Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(20.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF27345C))) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(machine.name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(machine.os, color = Muted, fontSize = 12.sp)
                }
                Surface(color = stateColor.copy(alpha = .13f), shape = CircleShape, border = androidx.compose.foundation.BorderStroke(1.dp, stateColor.copy(alpha = .5f))) {
                    Text(machine.state.uppercase(), color = stateColor, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp))
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Metric("CPU", "${machine.cpu} vCPU", Modifier.weight(1f))
                Metric("RAM", "${machine.ram} GB", Modifier.weight(1f))
                Metric("SSD", "${machine.disk} GB", Modifier.weight(1f))
            }
            Spacer(Modifier.height(10.dp))
            Text("GPU  ${machine.gpu}", color = Cyan, fontSize = 12.sp)
            if (machine.errorMessage.isNotBlank()) Text(machine.errorMessage, color = Color(0xFFFFA0AA), fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
            if (machine.connectionUrl.isNotBlank()) {
                Spacer(Modifier.height(14.dp))
                Button(onClick = { onConnect(machine.connectionUrl) }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Blue)) { Text("CONECTAR AO PC", fontWeight = FontWeight.Bold) }
            } else {
                Text("Conexão remota ainda não configurada no servidor.", color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 11.dp))
            }
            Spacer(Modifier.height(9.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { onAction(machine, if (running) "stop" else "start") }, modifier = Modifier.weight(1f), enabled = machine.providerReady) {
                    Text(if (running) "Desligar" else "Ligar")
                }
                OutlinedButton(onClick = { onDelete(machine) }, enabled = machine.state == "error" || machine.providerReady, colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF8C9B))) { Text("Excluir") }
            }
        }
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(Panel2).padding(10.dp)) {
        Text(label, color = Muted, fontSize = 10.sp)
        Text(value, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun CreatePage(catalog: Catalog?, busy: Boolean, onCreate: (String, String, Int, Int, Int, String) -> Unit, onConfigure: () -> Unit) {
    var name by remember { mutableStateOf("Meu Cloud PC") }
    var os by remember { mutableStateOf("windows-11-pro") }
    var cpu by remember { mutableIntStateOf(8) }
    var ram by remember { mutableIntStateOf(16) }
    var disk by remember { mutableIntStateOf(250) }
    var gpu by remember { mutableStateOf("none") }
    val osOptions = catalog?.os?.ifEmpty { defaultOs } ?: defaultOs
    val gpuOptions = catalog?.gpus?.ifEmpty { listOf(GpuOption("none", "Sem GPU")) } ?: listOf(GpuOption("none", "Sem GPU"))
    val ready = catalog?.providerReady == true
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("CONFIGURAR CLOUD PC", color = Cyan, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
        Text("Monte sua máquina", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
        Text("As opções são enviadas ao provedor. A criação só acontece quando a infraestrutura estiver configurada.", color = Muted, fontSize = 12.sp)
        OutlinedTextField(name, { name = it }, label = { Text("Nome do PC") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        SelectField("Windows", osOptions.map { it.first to it.second }, os, { os = it })
        SelectField("CPU", (catalog?.cpu?.ifEmpty { listOf(4, 8, 16) } ?: listOf(4, 8, 16)).map { it.toString() to "$it vCPU" }, cpu.toString(), { cpu = it.toInt() })
        SelectField("Memória RAM", (catalog?.ram?.ifEmpty { listOf(8, 16, 32, 64) } ?: listOf(8, 16, 32, 64)).map { it.toString() to "$it GB" }, ram.toString(), { ram = it.toInt() })
        SelectField("Armazenamento SSD", (catalog?.disk?.ifEmpty { listOf(100, 250, 500, 1000, 2000) } ?: listOf(100, 250, 500, 1000, 2000)).map { it.toString() to if (it >= 1000) "${it / 1000} TB" else "$it GB" }, disk.toString(), { disk = it.toInt() })
        SelectField("GPU disponível no servidor", gpuOptions.map { it.id to it.label }, gpu, { gpu = it })
        if (!ready) {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF2B2118)), shape = RoundedCornerShape(14.dp)) {
                Text(catalog?.providerMessage ?: "A API ainda não confirmou um provedor operacional. Configure o backend primeiro.", color = Color(0xFFFFD19A), fontSize = 12.sp, modifier = Modifier.padding(14.dp))
            }
        }
        Button(onClick = { onCreate(name.trim(), os, cpu, ram, disk, gpu) }, enabled = !busy && ready && name.isNotBlank(), modifier = Modifier.fillMaxWidth().height(52.dp), colors = ButtonDefaults.buttonColors(containerColor = Blue)) {
            Text(if (busy) "ENVIANDO SOLICITAÇÃO..." else "PROVISIONAR CLOUD PC", fontWeight = FontWeight.Bold)
        }
        if (!ready) TextButton(onClick = onConfigure, modifier = Modifier.fillMaxWidth()) { Text("Configurar servidor e parear dispositivo") }
    }
}

private val defaultOs = listOf("windows-11" to "Windows 11", "windows-11-pro" to "Windows 11 Pro", "windows-11-enterprise" to "Windows 11 Enterprise")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SelectField(label: String, options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val current = options.firstOrNull { it.first == selected }?.second ?: selected
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
        OutlinedTextField(value = current, onValueChange = {}, readOnly = true, label = { Text(label) }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) }, modifier = Modifier.menuAnchor().fillMaxWidth())
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { item -> DropdownMenuItem(text = { Text(item.second) }, onClick = { onSelect(item.first); expanded = false }) }
        }
    }
}

@Composable
private fun SettingsPage(baseUrl: String, paired: Boolean, busy: Boolean, onPair: (String, String) -> Unit, onUnpair: () -> Unit) {
    var pairingCode by remember { mutableStateOf("") }
    var url by remember(baseUrl) { mutableStateOf(baseUrl) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("CONEXÃO SEGURA", color = Cyan, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
        Text("Conecte sua infraestrutura", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.ExtraBold)
        Text("Informe o endereço HTTPS da NEVOZ API e use o código de pareamento gerado no servidor. A chave do Proxmox nunca fica no APK.", color = Muted, fontSize = 12.sp)
        OutlinedTextField(url, { url = it }, label = { Text("URL HTTPS da API") }, placeholder = { Text("https://cloud.seudominio.com") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(pairingCode, { pairingCode = it }, label = { Text("Código de pareamento") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        Button(onClick = { onPair(url.trim().trimEnd('/'), pairingCode) }, enabled = !busy && url.startsWith("https://") && pairingCode.isNotBlank(), modifier = Modifier.fillMaxWidth().height(50.dp), colors = ButtonDefaults.buttonColors(containerColor = Blue)) {
            Text(if (busy) "PAREANDO..." else if (paired) "PAREAR OUTRO DISPOSITIVO" else "PAREAR DISPOSITIVO", fontWeight = FontWeight.Bold)
        }
        if (paired) OutlinedButton(onClick = onUnpair, modifier = Modifier.fillMaxWidth()) { Text("Desconectar este dispositivo") }
        Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Text("SEGURANÇA", color = Cyan, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                Text("• Use HTTPS válido.\n• O código de pareamento só é usado para registrar o dispositivo.\n• O app recebe um token de dispositivo revogável.\n• Credenciais e tokens do provedor permanecem no servidor.", color = Muted, fontSize = 12.sp)
            }
        }
    }
}
