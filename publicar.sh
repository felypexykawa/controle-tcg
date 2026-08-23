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

# fonte de dev (so existe na maquina de quem desenvolve). Apontar SRC_DEV pra um caminho que
# nao existe DESLIGA as checagens de capacidade — e um kill-switch de fato, entao ele avisa na
# tela E fica registrado na mensagem do commit (achado da 2a revisao de fiacao: rota que pula
# trava tem de se auto-denunciar depois do fato, senao ninguem descobre olhando o historico).
SRC_DEV=${SRC_DEV:-"$(cd "$(dirname "$0")/../app-tcg" 2>/dev/null && pwd)/index.html"}
TAG=$(date '+%d/%m %Hh%M')
MSG=${1:-"app: atualizacao"}

# 0) CONSTROI o artefato a partir da fonte de dev e roda as checagens de capacidade (273 hoje; o numero sai do proprio build, nao daqui).
#
# [21/08, achado da revisao de fiacao] Ate hoje este passo NAO EXISTIA: o _build_deploy.py tinha
# 272 checagens, rodava a vacina contra o app no ar e barrava publicacao por cima de trabalho
# alheio — e nenhuma porta o chamava. So eu, a mao, quando lembrava. Pior: ele morava em
# C:\Users\USER\, fora de repositorio, entao toda cura escrita nele existia nesta maquina so.
# Sem este passo, `publicar.sh` so re-carimbava o que ja estava em tcg-web: dava pra publicar
# sem que a fonte de dev tivesse passado por checagem nenhuma.
#
# Fail-OPEN de ambiente (clone sem a fonte de dev nao tem o que construir), fail-CLOSED de
# achado (checagem reprovada aborta).
if [ -f _build_deploy.py ] && [ -f "$SRC_DEV" ]; then
  python _build_deploy.py || { echo "ABORTADO: o build reprovou (a mensagem dele esta acima). Nada foi publicado."; exit 1; }
else
  echo "[publicar] sem a fonte de dev nesta maquina ($SRC_DEV) — publicando o que ja esta em tcg-web, SEM as checagens de capacidade do build"
  PULOU_BUILD=1
fi

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
# [fotos F1 23/08, P0-5 — achado dos 2 revisores do desenho das fotos] este portao era `if [ -f ]`: se o
# arquivo de testes sumisse ou fosse renomeado, a publicacao seguia VERDE sem prova nenhuma (e a foto por
# item e protegida SO por estes testes). Agora: arquivo obrigatorio, e a contagem de testes que passaram
# tem de ser >= ao minimo declarado em testes-nucleo.minimo — secao que explode ou some baixa a contagem e
# reprova. Subir o minimo e passo consciente (editar o arquivo), nunca automatico.
[ -f testes-nucleo.js ] || { echo "ABORTADO: testes-nucleo.js nao existe — a prova da foto por item e das regras de negocio nao rodou"; exit 1; }
MIN_TESTES=$(cat testes-nucleo.minimo 2>/dev/null | tr -d '[:space:]')
# [revisao F1, F1-C] arquivo rastreado ausente = anomalia, nao estado legitimo: sem ele a trava virava 1 em silencio
[ -n "$MIN_TESTES" ] || { echo "ABORTADO: testes-nucleo.minimo ausente ou vazio — a trava de contagem de testes nao pode ficar muda"; exit 1; }
SAIDA_TESTES=$(node testes-nucleo.js index.html 2>&1); RC_TESTES=$?
echo "$SAIDA_TESTES" | tail -4
[ $RC_TESTES -eq 0 ] || { echo "ABORTADO: os testes do nucleo falharam"; exit 1; }
N_TESTES=$(echo "$SAIDA_TESTES" | grep -o '[0-9][0-9]* passaram' | tail -1 | grep -o '^[0-9]*')
[ "${N_TESTES:-0}" -ge "$MIN_TESTES" ] || { echo "ABORTADO: testes-nucleo passou $N_TESTES testes, minimo declarado $MIN_TESTES (secao sumiu ou explodiu?)"; exit 1; }

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
# `git add -A .` no repo INTEIRO, protegido pelo .gitignore — e NAO uma lista de nomes.
# A lista era fragil por duas vias, as duas medidas hoje: (1) ela esqueceu o proprio
# publicar.sh por meses, entao a fiacao das travas so existia nesta maquina; (2) bastava um
# nome da lista nao existir mais (apaguei um arquivo hoje) pra o `git add` inteiro FALHAR e
# cair no plano B, que so levava o app — as melhorias de trava ficavam pra tras em silencio,
# publicacao apos publicacao. Lista explicita e uma cerca que so protege quem lembrou de citar.
git add -A .
# ESCAPE UNICO NAS TRES PORTAS: o pre-commit e este script leem PODE_REMOVER do ambiente; o
# CI le do CORPO da mensagem (la nao existe ambiente). Sem carimbar aqui, uma remocao declarada
# passava local e deixava o CI vermelho — vigia que grita a toa ensina a ignorar vigia.
# [21/08, 2a revisao] rota que pula trava tem de se auto-denunciar DEPOIS do fato: sem esta
# linha, nada no historico registrava que as checagens de capacidade nao rodaram naquele commit.
NOTA=""
[ -n "$PULOU_BUILD" ] && NOTA="SEM-BUILD: as checagens de capacidade nao rodaram (fonte de dev ausente ou SRC_DEV apontando pra fora)"
if [ -n "$PODE_REMOVER" ] || [ -n "$NOTA" ]; then
  git commit -q -m "$MSG (v $TAG)" -m "${PODE_REMOVER:+PODE_REMOVER=$PODE_REMOVER}${PODE_REMOVER:+
}$NOTA"
else
  git commit -q -m "$MSG (v $TAG)"
fi
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
