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

# [v2.6e, revisor fiacao r8 M1] Ctrl+C de verdade em qualquer fase diz ONDE parou e se algo foi publicado. Antes so o controle negativo tinha
# trap: nos caminhos a interrupcao virava "um caminho do usuario reprovou" (falso), e a suite e o commit saiam mudos. Com o trap aqui, o sh
# o roda quando o filho sai e antes do comando seguinte, entao a mensagem falsa de reprovacao nao chega a sair.
FASE="no inicio"
limpa_pub() { for f in "${NOAR:-}" "${SAIDA_NEG:-}" "${RC_ARQ:-}"; do [ -n "$f" ] && rm -f "$f"; done; return 0; }
# [v2.6f, cenas K1f0 do autor] o HEAD lido so com comandos do proprio shell: dentro da interrupcao, o git chamado para comparar travou uma vez
# (8 min sem mensagem) e na outra falhou e deu a mensagem falsa de que o commit ficou feito
cabeca_agora() {
  CAB=""; LH=""
  { read -r LH < .git/HEAD; } 2>/dev/null || LH=""
  case "$LH" in
    "ref: "*) REF=${LH#ref: }; { read -r CAB < ".git/$REF"; } 2>/dev/null || CAB=""
      if [ -z "$CAB" ] && [ -f .git/packed-refs ]; then while read -r H_ N_; do [ "$N_" = "$REF" ] && CAB=$H_; done < .git/packed-refs; fi ;;
    *) CAB=$LH ;;
  esac
  return 0
}
interrompe() {
  trap - INT TERM; limpa_pub
  case "$FASE" in
    "no push") echo "[publicar] interrompido no push: pode ter subido ou nao. Confira no GitHub antes de publicar de novo." ;;
    "na conferencia do ar") echo "[publicar] interrompido na conferencia do ar: a publicacao ja tinha sido feita." ;;
    "no commit") cabeca_agora; if [ -n "$CAB" ] && [ "$CAB" != "$H_ANTES" ]; then echo "[publicar] interrompido no commit: o commit ${CAB%"${CAB#???????}"} ficou feito so neste computador e NAO subiu. Nada foi publicado; a proxima publicacao sobe os dois juntos."; else echo "[publicar] interrompido no commit. Nada foi publicado."; fi ;;
    *) echo "[publicar] interrompido $FASE. Nada foi publicado." ;;
  esac
  exit 130
}
trap interrompe INT TERM

# instala a trava de sintaxe deste repo se ainda nao estiver instalada nesta maquina.
# .git/hooks nao viaja com o clone; .githooks/ viaja, e esta linha liga os dois — assim
# uma copia nova do app ganha a protecao na primeira vez que alguem publica por aqui.
[ "$(git config core.hooksPath)" = ".githooks" ] || { git config core.hooksPath .githooks; echo "trava de sintaxe instalada (.githooks)"; }

# fonte de dev (so existe na maquina de quem desenvolve). Apontar SRC_DEV pra um caminho que
# nao existe DESLIGA as checagens de capacidade — e um kill-switch de fato, entao ele avisa na
# tela E fica registrado na mensagem do commit (achado da 2a revisao de fiacao: rota que pula
# trava tem de se auto-denunciar depois do fato, senao ninguem descobre olhando o historico).
SRC_DEV=${SRC_DEV:-${TCG_SRC:-"$(cd "$(dirname "$0")/../app-tcg" 2>/dev/null && pwd)/index.html"}}
# [13/09, revisor fiacao r2 L4] uma variavel so para a fonte: o build le TCG_SRC e este script so conferia SRC_DEV — apontar uma
# e esquecer a outra construia de um arquivo e conferia a existencia de outro
export TCG_SRC="$SRC_DEV"
TAG=$(date '+%d/%m %Hh%M')
MSG=${1:-"app: atualizacao"}

# 0) CONSTROI o artefato a partir da fonte de dev e roda as checagens de capacidade (quantas sao, quem diz e o proprio build).
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
FASE="no build"
if [ -f _build_deploy.py ] && [ -f "$SRC_DEV" ]; then
  python _build_deploy.py || { echo "ABORTADO: o build reprovou (a mensagem dele esta acima). Nada foi publicado."; exit 1; }
else
  echo "[publicar] sem a fonte de dev nesta maquina ($SRC_DEV) — publicando o que ja esta em tcg-web, SEM as checagens de capacidade do build"
  PULOU_BUILD=1
fi

# 1) grava o carimbo nos dois lugares, a partir da MESMA variável
FASE="no carimbo"
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
FASE="na conferencia contra o app no ar"
PULOU_CONTRA=""
NOAR=$(mktemp 2>/dev/null || echo "/tmp/tcg-noar.html")
# [13/09, revisor fiacao r3 L5] so vale como regua o que e o app: pagina de erro ou de portal servida com 200 contava como
# "o app no ar" e a conferencia rodava contra lixo, sem a nota SEM-CONTRA-NO-AR
if curl -fsS "https://felypexykawa.github.io/controle-tcg/index.html?cb=$$" -o "$NOAR" 2>/dev/null && [ -s "$NOAR" ] && grep -q "const BUILD_TAG=" "$NOAR"; then
  node checks-app.js index.html --contra "$NOAR" || { rm -f "$NOAR"; exit 1; }
else
  echo "[publicar] nao consegui baixar o app do ar — seguindo sem a conferencia de linha paralela"
  PULOU_CONTRA=1
  node checks-app.js index.html || exit 1
fi
rm -f "$NOAR"

# 2.5) CAMINHOS DO USUARIO — o app ABERTO num navegador de verdade.
#
# POR QUE ESTE PASSO EXISTE (Felype, 24/08): "o sistema pouco faz a verificacao pelo caminho do
# usuario. e no caso de apps, eu soh vou perceber na hr em que estou precisando usar."
# As checagens acima e os testes do nucleo sao fortes, mas NENHUMA delas abre tela: em
# testes-nucleo.js o DOM e dublê (getElementById devolve stub pra qualquer id, setTimeout nunca
# dispara, clipboard e FileReader sao no-op). Foi por isso que 12 defeitos da semana passaram
# por 289 testes verdes. Aqui o Chrome abre o index.html que VAI AO AR, clica nos botoes de
# verdade e confere o que apareceu na tela.
#
# NAO fica no pre-commit de proposito: encarecer o commit empurra pra rota que contorna
# (medido: 10 de 17 commits da janela ja foram por fora do trilho). A porta e a publicacao.
#
# Fail-OPEN de AMBIENTE (sem playwright/Chrome, ou sem o runner nesta maquina, o proprio runner
# avisa e sai 0). Fail-CLOSED de ACHADO (caminho vermelho aborta a publicacao).
RUNNER_CAMINHOS=${RUNNER_CAMINHOS:-"C:/Users/USER/.claude/health/provar-caminhos.js"}
# [13/09, revisor fiacao r2 M5] rota que pula esta prova se auto-denuncia no commit (SEM-CAMINHOS), como a do build.
# CAMINHOS_RC_AMBIENTE=3: sem playwright ou sem Chrome o runner sai 3 em vez de 0, e a publicacao segue MARCADA.
# [13/09, M4] quando caminhos.js muda nesta publicacao, roda tambem o controle negativo (cada caminho verde COM a cura e
# vermelho SEM ela). Antes ele so rodava a mao, e o comentario prometia "mensal".
PULOU_CAMINHOS=""; PULOU_NEGATIVO=""; NEGATIVO_OK=""; PULOU_PORTAO=""
FASE="nos caminhos do usuario"
if [ -f caminhos.js ] && [ -f "$RUNNER_CAMINHOS" ]; then
  RC_CAM=0; CAMINHOS_RC_AMBIENTE=3 node "$RUNNER_CAMINHOS" caminhos.js || RC_CAM=$?
  if [ "$RC_CAM" -eq 3 ]; then
    PULOU_CAMINHOS="o navegador de prova nao abriu nesta maquina (playwright ou Chrome)"
  elif [ "$RC_CAM" -ne 0 ]; then
    echo "ABORTADO: um caminho do usuario reprovou (detalhe acima). Nada foi publicado."; exit 1
  else
    # [13/09, revisor fiacao r3 M1] quem mata a mutacao e o app, nao o caminhos.js: a suite confere por texto, em toda publicacao
    # e no CI, se cada mutacao ainda casa (fora de comentario, v2.5).
    # [v2.5, revisor fiacao r4 M1] o texto nao ve o negativo que ainda casa mas ja nao tira a cura. Por isso o negativo no navegador
    # tambem roda quando o historico diz que ele esta velho: nenhuma publicacao com NEGATIVO-OK, ou 3 publicacoes / 14 dias desde a
    # ultima. A nota NEGATIVO-OK no corpo do commit e a entrada deste gatilho (antes a SEM-NEGATIVO nao tinha leitor nenhum).
    # [v2.6, revisor fiacao r5 M2] a nota diz O QUE provou (md5 do runner e do caminhos.js e quantos caminhos deram ok), e o gatilho ve
    # tambem o caminhos.js commitado a parte e o runner trocado: as mudancas que tornam um negativo antigo invalido. Nota antiga,
    # sem md5 do runner, conta como runner desconhecido (roda de novo).
    # [v2.6c, revisor fiacao r6 L1] sao tres mudancas, nao duas: o caminhos-controles.json e a memoria do caminho 6 (a lista do que existia
    # na tela), e sem a linha certa dele o negativo desse caminho morre. Ele entra nas duas consultas.
    # [v2.6c, revisor fiacao r6 L2] md5 pelo CONTEUDO (md5sum < arquivo): pelo nome, um caminho com barra invertida saia "\8305810" e toda
    # publicacao rodava o negativo; sem md5sum saia vazio, igual ao vazio da nota, e o negativo nunca rodava. Fora de 8 digitos
    # hexadecimais vale "desconhecido", e desconhecido roda.
    MD5_RUN=$(md5sum 2>/dev/null < "$RUNNER_CAMINHOS" | cut -c1-8) || MD5_RUN=""
    printf '%s' "$MD5_RUN" | grep -qE '^[0-9a-f]{8}$' || MD5_RUN="desconhecido"
    MD5_CAM=$(md5sum 2>/dev/null < caminhos.js | cut -c1-8) || MD5_CAM=""
    printf '%s' "$MD5_CAM" | grep -qE '^[0-9a-f]{8}$' || MD5_CAM="desconhecido"
    RODA_NEG=""
    if [ -n "$(git status --porcelain -- caminhos.js caminhos-controles.json)" ]; then
      RODA_NEG="caminhos.js ou caminhos-controles.json mudou nesta publicacao"
    elif [ "$MD5_RUN" = "desconhecido" ]; then
      RODA_NEG="nao consegui calcular o md5 do runner de caminhos nesta maquina"
    else
      ULT_NEG=$(git log -1 --format='%H %ct' --grep='^NEGATIVO-OK' 2>/dev/null || true)
      if [ -z "$ULT_NEG" ]; then
        RODA_NEG="nenhuma publicacao registrou o controle negativo rodando"
      else
        H_NEG=${ULT_NEG%% *}; T_NEG=${ULT_NEG##* }
        N_PUB=$(git rev-list --count --grep='(v [0-9][0-9]/[0-9][0-9] [0-9][0-9]h[0-9][0-9])' "$H_NEG"..HEAD 2>/dev/null || echo 99)
        N_CAM=$(git rev-list --count "$H_NEG"..HEAD -- caminhos.js caminhos-controles.json 2>/dev/null || echo 0)
        # [v2.6c, revisor fiacao r6 L2] o runner= so da linha NEGATIVO-OK da nota: um "runner=abc" no assunto era lido no lugar dele
        RUN_NOTA=$(git log -1 --format=%B "$H_NEG" 2>/dev/null | grep '^NEGATIVO-OK' | grep -oE 'runner=[0-9a-f]{8}([^0-9a-f]|$)' | head -1 | cut -c8-15) || RUN_NOTA=""
        IDADE=$(( $(date +%s) - T_NEG ))
        if [ "$N_CAM" -gt 0 ]; then RODA_NEG="caminhos.js ou caminhos-controles.json mudou desde o ultimo controle negativo ($N_CAM commit(s) a parte)"
        elif [ "$RUN_NOTA" != "$MD5_RUN" ]; then RODA_NEG="o runner de caminhos mudou desde o ultimo controle negativo (${RUN_NOTA:-a nota nao diz qual} -> $MD5_RUN)"
        elif [ "$N_PUB" -ge 3 ]; then RODA_NEG="$N_PUB publicacoes desde o ultimo controle negativo"
        elif [ "$IDADE" -gt 1209600 ]; then RODA_NEG="mais de 14 dias desde o ultimo controle negativo"; fi
      fi
    fi
    if [ -n "$RODA_NEG" ]; then
      echo "[publicar] controle negativo dos caminhos no navegador: $RODA_NEG (cada caminho aparece quando termina; perto de 2 min)"
      # [v2.6c, revisor fiacao r6 L3] a saida ia so para um arquivo e aparecia no fim: interromper apagava o motivo da tela e deixava o
      # arquivo temporario orfao. Agora cada linha sai na hora (tee), o codigo de saida vai para um arquivo a parte e a interrupcao apaga os dois.
      FASE="no controle negativo"
      SAIDA_NEG=$(mktemp 2>/dev/null || echo "/tmp/tcg-negativo-$$.log"); RC_ARQ=$(mktemp 2>/dev/null || echo "/tmp/tcg-negativo-rc-$$")
      # [v2.6d, revisor fiacao r7 L3] se o tee falha (disco cheio), a publicacao saia calada com set -e: agora apaga os temporarios e diz que nada
      # foi publicado. [v2.6e, revisor fiacao r8 M1] tee simples de novo: com a tecla de verdade o runner recebe o sinal na hora, e o tee -i
      # mostrava as linhas VERMELHO que a propria interrupcao produz; quem diz onde parou e apaga os temporarios e o trap do topo
      { RC_N=0; CAMINHOS_RC_AMBIENTE=3 node "$RUNNER_CAMINHOS" caminhos.js --negativo 2>&1 || RC_N=$?; echo "$RC_N" > "$RC_ARQ"; } | tee "$SAIDA_NEG" \
        || { rm -f "$SAIDA_NEG" "$RC_ARQ"; echo "ABORTADO: nao consegui gravar a saida do controle negativo (disco cheio?). Nada foi publicado."; exit 1; }
      RC_NEG=$(tr -cd '0-9' < "$RC_ARQ" 2>/dev/null) || RC_NEG=""
      RC_NEG=${RC_NEG:-1}
      # [v2.6c, revisor fiacao r6 L2] a contagem sai do resumo do proprio runner ("N verdes / 0 vermelhos"): contar linhas "  ok  " gravava
      # "0 ok" como passou quando o formato mudava. Sem o resumo, ou com 0, a nota diz "contagem ilegivel".
      N_OK=$(grep -oE '^  [0-9]+ verdes / 0 vermelhos' "$SAIDA_NEG" 2>/dev/null | tail -1 | grep -oE '[0-9]+' | head -1) || N_OK=""
      if [ -n "$N_OK" ] && [ "$N_OK" -gt 0 ]; then N_TXT="$N_OK ok"; else N_TXT="contagem ilegivel"; fi
      rm -f "$SAIDA_NEG" "$RC_ARQ"; SAIDA_NEG=""; RC_ARQ=""
      # [v2.6, revisor fiacao r5 L5] saida 3 e o navegador que nao abriu (ambiente), nao caminho que falhou
      if [ "$RC_NEG" -eq 3 ]; then echo "ABORTADO: o navegador nao abriu na rodada do controle negativo (saida 3, ambiente) — rode de novo. Nada foi publicado."; exit 1; fi
      [ "$RC_NEG" -eq 0 ] || { echo "ABORTADO: o controle negativo dos caminhos falhou (saida $RC_NEG): um caminho fica verde sem a cura, reprova com ela, ou a mutacao dele nao casa mais. Nada foi publicado."; exit 1; }
      NEGATIVO_OK="$RODA_NEG; runner=$MD5_RUN caminhos=$MD5_CAM, $N_TXT"
    else
      PULOU_NEGATIVO="caminhos.js e caminhos-controles.json nao mudaram e o ultimo controle negativo tem menos de 3 publicacoes e 14 dias; a suite conferiu por texto que cada mutacao ainda casa com o app"
    fi
  fi
elif [ -f caminhos.js ]; then
  echo "[publicar] o runner de caminhos nao existe nesta maquina ($RUNNER_CAMINHOS) — publicando SEM a prova pelo caminho do usuario"
  PULOU_CAMINHOS="o runner de caminhos nao existe nesta maquina"
else
  echo "[publicar] este repo nao tem caminhos.js — publicando SEM a prova pelo caminho do usuario"
  PULOU_CAMINHOS="o repositorio nao tem caminhos.js"
fi

# TESTES DO NUCLEO: executam as regras de negocio de ponta a ponta (exclusao com lastro,
# devolucao, merge entre aparelhos) contra o arquivo que VAI ao ar — nao contra a copia de dev.
# Vivia num scratchpad temporario ate 21/08, sendo a prova mais forte da entrega sem rodar em
# porta nenhuma. Fail-OPEN de ambiente (sem node ja abortou la em cima), fail-CLOSED de achado.
# [fotos F1 23/08, P0-5 — achado dos 2 revisores do desenho das fotos] este portao era `if [ -f ]`: se o
# arquivo de testes sumisse ou fosse renomeado, a publicacao seguia VERDE sem prova nenhuma (e a foto por
# item e protegida SO por estes testes). Agora: arquivo obrigatorio, e a contagem de testes que passaram
# tem de ser >= ao minimo declarado em testes-nucleo.minimo — secao que explode ou some baixa a contagem e
# reprova. Subir o minimo e passo consciente (editar o arquivo), nunca automatico.
# [revisao F1, F1-C] arquivo rastreado ausente = anomalia, nao estado legitimo. [13/09, revisor fiacao r2 M1] a regra mora em
# trava-nucleo.sh, a MESMA do pre-commit e do CI: com `set -e`, a copia antiga (SAIDA=$(...); RC=$?) saia muda na atribuicao.
FASE="na trava do nucleo"
[ -f trava-nucleo.sh ] || { echo "ABORTADO: trava-nucleo.sh nao existe — a trava dos testes do nucleo nao pode ficar de fora"; exit 1; }
sh trava-nucleo.sh index.html testes-nucleo.js testes-nucleo.minimo || { echo "Nada foi publicado."; exit 1; }

# a vacina so vale se ela propria estiver provada: a suite roda as mutacoes conhecidas, as refatoracoes legitimas, as mutacoes
# da planilha contra os testes do nucleo e a prova do portao do nucleo (quantas, a propria suite diz). Sem python na maquina,
# segue sem ela (fail-open do ambiente).
# [v2.6, revisor fiacao r5 L4] sem a suite (arquivo apagado do repositorio ou maquina sem python) a publicacao seguia sem nota nenhuma
PULOU_SUITE=""
if ! [ -f checks-suite.py ]; then PULOU_SUITE="checks-suite.py nao existe no repositorio"
elif ! command -v python >/dev/null 2>&1; then PULOU_SUITE="sem python nesta maquina"; fi
[ -z "$PULOU_SUITE" ] || echo "[publicar] a suite da vacina NAO rodou: $PULOU_SUITE"
if [ -z "$PULOU_SUITE" ]; then
  # [v2.5, revisor fiacao r4 L3] a saida da suite ia para /dev/null: o resumo aparece, e NAO PROVADO (saida 3, sem sh) marca o commit
  FASE="na suite da vacina"
  # [v2.6e, revisor fiacao r8 M1] a suite leva 2 a 4 min sem imprimir nada, e e nela que alguem aperta Ctrl+C achando que travou
  echo "[publicar] suite da vacina rodando: 2 a 4 min sem mostrar nada (interromper aqui nao publica nada)"
  RC_SUITE=0; SAIDA_SUITE=$(python checks-suite.py 2>&1) || RC_SUITE=$?
  # [v2.6d, revisor fiacao r7 L5] REPETIDA no filtro: com nome de mutacao repetido a tela dizia so "a suite da vacina falhou", sem o motivo
  printf '%s\n' "$SAIDA_SUITE" | grep -E 'RESUMO|FUROU|MORTA|REPETIDA|NAO PROVADO|PORTAS' | head -20
  if [ "$RC_SUITE" -eq 3 ]; then
    PULOU_PORTAO="o portao do nucleo nao foi provado nesta maquina (sem sh)"
  elif [ "$RC_SUITE" -ne 0 ]; then
    echo "ABORTADO: a suite da vacina falhou (saida $RC_SUITE) — rode: python checks-suite.py"; exit 1
  else
    echo "suite da vacina: verde"
  fi
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
# [v2.6f, revisor fiacao r9 L1 e cenas K1 do autor] o HEAD antes do commit: interrompido depois de o git gravar o commit, o aviso dizia "Nada
# foi publicado." sem dizer que o commit ficou feito neste computador. Guardado antes do FASE, para uma interrupcao entre as duas linhas nao
# dizer o contrario
cabeca_agora; H_ANTES=$CAB
FASE="no commit"
git add -A .
# ESCAPE UNICO NAS TRES PORTAS: o pre-commit e este script leem PODE_REMOVER do ambiente; o
# CI le do CORPO da mensagem (la nao existe ambiente). Sem carimbar aqui, uma remocao declarada
# passava local e deixava o CI vermelho — vigia que grita a toa ensina a ignorar vigia.
# [21/08, 2a revisao] rota que pula trava tem de se auto-denunciar DEPOIS do fato: sem esta
# linha, nada no historico registrava que as checagens de capacidade nao rodaram naquele commit.
NOTA=""
[ -n "$PULOU_BUILD" ] && NOTA="SEM-BUILD: as checagens de capacidade nao rodaram (fonte de dev ausente ou SRC_DEV apontando pra fora)"
# [13/09, revisor fiacao r2 M5] as outras duas rotas que pulam prova tambem ficam no historico
[ -n "$PULOU_CAMINHOS" ] && NOTA="${NOTA:+$NOTA
}SEM-CAMINHOS: a prova pelo caminho do usuario nao rodou ($PULOU_CAMINHOS)"
[ -n "$PULOU_CONTRA" ] && NOTA="${NOTA:+$NOTA
}SEM-CONTRA-NO-AR: nao consegui baixar o app do ar e a conferencia de linha paralela nao rodou"
[ -n "$PULOU_NEGATIVO" ] && NOTA="${NOTA:+$NOTA
}SEM-NEGATIVO: o controle negativo dos caminhos no navegador nao rodou ($PULOU_NEGATIVO)"
[ -n "$NEGATIVO_OK" ] && NOTA="${NOTA:+$NOTA
}NEGATIVO-OK: o controle negativo dos caminhos no navegador rodou e passou ($NEGATIVO_OK)"
[ -n "$PULOU_PORTAO" ] && NOTA="${NOTA:+$NOTA
}SEM-PORTAO: $PULOU_PORTAO"
[ -n "$PULOU_SUITE" ] && NOTA="${NOTA:+$NOTA
}SEM-SUITE: a suite da vacina nao rodou ($PULOU_SUITE)"
if [ -n "$PODE_REMOVER" ] || [ -n "$NOTA" ]; then
  git commit -q -m "$MSG (v $TAG)" -m "${PODE_REMOVER:+PODE_REMOVER=$PODE_REMOVER}${PODE_REMOVER:+
}$NOTA"
else
  git commit -q -m "$MSG (v $TAG)"
fi
FASE="no push"
# [v2.6f, revisor fiacao r9 L2] push recusado (o remoto andou por outra porta) saia 1 so com o "! [rejected]" do git, e o commit ficava so neste
# computador sem aviso nenhum
git push -q origin master || { echo "ABORTADO: o push nao foi aceito (motivo do git acima). O commit $(git rev-parse --short HEAD) ficou so neste computador: nada foi publicado. Rode git pull --rebase e publique de novo."; exit 1; }
echo "publicado: $(git rev-parse --short HEAD) as $(date '+%H:%M:%S')"
FASE="na conferencia do ar"

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
