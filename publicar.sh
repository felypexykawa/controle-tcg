#!/bin/sh
# PUBLICAR — carimbo de versão do RELÓGIO, nunca digitado à mão.
#
# POR QUE EXISTE (Felype apontou 2026-08-12 21h17): eu vinha escrevendo o BUILD_TAG de cabeça.
# Publiquei às 20h23 e carimbei "12h05"; publiquei às 21h09 e carimbei "14h20" — 7 a 8 horas de
# erro. Como o aviso de "versão nova" compara exatamente esse carimbo, ele virou bússola quebrada:
# o Felype não tinha como saber se o que estava na tela dele era o mais novo. Palavras dele:
# "totalmente não confiável".
#
# REGRA: o carimbo sai de `date`, nos DOIS lugares ao mesmo tempo (o embutido no index.html e o
# versao.json que o app busca). Os dois nascem da mesma variável — não há como divergirem.
#
# Uso:  sh publicar.sh "mensagem do commit"
set -e
cd "$(dirname "$0")"

# instala a trava de sintaxe deste repo se ainda nao estiver instalada nesta maquina.
# .git/hooks nao viaja com o clone; .githooks/ viaja, e esta linha liga os dois — assim
# uma copia nova do app ganha a protecao na primeira vez que alguem publica por aqui.
[ "$(git config core.hooksPath)" = ".githooks" ] || { git config core.hooksPath .githooks; echo "trava de sintaxe instalada (.githooks)"; }

TAG=$(date '+%d/%m %Hh%M')
MSG=${1:-"app: atualizacao"}

# 1) grava o carimbo nos dois lugares, a partir da MESMA variável
python - "$TAG" <<'PY'
import io,re,sys,time,json
tag=sys.argv[1]
s=io.open('index.html',encoding='utf-8').read()
ms=int(time.time()*1000)
# o aviso de versao do app compara ts: se um build sair com relogio atrasado (ou dois no mesmo
# milissegundo), o carimbo novo fica <= ao antigo e o app cala PARA SEMPRE — silencio que o dono
# nao tem como perceber. Aqui o carimbo e forcado a andar sempre para frente.
try:
    ant=json.load(io.open('versao.json',encoding='utf-8')).get('ts',0)
except Exception:
    ant=0
if ms<=ant:
    print('AVISO: relogio da maquina nao passou do carimbo anterior — usando anterior+1s')
    ms=int(ant)+1000
novo,n=re.subn(r"const BUILD_TAG='[^']*'", "const BUILD_TAG='%s'"%tag, s, count=1)
if n!=1:
    raise SystemExit('ERRO: nao achei o BUILD_TAG no index.html — nada foi gravado')
# carimbo em ms: e o que permite o app saber se a versao do servidor e MAIS NOVA, e nao apenas
# diferente. Sem ele o app anunciava versao velha do cache como "nova disponivel" (20/08).
novo,n2=re.subn(r"const BUILD_TS=\d+", "const BUILD_TS=%d"%ms, novo, count=1)
if n2!=1:
    raise SystemExit('ERRO: nao achei o BUILD_TS no index.html — nada foi gravado')
io.open('index.html','w',encoding='utf-8',newline='').write(novo)
io.open('versao.json','w',encoding='utf-8',newline='').write('{"tag": "%s", "ts": %d}'%(tag,ms))
PY

# 2) trava: os dois carimbos TEM que bater, e o app nao pode ter perdido capacidade
node -e "
const fs=require('fs');
const tag=(fs.readFileSync('index.html','utf8').match(/const BUILD_TAG='([^']*)'/)||[])[1];
const vj=JSON.parse(fs.readFileSync('versao.json','utf8')).tag;
if(tag!==vj){console.error('ABORTADO: carimbo divergente',tag,vj);process.exit(1);}
console.log('carimbo:',tag);
"
# sintaxe + capacidades + LINHA PARALELA, tudo pela MESMA regra (checks-app.js e a fonte
# canonica). A regua da linha paralela aqui e o app NO AR: se ele tem peca que este arquivo nao
# tem, alguem publicou por outra porta e publicar daqui apagaria o trabalho dele.
# (Incidente fundador: 20/08 23h30 — 4 capacidades sumiram do ar por uma publicacao que passou
# por fora daqui. O pre-commit e o CI usam a MESMA regra contra o commit anterior.)
# Remocao proposital: PODE_REMOVER="nomeA,nomeB" sh publicar.sh "..."   (ou PODE_REMOVER=tudo)
NOAR=$(mktemp 2>/dev/null || echo "/tmp/tcg-noar.html")
if curl -fsS "https://felypexykawa.github.io/controle-tcg/index.html?cb=$$" -o "$NOAR" 2>/dev/null && [ -s "$NOAR" ]; then
  node checks-app.js index.html --contra "$NOAR" || { rm -f "$NOAR"; exit 1; }
else
  echo "[publicar] nao consegui baixar o app do ar — seguindo sem a conferencia de linha paralela"
  node checks-app.js index.html || exit 1
fi
rm -f "$NOAR" 
# TESTES DO NUCLEO: executam as regras de negocio de ponta a ponta (exclusao com lastro,
# devolucao, merge entre aparelhos) contra o arquivo que VAI ao ar — nao contra a copia de dev.
# Vivia num scratchpad temporario ate 21/08, sendo a prova mais forte da entrega sem rodar em
# porta nenhuma. Fail-OPEN de ambiente (sem node ja abortou la em cima), fail-CLOSED de achado.
if [ -f testes-nucleo.js ]; then
  node testes-nucleo.js index.html || { echo "ABORTADO: os testes do nucleo falharam"; exit 1; }
fi

# a vacina so vale se ela propria estiver provada: a suite roda as mutacoes conhecidas (29 hoje) e as
# 6 refatoracoes legitimas. Sem python na maquina, segue sem ela (fail-open do ambiente).
if command -v python >/dev/null 2>&1 && [ -f checks-suite.py ]; then
  python checks-suite.py > /dev/null 2>&1 || { echo "ABORTADO: a suite da vacina falhou — rode: python checks-suite.py"; exit 1; }
  echo "suite da vacina: verde"
fi

# 3) publica
# a vacina vai junto: publicar o app com uma versao ANTIGA do checks-app.js deixaria a trava
# atras do que ela protege, sem ninguem ver (achado da revisao adversarial de 2026-08-20)
# -A pra registrar tambem DELECAO: com lista explicita, apagar um arquivo nunca chegava ao
# repositorio e ele voltava a existir em qualquer clone. E o proprio publicar.sh entra na lista:
# ele NAO se commitava, entao a fiacao da trava so existia nesta maquina — um clone novo, um
# `git checkout publicar.sh` ou um stash e a conferencia sumia sem aviso (achado da revisao
# adversarial, 21/08: o antipadrao 37 dentro da peca que existe pra curar o antipadrao 37).
git add -A index.html versao.json checks-app.js checks-suite.py testes-nucleo.js publicar.sh .githooks .github .gitignore checa-linha-paralela.js 2>/dev/null || git add -A index.html versao.json
git commit -q -m "$MSG (v $TAG)"
git push -q origin master
echo "publicado: $(git rev-parse --short HEAD) as $(date '+%H:%M:%S')"

# 4) confere no ar que o carimbo servido é o que acabamos de gravar
echo "conferindo o live..."
# normaliza DOS DOIS LADOS antes de comparar. Sem isto o vigia dava falso alarme: removia o
# espaco do valor servido ("12/0821h20") e comparava com o esperado ainda com espaco
# ("12/08 21h20") — dizia "nao servia" quando ja estava servindo certo. Vigia que grita à toa
# ensina a ignorar vigia.
TAG_CMP=$(printf '%s' "$TAG" | tr -d ' ')
i=1
while [ $i -le 6 ]; do
  # extrai SO o valor de "tag". A versao anterior fazia `tr -d '{}" ' | sed 's/tag://'`, o que
  # funcionava enquanto o arquivo tinha um campo so; quando o "ts" entrou (2026-08-20), o valor
  # comparado virou "20/0821h57,ts:1787..." e o vigia passou a gritar falso em TODA publicacao.
  # Mesma armadilha que o comentario 15 linhas acima ja documenta: vigia que grita a toa ensina
  # a ignorar vigia. Agora o campo e extraido por nome, entao campo novo nao quebra de novo.
  SERVIDO=$(curl -s "https://felypexykawa.github.io/controle-tcg/versao.json?cb=$i$$" | sed -n 's/.*"tag"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | tr -d ' ')
  if [ "$SERVIDO" = "$TAG_CMP" ]; then
    echo "LIVE OK — servindo $TAG"
    exit 0
  fi
  echo "  tentativa $i: servindo '$SERVIDO', esperando '$TAG_CMP'"
  i=$((i+1))
  sleep 25
done
echo "AVISO: o live ainda nao servia '$TAG' depois de ~2min — cache do servidor, nao erro de publicacao."
