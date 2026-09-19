#!/bin/sh
# TRAVA DO NUCLEO — a regra dos testes de regra de negocio, escrita UMA vez e chamada pelas 3 portas:
# publicar.sh, .githooks/pre-commit e o CI (.github/workflows/app-sintaxe.yml).
#
# POR QUE EXISTE (13/09/2026, revisor confere-a-fiacao, rodada 2, M1): cada porta tinha a sua copia de
#   SAIDA=$(node testes-nucleo.js ...); RC=$?
# e as 3 rodam com `set -e` (o Actions roda `bash -e`). Com `set -e`, a atribuicao que falha encerra o script ali mesmo:
# a porta saia com erro e SEM mostrar a saida dos testes — publicacao parando sem motivo, commit barrado mostrando so
# "checks do app OK". Trava muda empurra para o --no-verify. Aqui a falha e capturada (`|| RC=$?`) e o motivo sai na tela.
# Provada em checks-suite.py (PORTAO DO NUCLEO) com nucleos falsos: que falha, abaixo do minimo, minimo vazio, minimo com
# BOM, que sai 0 sem contagem e que passa.
#
# Uso: sh trava-nucleo.sh <index.html> [testes-nucleo.js] [testes-nucleo.minimo]
# Sai 0 so quando os testes passam E a contagem dos que passaram e >= ao minimo declarado no arquivo.
APP=${1:-index.html}
TESTES=${2:-testes-nucleo.js}
MINARQ=${3:-testes-nucleo.minimo}
[ -f "$TESTES" ] || { echo "ABORTADO: $TESTES nao existe — a prova das regras de negocio nao rodou"; exit 1; }
[ -f "$MINARQ" ] || { echo "ABORTADO: $MINARQ ausente — a trava de contagem de testes nao pode ficar muda"; exit 1; }
# so os digitos: o PowerShell 5 grava BOM no comeco do arquivo, e com ele o motivo saia "passou 425, minimo 425" (revisor fiacao r3, L2)
MIN=$(tr -cd '0-9' < "$MINARQ")
[ -n "$MIN" ] || { echo "ABORTADO: $MINARQ nao tem um numero dentro — a trava de contagem de testes nao pode ficar muda"; exit 1; }
RC=0
SAIDA=$(node "$TESTES" "$APP" 2>&1) || RC=$?
# printf e nao echo: no dash, echo interpreta barra invertida, e uma barra seguida de c cortava a saida (revisor fiacao r3, L1)
if [ "$RC" -ne 0 ]; then
  # [v2.6c, revisor fiacao r6 L5] cada linha cortada em 300 caracteres: uma linha gigante com "Error" saia inteira na tela, e duas vezes
  printf '%s\n' "$SAIDA" | grep -E 'FALHOU|explodiu|ERRO|Error' | head -25 | cut -c1-300
  # [v2.5, revisor fiacao r4 L2] quando o PROPRIO arquivo de testes quebra (erro de sintaxe ao editar, excecao fora do harness) nao ha
  # linha FALHOU, e o tail -2 do Node 24 e so uma linha vazia e a versao: o motivo nao aparecia
  if printf '%s\n' "$SAIDA" | grep -q 'FALHOU'; then
    printf '%s\n' "$SAIDA" | tail -2 | cut -c1-300
    echo "ABORTADO: os testes do nucleo falharam (saida $RC) — as linhas FALHOU acima dizem qual regra quebrou"
  else
    # [v2.6, revisor fiacao r5 L2] o Node traz o arquivo:linha e o trecho que quebrou; o tail so trazia a pilha. [v2.6c, revisor fiacao r6 L5]
    # o arquivo:linha nem sempre esta nas primeiras linhas: com testes ja impressos antes da quebra, ele vem no meio da saida. Procura onde
    # estiver, pelo nome do arquivo de testes que a trava recebeu, e corta cada linha em 300 caracteres.
    ARQ_T=$(basename "$TESTES" | sed 's/[.]/[.]/g')
    printf '%s\n' "$SAIDA" | grep -m1 -A2 -E "${ARQ_T}:[0-9]+\$" | cut -c1-300
    printf '%s\n' "$SAIDA" | tail -8 | cut -c1-300
    echo "ABORTADO: o arquivo de testes do nucleo quebrou antes de terminar (saida $RC, nenhuma linha FALHOU) — o erro esta nas linhas acima"
  fi
  exit 1
fi
printf '%s\n' "$SAIDA" | tail -2
# `|| N=` protege a atribuicao: sem contagem o ultimo grep falha e, com `set -e` em volta, a trava saia muda (revisor fiacao r3, M3)
N=$(printf '%s\n' "$SAIDA" | grep -o '[0-9][0-9]* passaram' | tail -1 | grep -o '^[0-9]*') || N=
[ "${N:-0}" -ge "$MIN" ] || { echo "ABORTADO: o nucleo passou ${N:-0} testes, minimo declarado $MIN (secao sumiu, foi pulada ou explodiu?)"; exit 1; }
exit 0
