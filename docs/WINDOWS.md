# Windows provisioning e licenciamento

O código não redistribui ISO, imagem, chave ou ativador do Windows. O operador deve adquirir e comprovar direitos adequados para a forma de serviço oferecida e usar mídia oficial/licenciada.

Antes de criar imagens Windows 11/Pro/Enterprise, valide diretamente com a Microsoft ou revendedor autorizado:

- quem é o usuário/licenciado;
- se o modelo é dedicado ou multi-tenant;
- direitos de virtualização e acesso remoto;
- requisitos de Windows Enterprise/VDA/Microsoft 365 quando aplicáveis;
- elegibilidade do provedor/outsourcer e condições de terceiros;
- ativação, reassociação e limites por dispositivo/usuário.

## Pipeline futuro

1. Selecionar imagem aprovada e hash.
2. Criar volume de sistema persistente e volume de dados conforme plano.
3. Clonar template base de origem permitida.
4. Injetar drivers VirtIO assinados e configuração unattended segura.
5. Definir vCPU, RAM, disco e rede via provider.
6. Associar GPU apenas se inventário e licença permitirem.
7. Primeiro boot, ativação autorizada e atualização.
8. Registrar agente, certificados e telemetria.
9. Aguardar health check do SO e do gateway.
10. Marcar READY apenas após todas as condições.

Não inserir product keys em repositório, logs, cloud-init ou imagens públicas. Não armazenar senha do usuário em texto puro.
