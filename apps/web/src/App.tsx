import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowDownToLine, ArrowUpRight, Bell, Check, ChevronDown, CircleHelp,
  Cloud, Cpu, Database, Gamepad2, HardDrive, LayoutDashboard, LoaderCircle, LogOut,
  Menu, Monitor, MoreHorizontal, Plus, Power, RefreshCw, Rocket, Server, Settings,
  ShieldCheck, Sparkles, SquareTerminal, Wifi, X, Zap,
} from 'lucide-react'
import { api, clearToken, getToken, saveToken, type Capacity, type CloudPC, type User } from './lib/api'

type Toast = { kind: 'success' | 'error' | 'info'; message: string }

function formatStorage(gb: number) { return gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB` }
function osLabel(os: string) { return os === 'windows-11-pro' ? 'Windows 11 Pro' : os === 'windows-11-enterprise' ? 'Windows 11 Enterprise' : 'Windows 11' }
function statusLabel(status: string) {
  const labels: Record<string, string> = { RUNNING: 'Ligado', STOPPED: 'Desligado', CREATING: 'Criando', STARTING: 'Iniciando', STOPPING: 'Desligando', FAILED: 'Falha', CONNECTED: 'Conectado', DISCONNECTED: 'Desconectado' }
  return labels[status] || status
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [pcs, setPcs] = useState<CloudPC[]>([])
  const [capacity, setCapacity] = useState<Capacity | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedPC, setSelectedPC] = useState<CloudPC | null>(null)
  const [mobileNav, setMobileNav] = useState(false)

  const notify = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    setToast({ message, kind })
    window.setTimeout(() => setToast(null), 5200)
  }, [])

  const refresh = useCallback(async () => {
    const [nextPCs, nextCapacity] = await Promise.all([api.listPCs(), api.capacity()])
    setPcs(nextPCs)
    setCapacity(nextCapacity)
  }, [])

  useEffect(() => {
    let live = true
    async function bootstrap() {
      if (!getToken()) { if (live) setLoading(false); return }
      try {
        const me = await api.me()
        if (!live) return
        setUser(me)
        const [nextPCs, nextCapacity] = await Promise.all([api.listPCs(), api.capacity()])
        if (!live) return
        setPcs(nextPCs); setCapacity(nextCapacity)
      } catch (error) {
        clearToken()
        if (live) notify((error as Error).message, 'error')
      } finally { if (live) setLoading(false) }
    }
    bootstrap()
    return () => { live = false }
  }, [notify])

  const activeCount = pcs.filter(pc => pc.status === 'RUNNING' || pc.status === 'CONNECTED').length
  const totalStorage = pcs.reduce((sum, pc) => sum + pc.storage_gb, 0)

  async function handleAuth(data: { email: string; password: string; display_name?: string }) {
    setBusy('auth')
    try {
      const result = authMode === 'login'
        ? await api.login({ email: data.email, password: data.password })
        : await api.register({ email: data.email, password: data.password, display_name: data.display_name || 'Usuário EZERGG' })
      saveToken(result.access_token); setUser(result.user)
      await refresh(); notify('Bem-vindo ao EZERGG PC.', 'success')
    } catch (error) { notify((error as Error).message, 'error') }
    finally { setBusy(null); setLoading(false) }
  }

  async function handleCreate(data: { name: string; os_image: string; cpu_cores: number; ram_gb: number; storage_gb: number; gpu_sku: string }) {
    setBusy('create')
    try {
      const pc = await api.createPC(data)
      setPcs(current => [pc, ...current]); setShowCreate(false)
      notify(capacity?.mode === 'demo' ? 'Cloud PC de demonstração criado. Nenhuma VM física foi provisionada.' : 'Solicitação de criação enviada.', 'success')
    } catch (error) { notify((error as Error).message, 'error') }
    finally { setBusy(null) }
  }

  async function action(pc: CloudPC, kind: 'start' | 'stop' | 'restart' | 'connect' | 'delete') {
    setBusy(`${kind}-${pc.id}`)
    try {
      if (kind === 'start') { const updated = await api.startPC(pc.id); setPcs(list => list.map(item => item.id === pc.id ? updated : item)); notify('Solicitação de inicialização concluída.', 'success') }
      if (kind === 'stop') { const updated = await api.stopPC(pc.id); setPcs(list => list.map(item => item.id === pc.id ? updated : item)); notify('Cloud PC desligado. Os discos associados permanecem cadastrados.', 'success') }
      if (kind === 'restart') { const updated = await api.restartPC(pc.id); setPcs(list => list.map(item => item.id === pc.id ? updated : item)); notify('Reinicialização solicitada.', 'success') }
      if (kind === 'connect') { const result = await api.connectPC(pc.id); if (result.stream_url) window.open(result.stream_url, '_blank', 'noopener,noreferrer'); notify(result.message, 'info') }
      if (kind === 'delete') { await api.deletePC(pc.id); setPcs(list => list.filter(item => item.id !== pc.id)); setSelectedPC(null); notify('Registro do Cloud PC removido.', 'success') }
    } catch (error) { notify((error as Error).message, 'error') }
    finally { setBusy(null) }
  }

  function logout() { clearToken(); setUser(null); setPcs([]); setCapacity(null); setSelectedPC(null) }

  if (loading) return <div className="boot"><div className="brand-mark"><Cloud size={25}/></div><LoaderCircle className="spin" size={20}/><span>Preparando seu espaço...</span></div>
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={handleAuth} busy={busy === 'auth'} toast={toast} />

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark"><Cloud size={22}/></div><div><strong>EZERGG<span>PC</span></strong><small>CLOUD COMPUTING</small></div><button className="icon-btn mobile-close" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={19}/></button></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav">
          <button className="nav-item active"><LayoutDashboard size={18}/> Visão geral</button>
          <button className="nav-item" onClick={() => setShowCreate(true)}><Monitor size={18}/> Meus Cloud PCs <span className="nav-count">{pcs.length}</span></button>
          <button className="nav-item" onClick={() => notify('A área de planos e pagamentos será adicionada em uma próxima etapa.', 'info')}><Zap size={18}/> Planos e uso</button>
        </nav>
        <div className="workspace-label support-label">SUPORTE</div>
        <nav className="side-nav">
          <button className="nav-item" onClick={() => notify('A central de suporte ainda não está conectada.', 'info')}><CircleHelp size={18}/> Central de ajuda</button>
          <button className="nav-item" onClick={() => notify('Configurações de perfil serão adicionadas em uma próxima etapa.', 'info')}><Settings size={18}/> Configurações</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><ShieldCheck size={17}/></div><strong>Seus dados, sob seu controle</strong><p>O projeto separa o ciclo de vida da VM dos dados persistentes.</p><a href="https://github.com" target="_blank" rel="noreferrer">Saiba mais <ArrowUpRight size={13}/></a></div>
          <div className="user-mini"><div className="avatar">{user.display_name.slice(0, 1).toUpperCase()}</div><div className="user-mini-text"><strong>{user.display_name}</strong><span>{user.email}</span></div><button className="icon-btn" aria-label="Sair" onClick={logout}><LogOut size={17}/></button></div>
        </div>
      </aside>
      {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Fechar menu"/>}
      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={20}/></button><div className="breadcrumb">Workspace <span>/</span> <b>Visão geral</b></div></div><div className="topbar-right"><div className={`environment-pill ${capacity?.mode === 'demo' ? 'demo' : 'live'}`}><span/> {capacity?.mode === 'demo' ? 'AMBIENTE DEMO' : 'PROVIDER CONECTADO'}</div><button className="icon-btn notification-btn" onClick={() => notify('Você está em dia. Não há novas notificações.', 'info')} aria-label="Notificações"><Bell size={18}/></button><div className="top-avatar">{user.display_name.slice(0, 1).toUpperCase()}</div></div></header>
        <div className="page-content">
          <section className="welcome-row"><div><div className="eyebrow"><Sparkles size={14}/> SEU COMPUTADOR NA NUVEM</div><h1>Bem-vindo de volta, <span>{user.display_name.split(' ')[0]}.</span></h1><p>Gerencie seus computadores e continue de onde parou.</p></div><button className="primary-btn" onClick={() => setShowCreate(true)}><Plus size={18}/> Criar Cloud PC</button></section>
          {capacity?.mode === 'demo' && <div className="notice-banner"><div className="notice-icon"><Activity size={18}/></div><div><strong>Modo demonstração ativo</strong><p>O painel e a API estão funcionando, mas as operações de VM são simuladas. Nenhum servidor, GPU ou disco físico foi provisionado.</p></div><span className="notice-tag">DEMO</span></div>}
          <section className="stats-grid">
            <StatCard icon={<Monitor size={18}/>} label="Cloud PCs" value={String(pcs.length).padStart(2, '0')} foot={`${activeCount} ligados agora`} accent="blue"/>
            <StatCard icon={<Activity size={18}/>} label="Em execução" value={String(activeCount).padStart(2, '0')} foot="Instâncias ativas" accent="green"/>
            <StatCard icon={<Database size={18}/>} label="Storage alocado" value={formatStorage(totalStorage)} foot="Discos registrados" accent="purple"/>
            <StatCard icon={<Wifi size={18}/>} label="Região" value={capacity?.region === 'demo' ? 'Demo' : capacity?.region || '—'} foot={capacity?.verified ? 'Capacidade verificada' : 'Não verificada'} accent="orange"/>
          </section>
          <section className="section-block"><div className="section-heading"><div><h2>Meus Cloud PCs</h2><p>Seus ambientes virtuais em um só lugar.</p></div><button className="text-btn" onClick={() => refresh().catch(error => notify((error as Error).message, 'error'))}><RefreshCw size={15}/> Atualizar</button></div>
            {pcs.length === 0 ? <div className="empty-state"><div className="empty-art"><div className="empty-orbit orbit-one"/><div className="empty-orbit orbit-two"/><div className="empty-icon"><Monitor size={30}/></div><span className="float-dot dot-one"/><span className="float-dot dot-two"/></div><h3>Seu primeiro Cloud PC começa aqui</h3><p>Configure CPU, memória, armazenamento e sistema operacional para montar seu ambiente.</p><button className="primary-btn" onClick={() => setShowCreate(true)}><Plus size={17}/> Criar meu PC</button></div> : <div className="pc-grid">{pcs.map(pc => <PCPanel key={pc.id} pc={pc} busy={busy?.endsWith(pc.id) ? busy.split('-')[0] : null} onAction={action} onSelect={() => setSelectedPC(pc)}/>)}</div>}
          </section>
          <section className="bottom-grid"><div className="info-panel"><div className="panel-icon blue-icon"><HardDrive size={18}/></div><div><h3>Armazenamento persistente</h3><p>O modelo de dados mantém a configuração do Cloud PC separada do ciclo de vida da computação. A implementação de volumes reais será ativada com o provider de infraestrutura.</p><span className="panel-link">Arquitetura de storage <ArrowUpRight size={13}/></span></div></div><div className="info-panel"><div className="panel-icon violet-icon"><Gamepad2 size={18}/></div><div><h3>Streaming de baixa latência</h3><p>A interface está preparada para o gateway de streaming. A emissão de tickets de sessão e a transmissão ainda exigem um serviço externo configurado.</p><span className="panel-link">Ver plano de streaming <ArrowUpRight size={13}/></span></div></div></section>
          <footer className="footer"><span>© 2026 EZERGG PC</span><span>Construído para seu espaço digital.</span><span className="footer-status"><i/> API conectada</span></footer>
        </div>
      </main>
      {showCreate && capacity && <CreateModal capacity={capacity} busy={busy === 'create'} onClose={() => setShowCreate(false)} onCreate={handleCreate}/>}
      {selectedPC && <DetailsModal pc={pcs.find(item => item.id === selectedPC.id) || selectedPC} busy={Boolean(busy)} onClose={() => setSelectedPC(null)} onAction={action}/>}
      {toast && <div className={`toast toast-${toast.kind}`}><span>{toast.kind === 'success' ? <Check size={17}/> : toast.kind === 'error' ? <X size={17}/> : <Bell size={17}/>}</span>{toast.message}<button onClick={() => setToast(null)} aria-label="Fechar aviso"><X size={15}/></button></div>}
    </div>
  )
}

function StatCard({ icon, label, value, foot, accent }: { icon: ReactNode; label: string; value: string; foot: string; accent: string }) {
  return <div className="stat-card"><div className={`stat-icon ${accent}`}>{icon}</div><span className="stat-label">{label}</span><strong>{value}</strong><small>{foot}</small></div>
}

function AuthScreen({ mode, setMode, onSubmit, busy, toast }: { mode: 'login' | 'register'; setMode: (mode: 'login' | 'register') => void; onSubmit: (data: { email: string; password: string; display_name?: string }) => void; busy: boolean; toast: Toast | null }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('')
  function submit(event: FormEvent) { event.preventDefault(); onSubmit({ email, password, display_name: name }) }
  return <div className="auth-screen"><div className="auth-glow glow-a"/><div className="auth-glow glow-b"/><div className="auth-left"><div className="brand-lockup"><div className="brand-mark"><Cloud size={23}/></div><div><strong>EZERGG<span>PC</span></strong><small>CLOUD COMPUTING</small></div></div><div className="auth-pitch"><div className="eyebrow"><Sparkles size={14}/> YOUR SPACE. YOUR RULES.</div><h1>Seu PC.<br/><span>Sem fronteiras.</span></h1><p>Um computador na nuvem, pronto para acompanhar suas ideias de qualquer lugar.</p><div className="auth-feature"><div><Cpu size={17}/></div><span><b>Hardware configurável</b><small>Escolha a configuração do seu ambiente.</small></span></div><div className="auth-feature"><div><HardDrive size={17}/></div><span><b>Seu espaço persistente</b><small>Arquitetura preparada para manter seus dados.</small></span></div><div className="auth-feature"><div><Wifi size={17}/></div><span><b>Acesso de qualquer lugar</b><small>Painel web e aplicativo Android.</small></span></div></div><div className="auth-foot">© 2026 EZERGG PC · CLOUD COMPUTING</div></div><div className="auth-right"><form className="auth-card" onSubmit={submit}><div className="auth-card-top"><span className="auth-card-icon"><Cloud size={22}/></span><span className="secure-label"><ShieldCheck size={14}/> CONEXÃO SEGURA</span></div><h2>{mode === 'login' ? 'Que bom ter você de volta.' : 'Crie sua conta.'}</h2><p>{mode === 'login' ? 'Entre para acessar seu espaço na nuvem.' : 'Comece a montar seu computador virtual.'}</p>{mode === 'register' && <label>Seu nome<input value={name} onChange={e => setName(e.target.value)} placeholder="Como podemos chamar você?" required minLength={2}/></label>}<label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" required autoComplete="email"/></label><label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 10 caracteres" required minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/></label><button className="primary-btn auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : mode === 'login' ? <ArrowUpRight size={17}/> : <Rocket size={17}/>} {mode === 'login' ? 'Entrar na plataforma' : 'Criar minha conta'}</button><div className="auth-switch">{mode === 'login' ? 'Ainda não tem uma conta?' : 'Já possui uma conta?'} <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Criar conta' : 'Fazer login'}</button></div>{toast && <div className={`inline-message ${toast.kind}`}>{toast.message}</div>}<div className="auth-legal">Ao continuar, você concorda com os termos de uso e a política de privacidade.</div></form></div></div>
}

function PCPanel({ pc, busy, onAction, onSelect }: { pc: CloudPC; busy: string | null; onAction: (pc: CloudPC, kind: 'start' | 'stop' | 'restart' | 'connect' | 'delete') => void; onSelect: () => void }) {
  const running = pc.status === 'RUNNING' || pc.status === 'CONNECTED'
  return <article className="pc-card"><div className="pc-card-top"><div className="pc-device-icon"><Monitor size={22}/></div><div className="pc-card-actions"><span className={`status-chip ${running ? 'is-running' : pc.status === 'FAILED' ? 'is-error' : ''}`}><i/>{statusLabel(pc.status)}</span><button className="icon-btn" onClick={onSelect} aria-label="Detalhes"><MoreHorizontal size={19}/></button></div></div><div className="pc-card-title"><h3>{pc.name}</h3><span>{osLabel(pc.os_image)}</span></div><div className="pc-specs"><div><Cpu size={14}/><b>{pc.cpu_cores}</b><small>vCPU</small></div><div><Activity size={14}/><b>{pc.ram_gb} GB</b><small>RAM</small></div><div><HardDrive size={14}/><b>{formatStorage(pc.storage_gb)}</b><small>SSD</small></div></div><div className="pc-gpu-line"><span><Zap size={14}/>{pc.gpu_sku === 'none' ? 'Sem GPU dedicada' : pc.gpu_sku}</span><span>{pc.is_demo ? 'DEMO' : 'PROVIDER'}</span></div>{pc.last_error && <p className="pc-error">{pc.last_error}</p>}<div className="pc-card-footer">{running ? <><button className="connect-btn" disabled={busy !== null} onClick={() => onAction(pc, 'connect')}><Monitor size={15}/> Conectar</button><button className="stop-btn" disabled={busy !== null} onClick={() => onAction(pc, 'stop')} title="Desligar">{busy === 'stop' ? <LoaderCircle className="spin" size={16}/> : <Power size={16}/>}</button></> : <button className="start-btn" disabled={busy !== null || pc.status === 'CREATING'} onClick={() => onAction(pc, 'start')}>{busy === 'start' ? <LoaderCircle className="spin" size={16}/> : <Power size={16}/>} Iniciar PC</button>}<button className="details-btn" onClick={onSelect}>Detalhes <ArrowUpRight size={14}/></button></div></article>
}

function CreateModal({ capacity, busy, onClose, onCreate }: { capacity: Capacity; busy: boolean; onClose: () => void; onCreate: (data: { name: string; os_image: string; cpu_cores: number; ram_gb: number; storage_gb: number; gpu_sku: string }) => void }) {
  const [name, setName] = useState('Meu EZERGG PC')
  const [os, setOs] = useState(capacity.os_images[0] || 'windows-11')
  const [cpu, setCpu] = useState(capacity.cpu_profiles.includes(4) ? 4 : capacity.cpu_profiles[0] || 2)
  const [ram, setRam] = useState(capacity.ram_profiles.includes(16) ? 16 : capacity.ram_profiles[0] || 8)
  const [storage, setStorage] = useState(1024)
  const [gpu, setGpu] = useState(capacity.gpu_profiles[0]?.id || 'none')
  const gpuOptions = capacity.gpu_profiles.filter(item => item.available)
  const canCreate = capacity.mode === 'demo' || (capacity.verified && capacity.os_images.includes(os) && capacity.cpu_profiles.includes(cpu) && capacity.ram_profiles.includes(ram))
  function submit(event: FormEvent) { event.preventDefault(); onCreate({ name, os_image: os, cpu_cores: cpu, ram_gb: ram, storage_gb: storage, gpu_sku: gpu }) }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><form className="create-modal" onSubmit={submit}><div className="modal-header"><div><div className="eyebrow"><Sparkles size={13}/> CONFIGURAÇÃO PERSONALIZADA</div><h2>Monte seu PC</h2><p>Escolha os recursos do seu ambiente virtual.</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar"><X size={19}/></button></div>{!capacity.verified && <div className="modal-warning"><Activity size={16}/><span>Catálogo de demonstração. A disponibilidade de hardware físico ainda não foi verificada.</span></div>}<label className="field-label">Nome do computador<input className="form-control" value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80}/></label><div className="form-section-label">SISTEMA OPERACIONAL</div><div className="os-options">{capacity.os_images.map(item => <button type="button" key={item} className={`os-option ${os === item ? 'selected' : ''}`} onClick={() => setOs(item)}><span className="windows-mark">⊞</span><span><b>{osLabel(item)}</b><small>{item === 'windows-11' ? 'Uso pessoal' : item === 'windows-11-pro' ? 'Recursos profissionais' : 'Ambientes empresariais'}</small></span>{os === item && <Check size={16}/>}</button>)}</div><div className="form-section-label">HARDWARE</div><div className="form-grid"><label className="field-label">Processador<select className="form-control" value={cpu} onChange={e => setCpu(Number(e.target.value))}>{capacity.cpu_profiles.map(value => <option key={value} value={value}>{value} vCPU</option>)}</select></label><label className="field-label">Memória RAM<select className="form-control" value={ram} onChange={e => setRam(Number(e.target.value))}>{capacity.ram_profiles.map(value => <option key={value} value={value}>{value} GB</option>)}</select></label><label className="field-label">Armazenamento<select className="form-control" value={storage} onChange={e => setStorage(Number(e.target.value))}>{[1024, 2048].map(value => <option key={value} value={value}>{value / 1024} TB SSD</option>)}</select></label><label className="field-label">Placa de vídeo<select className="form-control" value={gpu} onChange={e => setGpu(e.target.value)}>{gpuOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div><div className="modal-footer"><div className="estimate"><span>CONFIGURAÇÃO</span><b>{cpu} vCPU · {ram} GB · {formatStorage(storage)}</b></div><button className="primary-btn" disabled={busy || !name.trim() || !canCreate}>{busy ? <LoaderCircle className="spin" size={17}/> : <Rocket size={17}/>} Criar Cloud PC</button></div><p className="modal-footnote">A criação real exige provider de infraestrutura, imagem Windows licenciada e storage pool configurados.</p></form></div>
}

function DetailsModal({ pc, busy, onClose, onAction }: { pc: CloudPC; busy: boolean; onClose: () => void; onAction: (pc: CloudPC, kind: 'start' | 'stop' | 'restart' | 'connect' | 'delete') => void }) {
  const running = pc.status === 'RUNNING' || pc.status === 'CONNECTED'
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="details-modal"><div className="modal-header"><div><div className="eyebrow">EZERGG PC / DETALHES</div><h2>{pc.name}</h2><p>{osLabel(pc.os_image)} · Criado em {new Date(pc.created_at).toLocaleDateString('pt-BR')}</p></div><button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={19}/></button></div><div className="details-status"><span className={`status-chip ${running ? 'is-running' : ''}`}><i/>{statusLabel(pc.status)}</span><span className="muted-tag">{pc.provider_name.toUpperCase()} {pc.is_demo ? '· DEMONSTRAÇÃO' : ''}</span></div><div className="detail-spec-grid"><div><Cpu size={17}/><span>Processador</span><b>{pc.cpu_cores} vCPU</b></div><div><Activity size={17}/><span>Memória</span><b>{pc.ram_gb} GB RAM</b></div><div><HardDrive size={17}/><span>Armazenamento</span><b>{formatStorage(pc.storage_gb)} SSD</b></div><div><Zap size={17}/><span>GPU</span><b>{pc.gpu_sku}</b></div></div><div className="details-note"><ShieldCheck size={17}/><p>O registro da máquina é persistido no banco. A persistência física do disco e o boot de Windows dependem do provider e do provisionador configurados.</p></div><div className="details-actions">{running ? <><button className="connect-btn" disabled={busy} onClick={() => onAction(pc, 'connect')}><Monitor size={16}/> Conectar</button><button className="stop-btn" disabled={busy} onClick={() => onAction(pc, 'stop')}><Power size={16}/> Desligar</button><button className="secondary-btn" disabled={busy} onClick={() => onAction(pc, 'restart')}><RefreshCw size={16}/> Reiniciar</button></> : <button className="start-btn" disabled={busy} onClick={() => onAction(pc, 'start')}><Power size={16}/> Iniciar PC</button>}</div><div className="danger-zone"><div><b>Excluir Cloud PC</b><span>Remove o registro. O provider deve aplicar sua política de retenção de discos.</span></div><button className="danger-btn" disabled={busy || running} onClick={() => { if (window.confirm('Excluir este Cloud PC? Esta ação não pode ser desfeita.')) onAction(pc, 'delete') }}>Excluir</button></div></div></div>
}
