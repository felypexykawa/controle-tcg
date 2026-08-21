# Medições — números do app que viram decisão

Esta pasta existe por causa de uma trava da casa (GATE-5) e de um achado da revisão
adversarial de 2026-08-21: eu tinha entregado ao dono um número que ia virar decisão de
**gastar dinheiro** ("o leitor de fotos acerta 0 de 16") e o banco de teste que produziu o
número foi apagado logo depois — nada era refazível a partir do disco.

**Regra:** número sobre o comportamento do app que chegue ao dono como base de decisão deixa
aqui (a) a verdade-chão usada, (b) a saída CRUA da máquina, item a item, e (c) o script que
refaz. Sem isso o número é palavra.

**O que NÃO fica aqui:** as fotos do dono. São pessoais e pesadas. Os arquivos de medição
citam o nome de cada foto, então a rodada é refazível se ele reenviar o mesmo lote.

## Arquivos

- `leitor-fotos-20260821.json` — as 16 fotos de carta, com o código real (lido a olho),
  a saída bruta do OCR, a confiança e o que a cadeia de padrões extraiu.
- `leitor-fotos-20260821.js` — o script que refaz a rodada. Uso: servir a pasta do app,
  colocar as fotos em `_tf/` em resolução nativa, abrir o app e colar o script no console.
