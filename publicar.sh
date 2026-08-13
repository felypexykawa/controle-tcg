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

TAG=$(date '+%d/%m %Hh%M')
MSG=${1:-"app: atualizacao"}

# 1) grava o carimbo nos dois lugares, a partir da MESMA variável
python - "$TAG" <<'PY'
import io,re,sys
tag=sys.argv[1]
s=io.open('index.html',encoding='utf-8').read()
novo,n=re.subn(r"const BUILD_TAG='[^']*'", "const BUILD_TAG='%s'"%tag, s, count=1)
if n!=1:
    raise SystemExit('ERRO: nao achei o BUILD_TAG no index.html — nada foi gravado')
io.open('index.html','w',encoding='utf-8',newline='').write(novo)
io.open('versao.json','w',encoding='utf-8',newline='').write('{"tag": "%s"}'%tag)
PY

# 2) trava: os dois TÊM que bater, e o JS tem que ser válido — senão não publica
node -e "
const fs=require('fs');
const h=fs.readFileSync('index.html','utf8');
const tag=(h.match(/const BUILD_TAG='([^']*)'/)||[])[1];
const vj=JSON.parse(fs.readFileSync('versao.json','utf8')).tag;
if(tag!==vj){console.error('ABORTADO: carimbo divergente',tag,vj);process.exit(1);}
const m=[...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');
try{new Function(m);}catch(e){console.error('ABORTADO: erro de sintaxe no app —',e.message);process.exit(1);}
console.log('carimbo:',tag,'| sintaxe OK');
"

# 3) publica
git add index.html versao.json
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
  SERVIDO=$(curl -s "https://felypexykawa.github.io/controle-tcg/versao.json?cb=$i$$" | tr -d '{}" ' | sed 's/tag://')
  if [ "$SERVIDO" = "$TAG_CMP" ]; then
    echo "LIVE OK — servindo $TAG"
    exit 0
  fi
  echo "  tentativa $i: servindo '$SERVIDO', esperando '$TAG_CMP'"
  i=$((i+1))
  sleep 25
done
echo "AVISO: o live ainda nao servia '$TAG' depois de ~2min — cache do servidor, nao erro de publicacao."
