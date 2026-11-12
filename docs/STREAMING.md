# Streaming

A rota `POST /cloud-pcs/{id}/connect` valida propriedade e estado do PC, mas ainda não emite sessão. Sem `STREAMING_URL`, retorna 503. Mesmo com variável configurada, responde 501 até existir emissor de tickets autenticado. Isso evita que uma URL compartilhada seja confundida com autorização de sessão.

## Arquitetura alvo

Browser/Capacitor → EZERGG Session Gateway → streaming broker → encoder/VM → Windows desktop.

O gateway precisa:

- validar token EZERGG e ownership do Cloud PC;
- emitir ticket curto, um PC, uma sessão e permissões específicas;
- negociar WebRTC ou protocolo remoto escolhido;
- transportar vídeo e áudio com criptografia;
- encaminhar teclado, mouse, clipboard e gamepad por canal autenticado;
- invalidar sessão no logout, stop e revogação;
- medir RTT, jitter, perda, bitrate, resolução e FPS.

## Estratégia

Começar com gateway RDP baseado em navegador para desktop/trabalho. Para jogos, avaliar pipeline WebRTC/QUIC com encoder por GPU. Medir latência de ponta a ponta, não apenas ping do servidor. H.264/H.265/AV1 só devem ser anunciados conforme encoder, cliente, navegador e licença/codec suportarem.

## Métricas

`session_connect_seconds`, `stream_rtt_ms`, `stream_jitter_ms`, `stream_packet_loss_ratio`, `stream_bitrate_bps`, `stream_fps`, `encoder_queue_ms`, `input_to_photon_ms`, `reconnect_count`.
