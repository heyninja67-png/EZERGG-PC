package com.nevoz.setup

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Black = Color(0xFF05080B)
private val Surface = Color(0xFF0D141A)
private val Surface2 = Color(0xFF121E26)
private val Stroke = Color(0xFF203641)
private val Cyan = Color(0xFF16D9F5)
private val CyanSoft = Color(0xFF8AEFFF)
private val TextMain = Color(0xFFF2FAFC)
private val TextMuted = Color(0xFF8EA4AE)
private val Green = Color(0xFF5BE1AD)
private val Red = Color(0xFFFF7585)

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
            primary = Cyan,
            secondary = CyanSoft,
            background = Black,
            surface = Surface,
            onPrimary = Black,
            onBackground = TextMain,
            onSurface = TextMain,
            error = Red
        ),
        content = content
    )
}

@Composable
private fun NevozApp(prefs: AppPrefs) {
    var page by remember { mutableStateOf("home") }
    var catalog by remember { mutableStateOf<Catalog?>(null) }
    var machines by remember { mutableStateOf<List<CloudMachine>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var ready by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("Conectando ao provedor NEVOZ…") }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val api = remember(prefs.deviceId, prefs.deviceSecret) { NevozApi(prefs.deviceId, prefs.deviceSecret) }

    suspend fun loadAll() {
        api.bootstrap(prefs.deviceName())
        catalog = api.catalog()
        machines = api.machines()
        ready = true
        message = when {
            catalog?.providerReady != true -> catalog?.providerMessage ?: "Aguardando o provedor."
            catalog?.consoleReady != true -> "Host pronto. Falta publicar o domínio HTTPS do NEVOZ para habilitar o acesso remoto."
            else -> "Seu Cloud PC NEVOZ está pronto para uso."
        }
    }

    fun refresh() {
        scope.launch {
            busy = true
            try { loadAll() }
            catch (error: Exception) {
                ready = false
                message = error.message ?: "Não foi possível conectar ao NEVOZ."
            } finally { busy = false }
        }
    }

    LaunchedEffect(Unit) {
        busy = true
        try { loadAll() }
        catch (error: Exception) {
            ready = false
            message = error.message ?: "Não foi possível conectar ao NEVOZ."
        } finally { busy = false }
    }

    val pending = machines.any { it.state == "provisioning" || it.state == "starting" || it.state == "stopping" }
    LaunchedEffect(pending, ready) {
        while (ready && pending) {
            delay(5000)
            runCatching { machines = api.machines() }
        }
    }

    Scaffold(
        containerColor = Black,
        bottomBar = {
            NavigationBar(containerColor = Color(0xFF080E12), contentColor = Cyan) {
                NavigationBarItem(
                    selected = page == "home", onClick = { page = "home" },
                    icon = { Icon(Icons.Default.Home, null) }, label = { Text("Início") },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = Cyan, selectedTextColor = Cyan, indicatorColor = Color(0xFF12303A), unselectedIconColor = TextMuted, unselectedTextColor = TextMuted)
                )
                NavigationBarItem(
                    selected = page == "create", onClick = { page = "create" },
                    icon = { Icon(Icons.Default.Add, null) }, label = { Text("Novo PC") },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = Cyan, selectedTextColor = Cyan, indicatorColor = Color(0xFF12303A), unselectedIconColor = TextMuted, unselectedTextColor = TextMuted)
                )
            }
        }
    ) { inset ->
        Box(
            Modifier.fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color(0xFF091219), Black, Black)))
                .padding(inset)
        ) {
            Column(Modifier.fillMaxSize()) {
                TopHeader(onRefresh = { refresh() }, busy = busy)
                if (message.isNotBlank()) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(Modifier.size(7.dp).clip(CircleShape).background(if (ready && catalog?.providerReady == true && catalog?.consoleReady == true) Green else Cyan))
                        Text(message, color = TextMuted, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
                when (page) {
                    "create" -> CreatePage(
                        catalog = catalog,
                        busy = busy,
                        onCreate = { name, os, cpu, ram, disk, gpu ->
                            scope.launch {
                                busy = true
                                try {
                                    val created = api.createMachine(name, os, cpu, ram, disk, gpu)
                                    machines = listOf(created) + machines
                                    message = "Cloud PC enviado para criação. O disco ficará salvo no provedor."
                                    page = "home"
                                } catch (error: Exception) {
                                    message = error.message ?: "Não foi possível criar o Cloud PC."
                                } finally { busy = false }
                            }
                        }
                    )
                    else -> HomePage(
                        machines = machines,
                        catalog = catalog,
                        busy = busy,
                        onCreate = { page = "create" },
                        onRefresh = { refresh() },
                        onAction = { machine, action ->
                            scope.launch {
                                busy = true
                                try {
                                    val updated = api.action(machine.id, action)
                                    machines = machines.map { if (it.id == updated.id) updated else it }
                                    message = if (action == "start") "Ligando ${machine.name}…" else "Desligando ${machine.name}…"
                                } catch (error: Exception) {
                                    message = error.message ?: "Não foi possível executar o comando."
                                } finally { busy = false }
                            }
                        },
                        onDelete = { machine ->
                            scope.launch {
                                busy = true
                                try {
                                    api.delete(machine.id)
                                    machines = machines.filterNot { it.id == machine.id }
                                    message = "${machine.name} foi removido do provedor."
                                } catch (error: Exception) {
                                    message = error.message ?: "Não foi possível excluir o PC."
                                } finally { busy = false }
                            }
                        },
                        onConnect = { machineId ->
                            scope.launch {
                                busy = true
                                try {
                                    val url = api.connectUrl(machineId)
                                    context.startActivity(Intent(context, RemoteDesktopActivity::class.java).putExtra("remote_url", url))
                                } catch (error: Exception) {
                                    message = error.message ?: "Não foi possível abrir o Cloud PC."
                                } finally { busy = false }
                            }
                        }
                    )
                }
            }
            if (busy) LinearProgressIndicator(
                Modifier.fillMaxWidth().align(Alignment.TopCenter),
                color = Cyan,
                trackColor = Color.Transparent
            )
        }
    }
}

@Composable
private fun TopHeader(onRefresh: () -> Unit, busy: Boolean) {
    Row(
        Modifier.fillMaxWidth().padding(start = 17.dp, end = 10.dp, top = 9.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            painter = painterResource(R.drawable.nevoz_logo),
            contentDescription = "Logo NEVOZ SETUP",
            modifier = Modifier.size(58.dp).clip(RoundedCornerShape(13.dp)),
            contentScale = ContentScale.Crop
        )
        Column(Modifier.weight(1f).padding(start = 11.dp)) {
            Text("NEVOZ SETUP", color = TextMain, fontSize = 17.sp, fontWeight = FontWeight.Black, letterSpacing = 1.1.sp)
            Text("CLOUD PC", color = Cyan, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.2.sp)
        }
        IconButton(onClick = onRefresh, enabled = !busy) {
            Icon(Icons.Default.Refresh, contentDescription = "Atualizar", tint = Cyan)
        }
    }
}

@Composable
private fun HomePage(
    machines: List<CloudMachine>,
    catalog: Catalog?,
    busy: Boolean,
    onCreate: () -> Unit,
    onRefresh: () -> Unit,
    onAction: (CloudMachine, String) -> Unit,
    onDelete: (CloudMachine) -> Unit,
    onConnect: (String) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp)
    ) {
        item {
            HeroPanel(onCreate)
        }
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Seus computadores", color = TextMain, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text("Acesse seus PCs salvos na nuvem", color = TextMuted, fontSize = 11.sp)
                }
                Text("${machines.size} PC${if (machines.size == 1) "" else "s"}", color = Cyan, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
        if (machines.isEmpty()) {
            item { EmptyState(onCreate, catalog?.providerReady == true && catalog?.consoleReady == true) }
        } else {
            items(machines, key = { it.id }) { machine ->
                MachineCard(machine, onAction, onDelete, onConnect, busy)
            }
        }
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Surface),
                shape = RoundedCornerShape(17.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Stroke)
            ) {
                Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Cloud, null, tint = Cyan, modifier = Modifier.size(22.dp))
                    Column(Modifier.weight(1f).padding(start = 11.dp)) {
                        Text("Provedor NEVOZ", color = TextMain, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text(catalog?.providerMessage ?: "Conectando ao serviço…", color = TextMuted, fontSize = 10.sp)
                    }
                    val serviceReady = catalog?.providerReady == true && catalog?.consoleReady == true
                    Surface(color = if (serviceReady) Color(0xFF123A31) else Color(0xFF292D32), shape = CircleShape) {
                        Text(if (serviceReady) "ONLINE" else "CONFIGURAR", color = if (serviceReady) Green else TextMuted, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun HeroPanel(onCreate: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Surface2),
        shape = RoundedCornerShape(24.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF245365))
    ) {
        Box(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFF102C36), Color(0xFF0B151C), Color(0xFF0C1218))))) {
            Column(Modifier.padding(19.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Surface(color = Color(0xFF123642), shape = CircleShape) {
                    Text("SEU WINDOWS NA NUVEM", color = CyanSoft, fontSize = 9.sp, letterSpacing = 1.1.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp))
                }
                Text("Seu PC.\nEm qualquer lugar.", color = TextMain, fontSize = 27.sp, lineHeight = 31.sp, fontWeight = FontWeight.ExtraBold)
                Text("Crie seu computador virtual e continue de onde parou. Seus arquivos permanecem no disco do Cloud PC.", color = TextMuted, fontSize = 12.sp, lineHeight = 18.sp)
                Button(
                    onClick = onCreate,
                    modifier = Modifier.fillMaxWidth().height(49.dp),
                    shape = RoundedCornerShape(13.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Black)
                ) {
                    Icon(Icons.Default.Add, null)
                    Spacer(Modifier.width(7.dp))
                    Text("CRIAR MEU CLOUD PC", fontWeight = FontWeight.Black, letterSpacing = .4.sp)
                }
            }
        }
    }
}

@Composable
private fun EmptyState(onCreate: () -> Unit, providerReady: Boolean) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Surface),
        shape = RoundedCornerShape(20.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Stroke)
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Icon(if (providerReady) Icons.Default.Computer else Icons.Default.WifiOff, null, tint = Cyan, modifier = Modifier.size(35.dp))
            Text(if (providerReady) "Nenhum PC criado ainda" else "Aguardando o provedor", color = TextMain, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(
                if (providerReady) "Seu primeiro Cloud PC aparecerá aqui e continuará salvo depois que você sair do aplicativo."
                else "O aplicativo já está pronto, mas o servidor NEVOZ precisa estar publicado e conectado ao host KVM.",
                color = TextMuted, fontSize = 11.sp, lineHeight = 17.sp
            )
            if (providerReady) TextButton(onClick = onCreate) { Text("Criar primeiro PC", color = Cyan) }
        }
    }
}

@Composable
private fun MachineCard(
    machine: CloudMachine,
    onAction: (CloudMachine, String) -> Unit,
    onDelete: (CloudMachine) -> Unit,
    onConnect: (String) -> Unit,
    busy: Boolean
) {
    val running = machine.state.equals("running", true)
    val isProvisioning = machine.state in listOf("provisioning", "starting", "stopping")
    val stateColor = when {
        running -> Green
        isProvisioning -> Cyan
        machine.state == "error" -> Red
        else -> TextMuted
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = Surface),
        shape = RoundedCornerShape(20.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Stroke)
    ) {
        Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF102B35)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Computer, null, tint = Cyan, modifier = Modifier.size(24.dp))
                }
                Column(Modifier.weight(1f).padding(start = 11.dp)) {
                    Text(machine.name, color = TextMain, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(machine.os, color = TextMuted, fontSize = 10.sp)
                }
                Surface(color = stateColor.copy(alpha = .13f), shape = CircleShape, border = androidx.compose.foundation.BorderStroke(1.dp, stateColor.copy(alpha = .4f))) {
                    Text(machine.state.uppercase(), color = stateColor, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                SpecTile("CPU", "${machine.cpu} vCPU", Modifier.weight(1f))
                SpecTile("RAM", "${machine.ram} GB", Modifier.weight(1f))
                SpecTile("SSD", if (machine.disk >= 1000) "${machine.disk / 1000} TB" else "${machine.disk} GB", Modifier.weight(1f))
            }
            Text("GPU  ·  ${machine.gpu}", color = CyanSoft, fontSize = 11.sp)
            if (machine.errorMessage.isNotBlank()) Text(machine.errorMessage, color = Red, fontSize = 10.sp)
            Button(
                onClick = { onConnect(machine.id) },
                enabled = running && machine.connectionAvailable && !busy,
                modifier = Modifier.fillMaxWidth().height(46.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Black, disabledContainerColor = Color(0xFF1C2A31), disabledContentColor = TextMuted)
            ) {
                Text(if (!machine.connectionAvailable) "CONSOLE REMOTO INDISPONÍVEL" else "CONECTAR AO WINDOWS", fontWeight = FontWeight.Black, fontSize = 11.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(
                    onClick = { onAction(machine, if (running) "stop" else "start") },
                    enabled = machine.providerReady && !isProvisioning && !busy,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(11.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Stroke)
                ) {
                    Icon(Icons.Default.PowerSettingsNew, null, tint = Cyan, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (running) "Desligar" else "Ligar", color = TextMain, fontSize = 11.sp)
                }
                IconButton(onClick = { onDelete(machine) }, enabled = !busy && (machine.state == "error" || machine.providerReady)) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = "Excluir PC", tint = Red)
                }
            }
        }
    }
}

@Composable
private fun SpecTile(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(11.dp)).background(Surface2).padding(horizontal = 10.dp, vertical = 9.dp)) {
        Text(label, color = TextMuted, fontSize = 9.sp)
        Text(value, color = TextMain, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun CreatePage(
    catalog: Catalog?,
    busy: Boolean,
    onCreate: (String, String, Int, Int, Int, String) -> Unit
) {
    var name by remember { mutableStateOf("Meu NEVOZ PC") }
    var os by remember { mutableStateOf("windows-11-pro") }
    var cpu by remember { mutableIntStateOf(4) }
    var ram by remember { mutableIntStateOf(8) }
    var disk by remember { mutableIntStateOf(250) }
    var gpu by remember { mutableStateOf("none") }
    val osOptions = catalog?.os?.ifEmpty { defaultOs } ?: defaultOs
    val cpuOptions = catalog?.cpu?.ifEmpty { listOf(2, 4, 8, 16) } ?: listOf(2, 4, 8, 16)
    val ramOptions = catalog?.ram?.ifEmpty { listOf(4, 8, 16, 32, 64) } ?: listOf(4, 8, 16, 32, 64)
    val diskOptions = catalog?.disk?.ifEmpty { listOf(100, 250, 500, 1000, 2000) } ?: listOf(100, 250, 500, 1000, 2000)
    val gpuOptions = catalog?.gpus?.ifEmpty { listOf(GpuOption("none", "GPU não selecionada")) } ?: listOf(GpuOption("none", "GPU não selecionada"))
    val providerReady = catalog?.providerReady == true && catalog?.consoleReady == true

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 17.dp, vertical = 13.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("NOVO COMPUTADOR", color = Cyan, fontSize = 10.sp, letterSpacing = 1.8.sp, fontWeight = FontWeight.Black)
        Text("Monte seu Cloud PC", color = TextMain, fontSize = 25.sp, fontWeight = FontWeight.ExtraBold)
        Text("Escolha os recursos da máquina. O provedor NEVOZ cria o Windows e mantém o disco salvo no servidor.", color = TextMuted, fontSize = 11.sp, lineHeight = 17.sp)
        OutlinedTextField(
            value = name, onValueChange = { name = it.take(48) },
            label = { Text("Nome do computador") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(13.dp), colors = fieldColors()
        )
        SelectField("Edição do Windows", osOptions.map { it.first to it.second }, os) { os = it }
        SelectField("Processador", cpuOptions.map { it.toString() to "$it vCPU" }, cpu.toString()) { cpu = it.toInt() }
        SelectField("Memória RAM", ramOptions.map { it.toString() to "$it GB" }, ram.toString()) { ram = it.toInt() }
        SelectField("Armazenamento", diskOptions.map { it.toString() to if (it >= 1000) "${it / 1000} TB" else "$it GB" }, disk.toString()) { disk = it.toInt() }
        SelectField("Placa de vídeo", gpuOptions.map { it.id to it.label }, gpu) { gpu = it }
        Card(
            colors = CardDefaults.cardColors(containerColor = Surface),
            shape = RoundedCornerShape(14.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, Stroke)
        ) {
            Text(
                when {
                    catalog == null -> "Verificando o provedor NEVOZ…"
                    catalog?.providerReady == true && catalog?.consoleReady != true -> "O host está pronto. Configure o domínio HTTPS do provedor para liberar a conexão ao Windows."
                    else -> catalog?.providerMessage.orEmpty()
                },
                color = if (providerReady) CyanSoft else TextMuted,
                fontSize = 10.sp,
                lineHeight = 15.sp,
                modifier = Modifier.padding(13.dp)
            )
        }
        Button(
            onClick = { onCreate(name.trim(), os, cpu, ram, disk, gpu) },
            enabled = !busy && providerReady && name.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(51.dp),
            shape = RoundedCornerShape(13.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Black)
        ) {
            Text(if (busy) "CRIANDO COMPUTADOR…" else "CRIAR CLOUD PC", fontWeight = FontWeight.Black, letterSpacing = .5.sp)
        }
        Text("O Windows precisa estar instalado em uma imagem-base licenciada no servidor. Os recursos disponíveis dependem do hardware físico.", color = TextMuted, fontSize = 10.sp, lineHeight = 15.sp)
    }
}

private val defaultOs = listOf(
    "windows-11" to "Windows 11",
    "windows-11-pro" to "Windows 11 Pro",
    "windows-11-enterprise" to "Windows 11 Enterprise"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SelectField(label: String, options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val current = options.firstOrNull { it.first == selected }?.second ?: selected
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
        OutlinedTextField(
            value = current, onValueChange = {}, readOnly = true,
            label = { Text(label) }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth(), shape = RoundedCornerShape(13.dp),
            colors = fieldColors()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.second, color = TextMain) },
                    onClick = { onSelect(option.first); expanded = false }
                )
            }
        }
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Cyan,
    unfocusedBorderColor = Stroke,
    focusedLabelColor = Cyan,
    unfocusedLabelColor = TextMuted,
    focusedTextColor = TextMain,
    unfocusedTextColor = TextMain,
    cursorColor = Cyan,
    focusedContainerColor = Surface,
    unfocusedContainerColor = Surface
)
