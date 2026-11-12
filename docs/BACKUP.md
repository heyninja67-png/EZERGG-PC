# Backup e snapshots

A entidade de volume já está separada de `CloudPC`, mas o mecanismo físico de snapshot/backup não está implementado.

## Política recomendada

- snapshots consistentes com aplicação ou VSS para Windows;
- backups criptografados em storage separado do host e região primários;
- retenção configurável por plano;
- RPO/RTO publicados e testados;
- teste regular de restauração em ambiente isolado;
- checksums, imutabilidade/Object Lock quando disponível e alertas de falha.

## Restore

Restaurar para um novo volume ou nova versão, validar integridade e só então anexar à VM. Nunca sobrescrever o único volume saudável sem confirmação. Registrar quem solicitou, snapshot usado, horário e resultado.
