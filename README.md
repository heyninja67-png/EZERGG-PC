# EZERGG PC

**Seu PC completo na nuvem. Acesse de qualquer lugar.**

Monorepo inicial do EZERGG PC: painel web/mobile compartilhado (React + Vite + Capacitor), API FastAPI, PostgreSQL, Redis, adaptadores de infraestrutura e workflows de CI/APK.

> **Estado real desta entrega:** é uma base de MVP executável para autenticação, dashboard, cadastro de Cloud PCs, registro de volumes persistentes e ciclo de vida demonstrativo. O provider padrão é `mock`: ele simula estados e não cria VMs, GPUs, discos ou Windows físicos. O adaptador `libvirt` lê capacidade básica e controla domínios KVM já existentes, mas o provisionamento automático de Windows ainda está bloqueado intencionalmente. O streaming também exige um gateway externo e tickets de sessão seguros.

## O que está incluído

- Cadastro, login, JWT e hash de senha com `scrypt`.
- API FastAPI com isolamento de Cloud PCs por usuário.
- PostgreSQL e Redis via Docker Compose.
- Modelos para usuários, Cloud PCs, volumes persistentes e auditoria.
- Catálogo de CPU/RAM/GPU/OS/storage fornecido pelo backend; frontend não inventa capacidade.
- Provider `mock` para desenvolvimento e testes.
- Adaptador inicial `libvirt` para inspeção do host e controle de VMs pré-existentes.
- Dashboard dark responsivo, criação e gerenciamento básico de Cloud PCs.
- App Android via Capacitor 8.5.3, compartilhando o frontend.
- GitHub Actions para CI e geração automática de APK debug.
- Documentação de arquitetura, API, segurança e dependências físicas.

## Estrutura

```text
EZERGG-PC/
├── .github/workflows/
│   ├── ci.yml
│   └── build-apk.yml
├── apps/
│   ├── api/                 # FastAPI + SQLAlchemy
│   └── web/                 # React + Vite + Capacitor
├── docs/                    # Documentação técnica
├── scripts/                 # Scripts locais e CI
├── .env.example
└── docker-compose.yml
```

## Requisitos

- Docker Engine + Docker Compose plugin.
- Python 3.12 para executar a API localmente (ou Docker).
- Node.js 24 e npm para o frontend/Capacitor.
- Para compilar Android localmente: Android SDK, Android Studio compatível com Capacitor 8 e JDK 21.
- Para Cloud PC real: host KVM/libvirt, storage persistente, rede, imagem Windows licenciada e gateway de streaming configurado.

Capacitor oficialmente suporta Web, Android e iOS; a geração de APK deste repositório usa o projeto Android criado pelo Capacitor. Consulte a documentação oficial para os requisitos de ambiente: <https://capacitorjs.com/docs/getting-started/environment-setup>.

## 1. Iniciar API, PostgreSQL e Redis

```bash
cp .env.example .env
# Edite JWT_SECRET e POSTGRES_PASSWORD antes de expor qualquer serviço.
docker compose up --build -d
```

Verifique:

```bash
curl http://localhost:8000/health
```

Documentação interativa da API: <http://localhost:8000/docs>.

O compose inicia `PROVIDER=mock`. Esta configuração é proposital para desenvolvimento local e não deve ser apresentada como Cloud PC real. O adapter `libvirt` precisa executar em um worker/host com acesso local e restrito ao socket libvirt; não basta trocar a variável dentro do container sem preparar essa integração.

## 2. Iniciar o frontend

Em outro terminal:

```bash
cd apps/web
npm install
cp ../../.env.example .env.local
npm run dev
```

Acesse <http://localhost:5173>.

O projeto não inclui `package-lock.json` nesta primeira entrega porque o ambiente de montagem não conseguiu alcançar o npm registry. Os workflows usam `npm install` (não `npm ci`) e instalam as versões permitidas pelo `package.json`; após o primeiro `npm install` local, versione o `package-lock.json` e troque os workflows para `npm ci` para builds reproduzíveis.


```bash
```

Não use uma API HTTP pública sem TLS. O `capacitor.config.ts` não habilita mixed content.

## 3. Gerar APK pelo GitHub Actions

1. Crie um repositório GitHub e envie todo o conteúdo desta pasta.
3. Abra **Actions → Build Android APK → Run workflow**.
4. Quando terminar, abra a execução e baixe o artefato `EZERGG-PC-Android-APK`.
5. O arquivo será `EZERGG-PC-debug.apk`.

Também é possível disparar o workflow enviando uma tag `v*`.

O workflow instala Node 24/JDK 21/Android SDK, compila o frontend, cria/sincroniza a plataforma Android e executa `assembleDebug`. O APK debug é adequado para testes e instalação manual. Para publicar na Play Store ou distribuir uma versão de produção, configure keystore, assinatura, versionamento, política de privacidade e build `release`.

### Build local do APK

```bash
cd apps/web
npm install
npm run build
npx cap add android       # somente na primeira vez
npx cap sync android
cd android
./gradlew assembleDebug
```

APK local: `apps/web/android/app/build/outputs/apk/debug/app-debug.apk`.

## 4. Testar a API

```bash
cd apps/api
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows PowerShell:
# .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
pytest -q
uvicorn app.main:app --reload --port 8000
```

Para executar sem PostgreSQL em desenvolvimento, a API usa SQLite como padrão local quando `DATABASE_URL` não é definida. Em Docker Compose, usa PostgreSQL.

## Variáveis importantes

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Banco SQLAlchemy |
| `JWT_SECRET` | Assinatura dos tokens; trocar em produção |
| `CORS_ORIGINS` | Origens autorizadas |
| `PROVIDER` | `mock` ou `libvirt` |
| `LIBVIRT_URI` | URI de conexão libvirt |
| `STREAMING_URL` | Endereço informativo de gateway; não ativa conexão por si só |
| `AUTO_CREATE_DB` | Criação de tabelas para MVP; usar migrations em produção |

## Limitações conhecidas desta entrega

1. `mock` simula lifecycle e capacidade. A interface mostra banner DEMO.
2. `libvirt` ainda não clona imagens, configura unattended install, drivers VirtIO, GPU passthrough ou volumes de bloco.
3. O sistema guarda um registro independente de volume persistente, mas criação/anexação física do volume ainda depende do provider.
4. A rota de conexão não entrega link fictício: responde `503` sem gateway ou `501` enquanto o emissor seguro de tickets não existir.
5. O painel de administrador, billing, snapshots/restore, MFA, notificações, multi-região e apps nativos dedicados são etapas futuras.
6. `Base.metadata.create_all` é usado apenas para acelerar o MVP. Configure Alembic e migrações antes de produção.
7. O fluxo de Windows depende de licenças Microsoft apropriadas para o modelo comercial e de imagens obtidas legalmente.

Consulte `docs/ROADMAP.md` e `docs/INFRASTRUCTURE.md` antes de tentar usar o provider real.
