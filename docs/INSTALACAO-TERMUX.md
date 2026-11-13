# Substituir o projeto no Termux

> Faça backup antes. Os comandos abaixo removem todos os arquivos do diretório `ezerGGPC`, exceto a pasta `.git`, para preservar o vínculo com o GitHub. Eles também removem `apps/web` e qualquer código antigo que esteja dentro desse diretório.

1. Baixe `NEVOZ-SETUP-v0.6.zip` para `~/storage/downloads/`.
2. No Termux, execute:

```bash
cd ~/projects/ezerGGPC
cp -r . ../ezerGGPC-backup-v05
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
unzip -o ~/storage/downloads/NEVOZ-SETUP-v0.6.zip -d .
git status
```

3. Revise os arquivos e envie a substituição:

```bash
git add -A
git commit -m "Substitui projeto pelo NEVOZ SETUP v0.6"
git push origin main
```

4. Abra GitHub → Actions e baixe o artifact `nevoz-setup-apk` quando a compilação ficar verde.

A pasta `.git` é preservada, por isso o novo projeto continua conectado ao repositório atual. O backup fica em `~/projects/ezerGGPC-backup-v05`. Não execute a remoção se houver alterações locais importantes que ainda não estejam no backup.
