import os
# Build da versao de deploy: app-tcg (fonte, dev) -> tcg-web (nuvem, publico)
# Difere em 2 pontos: firebaseConfig real (USAR_NUVEM auto-deriva) + SEED=[]
import re
# [21/08, 2a revisao de fiacao] os caminhos saem da posicao DESTE arquivo, nunca cravados em
# C:\Users\USER. Cravados, um clone noutra pasta rodava o build e gravava no checkout ALHEIO
# enquanto o publicar.sh commitava o daqui — silencioso dos dois lados. AQUI = a pasta do site;
# a fonte de dev fica ao lado dela (../app-tcg), e da pra apontar outra por TCG_SRC.
AQUI=os.path.dirname(os.path.abspath(__file__))
SRC=os.environ.get('TCG_SRC') or os.path.join(os.path.dirname(AQUI),'app-tcg','index.html')
DEP=os.path.join(AQUI,'index.html')
src=open(SRC,encoding='utf-8').read()
dep=open(DEP,encoding='utf-8').read()

# 1) extrai o bloco firebaseConfig REAL do deploy atual (nao hardcode)
m=re.search(r'const firebaseConfig = \{.*?\n\};', dep, re.S)
assert m, 'config real nao encontrada no deploy atual'
real=m.group(0)
assert 'apiKey' in real, 'config sem apiKey'

# 2) troca o placeholder {} da fonte pela config real
new,n1=re.subn(r'const firebaseConfig = \{\};[^\n]*', lambda _:real, src, count=1)
assert n1==1, f'placeholder config: {n1} substituicoes (esperado 1)'

# 2b) injeta o carimbo de versao (data/hora local do build)
import datetime,json,time
tag=datetime.datetime.now().strftime('%d/%m %Hh%M')
new,nb=re.subn(r"const BUILD_TAG='[^']*';",f"const BUILD_TAG='{tag}';",new,count=1)
assert nb==1, f'BUILD_TAG: {nb} substituicoes (esperado 1)'
# CARIMBO EM MILISSEGUNDOS — a parte que faltava aqui (achado da revisao adversarial, 21/08).
# O app so avisa "versao nova" se o servidor tiver ts MAIOR que o BUILD_TS embutido; sem ts ele
# fica CALADO PARA SEMPRE. Este script gravava versao.json so com 'tag' e nao tocava no
# BUILD_TS, entao o carimbo andava PRA TRAS em relacao ao que ja estava no ar — e publicar
# esse estado a mao matava em silencio o aviso de versao. Mesma regra monotonica do
# publicar.sh: quem quer que rode, o invariante vale.
_ms=int(time.time()*1000)
try:
    _ant=int(json.load(open(os.path.join(AQUI,'versao.json'),encoding='utf-8')).get('ts',0))
except Exception:
    _ant=0
if _ms<=_ant: _ms=_ant+1000
new,nts=re.subn(r"const BUILD_TS=\d+",f"const BUILD_TS={_ms}",new,count=1)
assert nts==1, f'BUILD_TS: {nts} substituicoes (esperado 1) — o app precisa dele pro aviso de versao'

# 2c) o versao.json e gravado LA EMBAIXO, junto com o artefato, so depois das checagens.
# [21/08, achado da revisao de fiacao] Ate hoje ele era gravado AQUI, antes de conferir. Num
# build reprovado o carimbo andava sozinho: o `index.html` publicado ficava com BUILD_TS velho e
# o versao.json com ts novo. Duas consequencias, as duas ruins e silenciosas — (a) a tarja
# "versao nova disponivel" aparece, o clique recarrega o MESMO arquivo e ela volta; (b) se a
# pessoa rodasse o publicar.sh em seguida, ia ao ar conteudo VELHO sob carimbo NOVO, e a
# conferencia de linha paralela (velho contra velho) ficava verde.
_VERSAO_JSON = os.path.join(AQUI,'versao.json')
_CARIMBO = json.dumps({'tag':tag,'ts':_ms})

# 3) SEED -> [] (linha unica que comeca com const SEED=)
lines=new.split('\n')
si=[k for k,l in enumerate(lines) if l.startswith('const SEED=')]
assert len(si)==1, f'SEED: {len(si)} linhas (esperado 1)'
orig=lines[si[0]]
pos=orig.rfind('}];')
resto=orig[pos+3:] if pos>=0 else ''
lines[si[0]]='const SEED=[];'+resto
out='\n'.join(lines)
# QUARTA PORTA (achado da 2a revisao adversarial, 21/08): este script SOBRESCREVE o arquivo
# publicado a partir da fonte de dev — exatamente a rota do incidente de 20/08 23h30, em que
# 4 capacidades sumiram do ar. Ate agora ele lia o deploy so pra extrair o firebaseConfig e
# nunca comparava com o que ia por cima. Agora passa pela MESMA regra das outras tres portas:
# se o arquivo que ja esta la tem funcao que este nao tem, PARA e nomeia.
# Liberacao proposital: PODE_REMOVER="nomeA,nomeB" python _build_deploy.py
import subprocess as _sp, tempfile as _tf
_CHK = os.path.join(AQUI, 'checks-app.js')
if os.path.exists(DEP) and os.path.exists(_CHK):
    _t = _tf.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8')
    _t.write(out); _t.close()
    _r = _sp.run(['node', _CHK, _t.name, '--contra', DEP], capture_output=True, text=True)
    os.unlink(_t.name)
    if _r.returncode != 0:
        print((_r.stdout or _r.stderr)[-2500:])
        raise SystemExit('ABORTADO pela vacina (a mensagem dela esta acima). Sao DUAS causas '
                         'possiveis e elas pedem acoes opostas: (a) o arquivo publicado tem peca '
                         'que este build nao tem -> traga o trabalho pra fonte ANTES de construir '
                         'por cima; (b) a vacina nao CONSEGUIU exercitar uma capacidade -> '
                         'costuma ser funcao nova faltando no recorta/contexto DELA, e o build '
                         'esta certo. Leia a mensagem acima antes de agir. [a 1a versao desta '
                         'linha afirmava sempre (a) — mentia a causa]')
# [21/08] Ate hoje este script gravava AQUI e conferia depois — entao um build reprovado
# deixava a versao ruim no disco, pronta pra ser publicada pela proxima pessoa que rodasse o
# publicar.sh. Reprovar depois de gravar nao e reprovar. Agora a conferencia e sobre o
# conteudo que SERIA gravado, e a troca do arquivo acontece la embaixo, so se tudo passar.
# (achado por mutacao, no proprio dia em que a checagem nova foi escrita)

# 4) verificacao do artefato
chk=out
# [21/08, 2a revisao] o denominador era `count('buscarLigaCampo(')-1`, que conta TAMBEM as
# chamadas com o id em variavel — passar os ids por variavel (refatoracao que nao muda
# comportamento nenhum) reprovava o build. O denominador passou a contar so a forma LITERAL,
# que e a unica sobre a qual esta checagem tem o que dizer.
_litLiga=len(re.findall(r'''buscarLigaCampo\(\s*['"]''', chk))
_chamLiga=re.findall(r'''buscarLigaCampo\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)''', chk)
checks={
 'apiKey presente':'AIzaSy' in chk,
 'USAR_NUVEM auto-deriva':'const USAR_NUVEM = !!(firebaseConfig' in chk,
 'SEED vazio':'const SEED=[];' in chk,
 'SEM dados reais no SEED':chk.count('"id":')==0 and "id:'m" not in chk.split('const SEED=[];')[1][:50] if 'const SEED=[];' in chk else False,
 'baixarLote':'function baixarLote' in chk,
 'ncalc (nota unitaria)':'function ncalc' in chk,
 'fix e=editId':'const e=editId?movs.find' in chk,
 'cadastros autos':"'auto:'+n" in chk,
 'codigo na nota':'codigo:it.codigo' in chk,
 'codigo no avulso':"codigo:g('f_cod')" in chk,
 'fracionamento venda':'baixarLote(it.id,qv' in chk,
 'fracionamento troca':"baixarLote(d.estoqueId,d.estoqueQtd" in chk,
 'baixarBoosters':'function baixarBoosters' in chk,
 'fluxoBuckets (relatorio)':'function fluxoBuckets' in chk,
 'chips de fluxo':'dinheiro entrou' in chk,
 'filtros relatorio':'function filtrosRelCard' in chk and '🔎 Filtros' in chk,
 'toggle booster venda':'vunrow' in chk,
 'toggle booster consumo':'cunrow' in chk,
 'toggle booster troca':'dunrow' in chk,
 'destIni gravado':'destIni:sit' in chk,
 'grupos de colecao':'function selColOpts' in chk and 'function abrirCols' in chk,
 'colsG na nuvem':'colsJ,colsG,pess' in chk and "d.colsG&&typeof d.colsG==='object'" in chk,
 'juntar/separar nota':'function juntarNota' in chk and 'function separarDaNota' in chk and 'function desfazerNota' in chk and 'notasSel' in chk,
 'terminologia colecao':'⭐ coleção' in chk and 'O que foi pra coleção?' in chk,
 'grafico svg':'function graficoSvg' in chk,
 'contas filtro periodo+jogo':'okCt' in chk,
 'fluxo de caixa (renames)':'Fluxo de caixa' in chk and 'A pagar' in chk,
 'contas bancarias':'function abrirConta' in chk and 'contasBanc' in chk,
 'juntar no fluxo':'function juntarFx' in chk,
 'historico do cadastro':'function historicoDe' in chk,
 'nota com boosters+conta':'n_boo' in chk and 'n_conta' in chk,
 'ordenar por / agrupar por':'Ordenar por: data' in chk and 'Agrupar por: m' in chk,
 'seletor unico de visao':'Ver os quadros abaixo por' in chk,
 'sem card Por jogo':'>Por jogo<' not in chk,
 'painel filtravel':'motor(true)' in chk and 'function filtrosRelCard' in chk,
 'extrato conta+ordem':'extConta' in chk and 'extOrdem' in chk,
 'cadastros em tags':"cadTab='pess'" in chk,
 'troca recebe tipo/cod/boosters':'r_cat' in chk and 'r_boo' in chk,
 'despesa com conta':"conta:(g('f_conta')" in chk,
 'consumo respeita data':"dataSaida:g('f_data')" in chk,
 'busca conta+codigo':'semAcento([m.desc,m.codigo,m.colecao,m.cat,m.jogo,m.contraparte,m.obs,m.conta,m.situacao,m.idioma]' in chk,
 'filtros colapsaveis':'ctFOpen' in chk and 'consFOpen' in chk,
 'fotos (nuvem+local)':'function fotoAdd' in chk and 'tcg_fotos' in chk and 'abrirFotos' in chk,
 'saldo por conta':'function saldoConta' in chk and 'saldoIni' in chk,
 'gerenciar jogos nos cadastros':'gerenciar jogos' in chk,
 'backup completo c/ fotos':'function baixarBackupCompleto' in chk and 'function restaurarFotos' in chk and 'montarBackup' in chk,
 'consultar filtros completos':'consCol' in chk and 'consPess' in chk and 'consConta' in chk,
 'composicoes 3 modos':'function graficoCompSvg' in chk and 'function tabelaComp' in chk and 'relCompView' in chk,
 'linha do tempo 3 modos':'function tabelaFluxo' in chk and 'relTLView' in chk,
 'parcela N de M + total':'de ${nota.nP}' in chk and 'total ${fmt(nota.tot)}' in chk,
 'fotos no lancar':'function aplicarFotosPend' in chk and 'abrirFotosPend' in chk,
 'miniatura real':'fotoThumb' in chk and 'function fotoThumbDe' in chk,
 'excluir nota inteira':'function excluirNotaInteira' in chk,
 'fluxo forn no titulo':'<b>${m.contraparte' in chk,
 'excluir/mesclar pessoa':'function excluirPess' in chk and 'function pessOrd' not in chk and 'pessOrd=' in chk,
 'titulo do filtro consultar':'TITF' in chk,
 'graficos clicaveis+periodo':'onclick="irPer' in chk and 'período: ${perRotTxt()}' in chk,
 'situacao pedido':'function chegouPedido' in chk and "'PEDIDO','🚚'" in chk,
 'gesto abrir/transformar':'function transformarItem' in chk and 'function abrirTransf' in chk,
 'camera android':'capture="environment"' in chk,
 'pagar parcela':'function pagarParcela' in chk and 'function desmarcarParcela' in chk,
 'carimbo de versao':'BUILD_TAG=' in chk and "const BUILD_TAG='dev'" not in chk,
 'fracionamento sem boosters (setBpu)':'function setBpu' in chk and 'function unMiolo' in chk,
 'abrir fracionado':'ab_qtdA' in chk and "baixarBoosters(pai.id,qtdA,'Aberto'" in chk,
 'preco liga exibido no app':'function precoLigaDe' in chk and 'ligaHint' in chk,
 'preco liga (site certo por JOGO, nao mais cravado no Pokemon)':'const LIGAS=' in chk and 'function ligaDoJogo' in chk and 'ligaonepiece.com.br' in chk and 'ligayugioh.com.br' in chk and "'/?view=cards/search&card='" in chk and 'function abrirLigaDoItem' in chk,
 'filtro tipo de produto (3 telas)':'relCat' in chk and 'consCat' in chk and 'ctCat' in chk and 'Tipo de produto' in chk,
 'grafico evolucao liga':'function graficoLiga' in chk and 'function ligaHistDe' in chk and 'function ligaVersoes' in chk,
 'id unico anti-colisao':'function novoId' in chk and "'m'+Date.now()" not in chk,
 'sync visivel (falha nunca silenciosa)':'function setSync' in chk and 'syncDot' in chk and '_doc1mbAviso' in chk,
 'impressao seletiva do fluxo':'function imprimirFluxo' in chk and 'data-psec' in chk and "tela==='contas'?'Fluxo de caixa'" in chk,
 'print compacto (esconde forms)':'select,input,button,.btn,.x,.soon,.noprint{display:none' in chk,
 'link direto da liga (ambiguo/selado)':'function setCodigoUrl' in chk and 'codigoUrl' in chk,
 'print do fluxo em tabela':'printTable' in chk and 'function okCtG' in chk and 'pt-sec' in chk,
 'extrato com saldo real':'function saldoBaseExtrato' in chk and 'function antesDaBase' in chk and 'Saldo inicial' in chk,
 'atalho extrato no fluxo':'saldo linha a linha' in chk,
 'secoes do fluxo minimizaveis':'function togSecCt' in chk and "secTit('pagar'" in chk and "secTit('pagas'" in chk,
 'projecao de caixa (fisico)':'function projecaoCaixa' in chk and 'pendCompra' in chk and 'pendReceber' in chk,
 'print colunado (thead+conta+sinais)':'pt-cab' in chk and 'Fornecedor / cliente' in chk and 'table-header-group' in chk,
 'extrato imprimivel c/ saldo':'EXTRATO' in chk and 'Saldo inicial${perDe' in chk and 'recebido' in chk,
 'assist de codigo (nome/vale automatico)':'function assistCod' in chk and "assistCod('ab_cod'" in chk and "assistCod('r_cod'" in chk,
 'abrir como tipo no lancar':"'ABRIR','" in chk and "'Abrir']" in chk and "t==='ABRIR'" in chk,
 'abrir com destino por item (sobras vao pra colecao)':'function togAbItemSit' in chk and 'sitItem' in chk and "sitX=x.sitItem" in chk,
 'fotos nao apagam formulario nao salvo':'function atualizarBadgeFotos' in chk and 'fotosLancTxt' in chk and chk.count('fecharModal();atualizarBadgeFotos()')>=3,
 'organizar colecoes nao apaga formulario':'function atualizarColSel' in chk and chk.count("atualizarColSel('")>=2,
 'link direto funciona sem codigo':'!m.codigo||!pl||' in chk and 'Sem código' in chk,
 'dica nome+codigo na busca':'Nome (código)' in chk,
 'vinculo retroativo compra-venda':'function abrirVinculo' in chk and 'function confirmVinculo' in chk and 'vincular a uma venda já lançada' in chk and 'de onde saiu? (estoque · coleção · pedido)' in chk,
 'lucro exibido na venda vinculada':"comprei por" in chk and "vendi líquido por" in chk,
 'vinculo respeita booster (nao devora a caixa)':'function perguntarUnidadeVinculo' in chk and 'baixarBoosters(compra.id,vQ' in chk,
 'abrir sempre oferece boosters (pergunta na hora)':'function abUnAChange' in chk and 'boosters avulsos…' in chk,
 'ver na liga no cadastro (5 campos, cada um com o JOGO junto)':'function buscarLigaCampo' in chk and chk.count('buscarLigaCampo(')>=5 and chk.count("_jogo')")>=4 and 'function abrirLigaDoCampo' in chk,
 # [21/08, revisao de fiacao] antes esta linha lia o versao.json do DISCO, que o proprio
 # script acabara de escrever — conferia a propria escrita. Agora compara o carimbo que
 # SERA gravado com o que esta EMBUTIDO no artefato: duas coisas produzidas separadamente.
 'auto-aviso de versao nova (cura cache iphone)':'function checarVersao' in chk and 'verNova' in chk and 'visibilitychange' in chk and (lambda v: v.get('tag')==re.search(r"const BUILD_TAG='([^']*)'",chk).group(1) and int(v.get('ts',0))==int(re.search(r'const BUILD_TS=(\d+)',chk).group(1)))(json.loads(_CARIMBO)) and f'const BUILD_TS={_ms}' in chk,  # sem 'ts' o aviso de versao cala pra sempre (achado 21/08)
 'colinha de padroes de codigo':'function abrirPadroesCod' in chk and '167JP/165' in chk and '173C/151' in chk and chk.count('abrirPadroesCod()')>=4,
 'colar link preenche nome+codigo':'function parseLinkLiga' in chk and 'function colarLinkLiga' in chk and chk.count('colarLinkLiga(')>=4 and 'linkUrl' in chk,
 'corrigir item nas listas da troca':'function editDei' in chk and 'function editRecebi' in chk and chk.count('✎ corrigir')>=2,
 'botao infinito nos campos de codigo':'function insSimbolo' in chk and chk.count("insSimbolo('")>=5 and '032/∞' in chk,
 'codigo sujo acha preco (codLimpo)':'function codLimpo' in chk and chk.count('codLimpo(')>=4,
 'nao-coletada avisa em vez de silencio':'ainda não coletada' in chk,
 'botoes de codigo maiores (toque)':chk.count('font-size:12.5px;padding:3px 4px')>=8 and 'border:1.5px solid var(--blue);border-radius:8px;padding:1px 12px' in chk,
 'scanner de carta (ocr local)':'function escanearCod' in chk and 'function ocrWorker' in chk and 'function aplicarScan' in chk and chk.count('📷 escanear')>=3,
 'scanner chips 1-toque (jp/kr/c)':'🇯🇵 japonesa' in chk and '🇰🇷 coreana' in chk and '🇨🇳 chinesa' in chk,
 'arquivos do leitor no repo':all(__import__('os').path.exists(r'C:\Users\USER\tcg-web\ocr'+'\\'+f) for f in ['tesseract.min.js','worker.min.js','tesseract-core-simd-lstm.wasm.js','tesseract-core-lstm.wasm.js','lang\\eng.traineddata.gz','lang\\osd.traineddata.gz']),
 'vinculo consultavel (veio de + ver item + nota)':'function verMov' in chk and 'function vinculoInfoVenda' in chk and 'veio de' in chk and chk.count('verMov(')>=3,
 'vinculo reverso no item (compra ve suas vendas)':'vendido em' in chk and "v.origemId===m.id" in chk,
 'desvincular seguro (retroativo + formato criacao)':'function desvincular' in chk and 'x.loteOrigem===alvo.id' in chk and chk.count('desvincular(')>=2,
 'badge de vinculo na lista de vendas':'sem vínculo' in chk and '🔗 vinculada' in chk,
 'aviso de vendas sem vinculo + explicacao':'semVincBar' in chk and 'não sabe de onde ela saiu' in chk,
 'edicao preserva vinculo/parcelas/nota/fotos':'Object.assign({},e,obj)' in chk,
 'pedido vendavel (pool + guard)':"sitDe(d)==='Pedido'?'🚚 ':''" in chk and 'eraPedido' in chk and chk.count('PEDIDO (a caminho')>=2,
 'vinculo aceita item em pedido':"sitDe(c)==='Pedido')" in chk and "sitAntes==='Pedido'?'pedido'" in chk,
 'desvincular devolve ao pedido':"v.vendaDe==='pedido'?'Pedido'" in chk,
 'venda multi-item agrupada (verVenda)':'function verVenda' in chk and 'venda ×' in chk and 'ver a venda completa' in chk,
 'lote completo (verLote)':'function verLote' in chk and 'ver o lote completo' in chk and 'Custo total do lote' in chk,
 'trocas na consulta':"['TROCA','🔄','Trocas'" in chk and "consF==='TROCA'" in chk and 'duas pontas' in chk,
 'venda herda foto do item':'orig&&orig.fotoThumb' in chk and 'fotos do item (' in chk,
 'aviso venda sem foto':chk.count('SEM foto')>=2,
 'venda varios avisa item indisponivel':'não está mais disponível' in chk,
 'titulo fixo ao rolar (sticky abaixo do header)':'position:sticky;top:var(--hh,0px)' in chk and 'function fixAlturaHeader' in chk,
 'custo+lucro por venda vinculada na linha do item':'custou ' in chk and 'que ainda estão no estoque' in chk and 'não é dívida' in chk,
 'detector de origem (re-vinculo assistido)':'function procurarOrigem' in chk and 'function aplicarOrigem' in chk and 'function fragOrfao' in chk and 'procurar origem sozinho' in chk,
 'venda historica (sai das pendencias, reversivel)':'function marcarHistorica' in chk and 'function desmarcarHistorica' in chk and "semOrigem!=='historico'" in chk and '📜 histórica' in chk,
 'rotulos auto-explicativos do vinculo':'vincular a uma venda já lançada' in chk and 'de onde saiu? (estoque · coleção · pedido)' in chk,
 'aba compras por NOTA (default) + detalhado':"consVer='notas'" in chk and '🧾 por nota' in chk and '☰ detalhado' in chk and 'frete/taxa incluído' in chk,
 'contexto da nota no item (soma da aba vs nota inteira)':'A nota inteira tem' in chk and 'em outra situação' in chk,
 'conservacao por subtracao no baixarLote (residuo no pai)':'vOrig-vPedL' in chk,
 'dono do pedaco gravado na criacao (vendaRef)':chk.count('vendaRef')>=8,
 'detector nao oferece pedaco com dono (contagem legado)':'vendasPai>=pedacosVend' in chk,
 'rateio proporcional no re-vinculo (qtd diferente)':'PROPORCIONAL' in chk,
 'guard de venda avulsa (sem origem escolhida)':'Venda AVULSA' in chk,
 'raiz da nota visivel (produto + frete/taxa por item)':'produto e frete/taxa separados são a prova real' in chk and 'parte já saiu do lote' in chk,
 'pedidos por nota + vendas agrupadas por venda':"consF==='COMPRA'||consF==='PEDIDO'" in chk and '🧾 por venda' in chk,
 'card da nota nunca mente (total inteiro de movs)':'o filtro atual mostra' in chk,
 'frete e taxa separados no rateio':'function ratearExato' in chk and 'taxaRateio' in chk and chk.count('taxaRateio')>=6,
 'rateio exato (residuo no ultimo, nunca negativo)':'Math.floor(extra*v/tot*100)/100' in chk and 'Math.round((extra-acum)*100)/100' in chk,
 'parcela paga congela valor (formato {d,v} + legado)':'const pgData=' in chk and 'const pgValor=' in chk and 'v:Math.round((+valor||0)*100)/100' in chk and chk.count('pgValor(pg[i+1]')>=2,
 'edicao pela nota (re-rateio + guarda pedacos)':'function editarNota' in chk and 'function salvarEdicaoNota' in chk and 'travados' in chk and 'editar a nota — quantidades' in chk,
 'modal da nota nao empilha':"fecharModal();abrirNota(nid);render();}" in chk and chk.count("?.remove();document.body.insertAdjacentHTML")>=5,
 'guarda de edicao cobre baixa integral (notaTemSaidas)':'function notaTemSaidas' in chk and "['Vendido','Trocado','Aberto'].includes(sitDe(m))" in chk,
 'obs de item juntado preservada na edicao da nota':'(?=( · )|$)' in chk,
 'venc1 editavel pela nota':'ne_venc1' in chk,
 'prova real (audit no app)':'function provaReal' in chk and 'function abrirProvaReal' in chk and 'Conservação violada' in chk and 'Material vendido sem venda apontando' in chk and 'Nada é corrigido sozinho' in chk,
 'valorOrig gravado no 1o fracionamento':chk.count('valorOrig==null)lote.valorOrig')>=2,
 'prova real no painel + boot':('abrirPendencias()' in chk or 'abrirProvaReal()">🩺 prova real' in chk) and 'R.pr||provaReal()' in chk and 'provaReal();if(tela===' in chk,  # o botao solto virou o painel unificado de pendencias (21/08): a checagem passou a aceitar as DUAS portas, e exige que o motor da prova real de fato alimente o painel
 'historicas em massa com conferencia':'function abrirHistoricasMassa' in chk and 'function aplicarHistoricasMassa' in chk and 'Conferi a lista' in chk and 'border-top:4px solid var(--amber)' in chk,
 'edicao de troca legado nao zera':"g('f_custou')!=null?" in chk and "(+e?.custou||0)" in chk,
 'obs com aspas sobrevive a edicao':chk.count('''.replace(/"/g,'&quot;')}">''')>=3,
 'toast acima dos modais':'pointer-events:none;z-index:60}' in chk,
 'print esconde modais e barra de versao':'#toast,#modal,#modalPad,#verNova{display:none!important}' in chk,
 'ink definida no tema':'--ink:var(--txt)' in chk,
 'sticky recalcula com header vivo':'fixAlturaHeader();})();' in chk and 'setTimeout(fixAlturaHeader,50);' in chk,
 'projecao nao estoura no celular':'repeat(4,minmax(0,1fr))' in chk,
 'relatorio aparece com so despesas':"m.tipo==='DESPESA'))return" in chk,
 'sair da conta visivel na nuvem':'sairConta()">🚪 sair da conta' in chk,
 'imprimir cobre pedidos e trocas':"PEDIDO:'Pedidos" in chk and "TROCA:'Trocas'" in chk,
 'ficha sem salto de modo (verFicha)':'function verFicha' in chk and 'function irDetalhe' in chk and chk.count("verFicha('${m.id}')")>=2 and 'abrir na lista (todas as ações)' in chk,
 'verMov fecha modal por cima':'fecharModal(); /* chamado de dentro de modais' in chk,
 'irDetalhe reabre grupos':'consGrupoFech={};expandId=id;render()' in chk,
 'selMode nao vaza entre abas':'selMode=false;selIds={};tela=t;' in chk,
 'dica de juntar avulsos na vista por-nota':'junte aqui' in chk,
 'typeahead nos 5 seletores de item':'function selBusca' in chk and 'function sbFiltra' in chk and 'function sbPick' in chk and all(("selBusca('"+x+"'") in chk for x in ['f_origem','f_item','ab_pick','v_orig','d_item']),
 'typeahead: digitar por cima desfaz a escolha':'sbNorm(atual.rot)!==q)hid.value=' in chk,
 'typeahead: dropdown escapa html do usuario':".replace(/&/g,'&amp;').replace(/</g,'&lt;')" in chk,
 'editDei preserva modo boosters (pos-render)':'DEPOIS do render' in chk,
 'transferencia/aporte entre contas (TRANSF)':'function abrirTransferencia' in chk and 'function salvarTransferencia' in chk and "m.tipo==='TRANSF'" in chk and 'fora do app (pessoal/externo)' in chk,
 'saldo fisico por conta (regime caixa)':'function saldoFisicoConta' in chk and 'dinheiro FÍSICO hoje' in chk and 'antesBase(pgData(p))' in chk,
 'parcela paga diz de qual conta saiu':'function confirmarPagarParcela' in chk and 'Saiu de qual conta?' in chk,
 'troca com conta do dinheiro dado':'t_dinconta' in chk and 'ft1.dinConta=' in chk,
 'migracao sem-conta para a conta dinheiro':'function migrarSemConta' in chk and "toLowerCase()==='dinheiro'" in chk,
 'aviso de lancamento sem conta':'function avisaSemConta' in chk and chk.count('avisaSemConta(')>=6,
 'rename de conta propaga nos campos novos':'m.contaDe===antigo' in chk and 'p.conta===antigo' in chk,
 'nota no fisico usa o filtro do a-pagar':"x.pgTipo==='Parcelado'&&+x.nParc>0);" in chk,
 # --- 3 dores reportadas pelo Felype em 21/08, cadastrando troca de One Piece ---
 'troca deixa dar carta da COLECAO, nao so do estoque':'const _mt=motor();' in chk and '(_mt.disp||[]).concat(_mt.colItens||[])' in chk and "sitDe(d)==='Coleção'?'⭐ '" in chk,
 'busca na Liga vai pro site do JOGO do lancamento':'function ligaDoJogo' in chk and "'onepiece':'www.ligaonepiece.com.br'" in chk and "'naruto'" not in chk,
 # a ligadragonball partiu em dois jogos: o www. so devolve "qual card game deseja visualizar?".
 # Se alguem "arrumar" isto de volta pro www., o botao volta a nao buscar nada.
 'Dragon Ball aponta pro host que RESPONDE a busca':"'dragonball':'fusion.ligadragonball.com.br'" in chk,
 # UMA porta so monta a URL da Liga. Duas copias foi como nasceu a meia cura do colar-link.
 # [21/08 revisao, M5] ligaJogoAtual cai pra 'Pokemon' CALADO se o seletor nao existir na tela.
 # Hoje os 4 ids existem; uma renomeacao futura reintroduziria o bug em silencio. Esta linha
 # confere que todo buscarLigaCampo('campo','seletor') tem o id="seletor" no arquivo.
 # [21/08, revisao de fiacao] a versao anterior casava UMA forma de escrever a chamada. Nas
 # outras (aspas duplas, espaco antes da virgula, crase) ela nao casava nada — e `all([])` e
 # True: verde por zero casamento, justamente no bug que a linha existe pra pegar. Agora o
 # numero de chamadas ENTENDIDAS tem de bater com o numero de chamadas que existem no texto;
 # forma nova de escrever vira alarme, nao silencio.
 'todo seletor de jogo citado na busca da Liga existe na tela':(
   len(_chamLiga)==_litLiga        # so as chamadas em forma LITERAL entram na conta
   and len(_chamLiga)>=3
   and all(('id="%s"' % sel) in chk for _campo, sel in _chamLiga)),
 'a URL da Liga e montada num lugar so':chk.count("'/?view=cards/search&card='")==1,
 # validar link COLADO pelo dominio-base: subdominio (fusion., masters.) tem de passar
 'colar link aceita subdominio da Liga':'LIGAS_BASE' in chk and "h.endsWith('.'+b)" in chk,  # [21/08] sem exigir a FORMA da declaracao: juntar duas constantes numa linha nao muda comportamento e nao pode reprovar  # o comentario CITA liganaruto (pra dizer que nao existe); o que nao pode e ele estar no MAPA
 # [21/08 revisao] a cura do vazamento de foto e de REGRA UNICA (a identidade do formulario),
 # nao porta a porta — eu tinha curado go() e sobraram 3 portas abertas ("< voltar", trocar o
 # tipo, alternar item<->Nota). Quem exercita isso de verdade e o testes-nucleo (secao 13);
 # aqui a checagem existe pra que ninguem DESFACA a regra voltando ao remendo por porta.
 'foto do item: regra unica, nao remendo por porta':'function _idForm()' in chk and 'function guardaBaldeItem()' in chk and 'guardaBaldeItem();' in chk.split('function render()')[1][:200],
 'corrigir item devolve as fotos dele (nota E troca)':'function editItemNota' in chk and chk.count('_fotosItem=(')>=2 and 'function baldeItemLivre()' in chk,
 'corrigir outro item avisa antes de descartar foto em digitacao':'if(!baldeItemLivre())return;' in chk and chk.count('if(!baldeItemLivre())return;')==2,
 'foto POR ITEM na troca e na nota (nao so a foto da nota)':'let _fotosItem=' in chk and 'function abrirFotosItem' in chk and 'function aplicarFotosDoItem' in chk and 'aplicarFotosDoItem(r.fotos,nvT.id)' in chk and 'aplicarFotosDoItem(it.fotos,_idIt)' in chk and chk.count('abrirFotosItem()')>=2,

 # --- clique duplo (Felype, 2026-08-21) ---
 'toque repetido no mesmo botao de gravar nao grava duas vezes':'const RE_GRAVA=' in chk and "_ultToque.chave===attr&&agora-_ultToque.ts<900" in chk and "let _ultToque={chave:null,ts:0}" in chk and 'ev.stopImmediatePropagation();' in chk,
 'e o primeiro toque da retorno na hora (senao a pessoa toca de novo)':".agindo{opacity:" in chk and "el.classList.add('agindo')" in chk and 'pointer-events:none' in chk,

 # --- correcoes da revisao adversarial (2026-08-21) ---
 'aviso de varias linhas vira FUNCAO, nunca fica dentro do botao':'function limparTudo(' in chk and 'onclick="limparTudo()"' in chk,
 'exclusao vale mesmo com o outro aparelho em versao antiga':'if(Array.isArray(movs))movs=movs.filter(m=>!estaExcluido(m&&m.id));' in chk and 'if(Array.isArray(cadastros))cadastros=cadastros.filter' in chk,
 'restaurar um ponto ESQUECE a exclusao do que volta':'function esqueceExclusaoDe' in chk and 'function desmarcaExcluido' in chk and 'esqueceExclusaoDe({movs});' in chk and 'esqueceExclusaoDe(o);' in chk,
 'o numero do aviso usa a mesma regra do motor (caixa aberta nao conta 2x)':"const somaV=a=>a.reduce((s,x)=>{const st=sitDe(x);return (st==='Aberto'||st==='Trocado')?s:s+(+x.valor||0);},0);" in chk and "abertos:por('Aberto')" in chk,
 'manter as vendas nao deixa a prova real vermelha':'const subSoma=raizId=>' in chk and 'x.valorOrig=subSoma(x.id);' in chk,
 'cancelar o motivo CANCELA a devolucao':'if(resp===null){toast(' in chk and 'Devolução cancelada' in chk,
 # [F0 22/08] a fusao mudou de casa (fundirComRemoto, parametro `r`) — aceitar as duas formas: trava que barra refatoracao legitima ensina a pular a trava
 'conta, colecao e jogo apagados tambem nao ressuscitam':"marcaExcluido(id);contasBanc=contasBanc.filter" in chk and ("mergeArrUniao(cols,remoto.cols,'cols:')" in chk or "mergeArrUniao(cols,r.cols,'cols:')" in chk) and ("mergeArrUniao(jogos,remoto.jogos,'jogos:')" in chk or "mergeArrUniao(jogos,r.jogos,'jogos:')" in chk) and ("mergeArrUniao(pgs,remoto.pgs,'pgs:')" in chk or "mergeArrUniao(pgs,r.pgs,'pgs:')" in chk),

 # --- rodada EXCLUSAO-LASTRO (2026-08-21) ---
 'exclusao registrada sobrevive ao merge (a causa da exclusao que voltava)':'function marcaExcluido' in chk and 'function estaExcluido' in chk and 'function podaExcluidos' in chk and 'return Object.values(byId).filter(m=>!estaExcluido(m&&m.id));' in chk,
 'registro de exclusao viaja pela nuvem (payload + merge + volta)':'codigosResolvidos,excluidos};' in chk and ('excluidos:mergeDictRaso(excluidos,remoto.excluidos),' in chk or 'mergeDictRaso(excluidos,r.excluidos)' in chk) and "if(d.excluidos&&typeof d.excluidos==='object')" in chk and "gravaLocal('tcg_excluidos'" in chk,
 'catalogo apagado tambem nao ressuscita (fornecedor/cliente)':'function mergeArrUniao(local,remoto,pref){' in chk and 'if(pref&&estaExcluido(pref+v))return;' in chk and ("mergeArrUniao(pess,remoto.pess,'pess:')" in chk or "mergeArrUniao(pess,r.pess,'pess:')" in chk) and "marcaExcluido('pess:'+nome," in chk and "marcaExcluido('cols:'+c)" in chk and "marcaExcluido('jogos:'+j)" in chk,
 'aviso completo em TELA, nunca confirm curto pra acao grave':'function modalAviso' in chk and 'ESCOLHA O QUE FAZER' in chk and 'cancelar — não mexer em nada' in chk and "if(confirm('Excluir este lançamento?')){movs=movs.filter" not in chk,
 'excluir venda: devolver ao lugar de origem OU apagar tudo (o dono escolhe)':"'vendaVolta'" in chk and "'vendaTudo'" in chk and 'Apagar a venda e devolver o produto ' in chk and 'Apagar tudo — a venda E o produto' in chk,
 'excluir venda devolve o item pro lugar de onde ele saiu':'function voltarPeca' in chk and 'function pecaDaVenda' in chk and "const direto=movs.find(x=>x.tipo==='COMPRA'&&x.vendaRef===v.id);" in chk,
 'excluir estoque leva o pedido do mesmo produto junto (unidade = compra inteira)':'function famDe' in chk and 'const raiz=raizDe(m0)||m0;' in chk and 'Este item é <b>parte</b> dessa compra' in chk and 'deste mesmo lote</b> (estoque, pedido, coleção) vai junto' in chk,
 'compra com venda pergunta: apagar junto ou manter a venda com o custo':"'compraTudo'" in chk and "'compraSobra'" in chk and 'manter as ' in chk and 'fica guardado como histórico' in chk,
 'manter a venda religa ela no pedaco que fica (nao deixa venda sem custo)':'f.vendas.forEach(v=>{const pc=pecaDaVenda(v);if(pc&&fica[pc.id]){v.origemId=pc.id;pc.vendaRef=v.id;}});' in chk and 'x.valorOrig=+x.valor||0;' in chk,
 'devolucao existe separada da exclusao, com motivo gravado no item':'function devolver' in chk and 'function execDev' in chk and 'devObs' in chk and 'Motivo da devolução' in chk and '↩ devolução' in chk,
 'marcar como Vendido na mao avisa que nao entra dinheiro':"if(px==='Vendido'&&!confirm(" in chk and 'NENHUMA venda é criada' in chk,
 'apagar tudo e apagar nota registram a exclusao (senao voltavam pela nuvem)':'marcaExcluido(movs.map(x=>x.id));movs=[];' in chk and 'marcaExcluido(its.map(x=>x.id));movs=movs.filter(m=>m.notaId!==nid);' in chk,

 'prova real cobre contas':'sem origem E sem destino' in chk and 'Dinheiro de troca sem conta' in chk,
 'resultado nas duas leituras do dono (bruto antes do liquido)':'💰 Resultado líquido' in chk and '📊 Resultado bruto' in chk and 'comprei (mercadoria)' in chk and 'já é dinheiro de verdade' in chk and chk.index('📊 Resultado bruto')<chk.index('💰 Resultado líquido'),
 'resultado: cada numero com a propria conta embaixo (bruto antes das linhas, linhas repetidas no liquido)':'📊 Resultado bruto' in chk and "lin('comprei (mercadoria)'" in chk and chk.index('📊 Resultado bruto')<chk.index("lin('comprei (mercadoria)'") and chk.count("lin('comprei (mercadoria)'")>=2 and chk.count("lin('vendi (líquido)'")>=2,
 'resultado honesto (competencia + periodo)':'Parcelas futuras e repasses' in chk and 'total de HOJE' in chk and 'relPess||relCat)' in chk,
 'resultado movido pro final do painel':'${resultadoHTML}' in chk and 'Onde está o dinheiro' in chk and 'onclick="limparTudo()"' in chk and chk.index('${resultadoHTML}')>chk.index('Onde está o dinheiro') and chk.index('${resultadoHTML}')<chk.index('onclick="limparTudo()"'),  # o confirm saiu do atributo e virou funcao (21/08): aviso de varias linhas dentro de onclick nao compila
 'filtro do painel sempre visivel (sticky)':'position:sticky;top:var(--hh,0px);z-index:4' in chk and '🔎 Filtro ' in chk,
 'filtro padrao de entrada = 30 dias':"perSel='d30'" in chk and "perAte='',perSel='d30',consF='tudo'" in chk,
 'contas pagas honesto quando filtro de periodo corta':"'✓ Pagas — histórico'+filtrado" in chk,
 'lucro real casado por vinculo nos Relatorios':'function tabelaLucro' in chk and 'aggLucro' in chk and 'custo × venda casados pelo vínculo' in chk and 'cardLucroReal' in chk,
 'lucro real reconcilia com Vendi (mesma base de receita)':"o[k].receita+=liq;o[k].n++;" in chk and 'noPer(m.data))' in chk,
 'lucro real distingue pendente de historica (nao mistura no aviso da linha)':'v.semVinc?' in chk and 'v.hist?' in chk and 'semVinc:0,hist:0' in chk,
 'picker Janet fase 3 (codigo ambiguo resolvido 1x)':'let codigosResolvidos=get' in chk and 'function abrirEscolhaAmbigua' in chk and 'function escolherOpcaoAmbigua' in chk and 'function setCodigoUrlGlobal' in chk,
 'picker Janet persiste nuvem+backup+import (replace, nao merge)':'cadastros,contasBanc,codigosResolvidos,excluidos};' in chk and 'const payload={...final,_upd:Date.now()' in chk and "codigosResolvidos=d.codigosResolvidos;if(d.excluidos" in chk and 'gravaLocal(MK,JSON.stringify(movs));' in chk and "Object.keys(d.codigosResolvidos).length)codigosResolvidos=d.codigosResolvidos;salvarCad" in chk,
 'picker Janet escapa aspas duplas (dado externo do robo)':chk.count(".replace(/'/g,\"\\\\'\").replace(/\"/g,'&quot;')")>=6,
 'picker Janet avisa divergencia item-vs-global':'link PRÓPRIO diferente do link resolvido' in chk,
 'custoOrigem recalcula ao editar qtd de venda vinculada':'e.origemId&&e.custoOrigem!=null' in chk and 'custoUnit=(+e.custoOrigem||0)/qAntiga' in chk and 'movs[i].custoOrigem=Math.round(custoUnit*qNova' in chk,
 'prova real compara vinculo por unidade (nao falso-alarme apos editar qtd)':'custoUnitV=(+v.custoOrigem||0)/vQ,custoUnitAlvo=(+alvo.valor||0)/alvoQ' in chk and 'custoUnitV>custoUnitAlvo+0.02' in chk,
 'perfis de acesso: Laura so-lancamento (chokepoint no render)':'const PAPEL_POR_EMAIL' in chk and 'function papelAtual' in chk and "papelAtual()==='lancamento'){if(tela!=='lancar')tela='lancar';if(navHist.length)navHist=[];}" in chk,
 'perfis de acesso: nav escondida + boot direto no lancar + logout acessivel':"if(papelAtual()==='lancamento')document.querySelectorAll('nav button[data-t],.htop[data-t]').forEach" in chk and "go(papelAtual()==='lancamento'?'lancar':'painel')" in chk and 'papelAtual()===' + chr(39) + 'lancamento' + chr(39) + '?' + chr(96) + '<div class="lnk" style="margin-top:10px" onclick="sairConta()"' in chk,
 'condicao da carta (NM/LP/MP/HP) no cadastro e nas exibicoes':'const CONDS=' in chk and 'id="f_cond"' in chk and "condicao:(g('f_cond')&&g('f_cond')!=='—')?g('f_cond'):''" in chk and "d.condicao?' ['+d.condicao+']':''" in chk and 'Condicao' in chk,
 'condicao propaga em todos os caminhos de vinculo (5)':'condicao:src.condicao' in chk and 'condicao:it.condicao' in chk and 'cnd=it.condicao' in chk and 'venda.condicao=alvo.condicao' in chk and 'v.condicao=f.condicao' in chk,
 'acesso: default invertido pra restrito, dev local nao afetado':"const PAPEL_POR_EMAIL = {'felypexykawa@gmail.com':'admin','pokecentertcgoficial@gmail.com':'admin'}" in chk and "if(!_userEmail)return 'admin';return PAPEL_POR_EMAIL[_userEmail.toLowerCase()]||'lancamento';" in chk and "'projetofelype@gmail.com'" in chk,
 # [revisao C 23/08, N2] eram 4 barras fixas: a do titulo da Consultar deixou de ser fixa de proposito (a de Filtros leva o nome da aba); ficam 3 filtros fixos
 'filtro sticky em todo lugar + rola so ao abrir (nao ao fechar)':chk.count('position:sticky;top:var(--hh,0px);z-index:4')>=3 and "aberto?'':\";window.scrollTo({top:0,behavior:'smooth'})\"" in chk and chk.count("window.scrollTo({top:0,behavior:'smooth'})") >= 5,
 'colecao mostra valor de mercado alem do custo':'function valorMercadoDe' in chk and 'colItens' in chk and 'cv.comN&&!cv.semN' in chk and 'preços da Liga' in chk,
 'estoque tambem mostra valor de mercado (mesmo padrao)':"valorMercadoDe(r.disp)" in chk and 'ev.comN&&!ev.semN' in chk,
 'valor de mercado nunca zera (atual da Liga -> ultimo visto -> custo)':'function ultimoPrecoLigaDe' in chk and 'porUltimo' in chk and 'porCusto' in chk,
 'condicao no formulario de troca (item recebido)':'id="r_cond"' in chk and "condicao:(cond&&cond!=='—')?cond:''" in chk and "s('r_cond').value=r.condicao" in chk and "condicao:r.condicao||''" in chk,
 'condicao no formulario de nota (compra em lote)':'id="n_cond"' in chk and "condicao:(cond&&cond!=='—')?cond:''" in chk and "condicao:it.condicao||''" in chk,
 'nota tem corrigir item (editItemNota), simetria com a troca':'function editItemNota' in chk and 'editItemNota(${i})' in chk and "s('n_cond').value=it.condicao" in chk,
 'verVenda aviso de lucro honesto (sem vinculo = menor)':'lucro real é MENOR' in chk,
 'verLote acha venda nos 2 formatos de vinculo':'v.origemId===x.loteOrigem' in chk,
 'edicao com troca de tipo nao vira quimera':"(e&&e.tipo===obj.tipo)?Object.assign" in chk,
 'destIni acompanha situacao corrigida':"(e.situacao||'')===(obj.situacao||'')" in chk,
 'despesa/troca em edicao preservam fotos':'{...movs[i],...base,id:editId,data:' in chk and "(old&&old.tipo===o.tipo)?{...old,...o}:o" in chk,
 'concorrencia: salvarNuvem funde por id (nao sobrescreve documento inteiro)':'function mergePorId' in chk and 'runTransaction' in chk and '_ultimoUpdAplicado' in chk,
 'concorrencia: fusao estendida a todos os catalogos, nao so movs':'function mergeArrUniao' in chk and 'function mergeDictRaso' in chk and 'function mergeColsJ' in chk and 'function mergeColsG' in chk and chk.count("tcg_cadastros',JSON.stringify(cadastros))")>=1,
 'restaurarBackup sincroniza com a nuvem (trava _restaurando protege a corrida)':'_restaurando=true' in chk and 'if(!d||_restaurando)return' in chk,
 'sem internet: lancamento local sobrevive ao snapshot do outro aparelho (pendencia + fusao, F0 22/08)':'function marcaPendNuvem' in chk and 'function fundirComRemoto' in chk and 'const fundiuPend=pendNuvem();' in chk and 'if(fundiuPend){' in chk and "localStorage.getItem('tcg_pend_nuvem')==='1')_pendSeq=1" in chk and 'limpaPendNuvem(seqCap)' in chk and chk.count('marcaPendNuvem();if(_syncReady)salvarNuvem();')>=3,
 # [revisao 23/08] G1 remoto vence no empate da porta da pendencia · G2 marca pelo gravaLocal · G3 refusao no .then · M1 restaurar limpa a pendencia
 'sem internet, ajustes da revisao 23/08: remoto vence no boot, marca no disco, save durante o commit, restaurar limpa':'fundirComRemoto(d,true)' in chk and "gravaLocal('tcg_pend_nuvem','1')" in chk and 'const g=fundirComRemoto(final);' in chk and 'limpaPendNuvem(_pendSeq);' in chk and 'finally{excluidos=excAntes;}' in chk,
 # [fatia C 23/08 — Consultar sem confusao, com os ajustes da revisao adversarial]
 'consultar: aba na barra fixa, chip de tipo, Todos sem somar, lote = 1 card (so Compras, sem nota), voltar no lugar, book = lote':"TITF[consF]+' · '" in chk and "const tipoChip=venda?'<span class=\"tag v\">💰 venda</span> '" in chk and 'const partesTudo=[' in chk and "const fam=consF==='COMPRA'?movs.filter(x=>x.tipo==='COMPRA'&&!x.notaId&&" in chk and 'o filtro atual mostra ${noFiltro} de ${fam.length} partes desta compra' in chk and 'function voltarDaEdicao' in chk and 'const pv=_pendVolta;_pendVolta=null;' in chk and 'if(_preSel){_preSel=null;toast' in chk and "_precosTentado=true;if(j&&j.cartas)" in chk and "function marcarLoteSemCodigo" in chk and '&&!m.codigoNA)' in chk and 'scrollY:sy' in chk and "consVer='notas';render();}" in chk,
 # [re-checagem 23/08, N1] base confirmada por hash: operacao composta feita sem rede nao e rasgada pela fusao
 'sem internet, N1: base confirmada por registro (hash) decide quem vence no empate — nao rasga baixa/venda feita sem rede':'function mergePorIdBase' in chk and 'function gravaBaseConfirmada' in chk and 'baseCap=calcBase(final);' in chk and 'publicaBase(baseCap);' in chk and 'if(!fundiuPend)gravaBaseConfirmada(d);' in chk and 'remotoVence?mergePorIdBase(a,b)' in chk and "localStorage.getItem('tcg_base_h')" in chk and 'trocasLocais.has(m.trocaId)' in chk and 'Object.keys(v).sort().reduce' in chk and 'if(USAR_NUVEM&&!Object.keys(_baseH).length&&!pendNuvem())' in chk and 'const baseAntes=_baseH;limpaPendNuvem(_pendSeq);' in chk and 'publicaBase(baseAntes);' in chk,
 'fusao com o remoto: tumulos ANTES de unir, uma funcao pras duas portas (salvarNuvem e aplicarNuvem)':'final=fundirComRemoto(remoto)' in chk and 'mergeDictRaso(excluidos,r.excluidos)' in chk and 'function gravaTudoLocal' in chk and "gravaLocal('tcg_excluidos',JSON.stringify(excluidos));}" in chk,
 'prova real: 5 checagens novas (tipo/condicao/conta excluida/vencimento/multi-item)':"TIPOS_OK=new Set(['COMPRA','VENDA','DESPESA','TRANSF'])" in chk and 'CONDS_OK=new Set' in chk and 'porVendaId' in chk and 'porTrocaId' in chk,
 'prova real: conta excluida so nos campos que usam contasBanc (nao no texto livre m.conta)':'if(contaSumiu(m.conta))' not in chk and 'contaSumiu(m.contaDe)' in chk,
 'aviso de versao nova honesto quando o cache do GitHub Pages nao passou ainda':'_veioDeAtualizar' in chk and 'O servidor ainda está servindo a versão antiga' in chk,
 'R1: form nao zera - eco da propria escrita nao repinta + flag de rascunho por interacao':'if(d._upd&&d._upd===_ultimoUpdAplicado)return;' in chk and '_lancarDirty' in chk and "v.addEventListener('input',marca)" in chk,
 'R1: voltar() saindo do lancar limpa rascunho E fotos pendentes (bug pre-existente)':"if(tela==='lancar'&&s.tela!=='lancar'){_lancarDirty=false;_fotosPend=[];}" in chk,
 'diagnostico de lote com conta quebrada aponta o culpado (nao so "a soma difere")':'function diagLote' in chk and 'function soltarIntrusa' in chk and 'O que explica a diferença' in chk,
 'busca por digitacao na Consulta (debounce + preserva foco/cursor no celular)':'function buscaCons' in chk and 'consBusca' in chk and 'setSelectionRange' in chk,
 'nota sem produto inteiro lista os pedacos clicaveis (nao manda tocar em nada)':'Nenhum produto desta nota está inteiro hoje' in chk and "onclick=\"fecharModal();verLote(" in chk,
 'picker de carta ambigua tenta o codigo original antes do limpo (Charizard-V)':'precoLigaDe(codigo)||precoLigaDe(codC)' in chk,
 'pergunta na edicao de qtd (manter total ou manter custo por unidade)':'qtdNova!==qtdAntiga' in chk and 'manterTotal' in chk,
 'juntar lote - par simetrico de soltarIntrusa, filtra vendido/trocado do candidato':'function abrirJuntarLote' in chk and 'function confirmJuntar' in chk and "['Em estoque','Pedido','Coleção'].includes(sitDe(c))" in chk,
 'painel de pendencias so aponta FATO (sem preco ou sem codigo), nunca julga formato':'function pendenciasCodigo' in chk and 'RE_COD_LIGA' not in chk and "motivo:'sem_preco'" in chk and 'Não estou julgando o formato' in chk,
 'infinito do teclado (emoji) normalizado pro da Liga em todo caminho de codigo':'function normCod' in chk and 'function codLimpo(cod){cod=normCod(cod);' in chk,
 'busca de preco casa os DOIS formatos de infinito (arquivo real tem emoji E matematico)':'function idxLigaNorm' in chk and 'ix[normCod(cod)]||ix[codLimpo(cod)]' in chk,
 'painel nao acusa nada enquanto os precos nao carregaram (evita alarme de 100%)':'const temPrecos=!!(_precosLiga&&_precosLiga.cartas)' in chk and 'if(!temPrecos)return null;' in chk,
 'memoria local cheia NUNCA impede de salvar na nuvem (era a causa da exclusao que voltava)':'function gravaLocal' in chk and 'const save=()=>{gravaLocal(MK' in chk and 'localStorage.setItem(MK,JSON.stringify(movs))' not in chk,
 'copias de seguranca locais enxutas (8 sem miniatura, era 20 com) - o que enchia a memoria':'if(b.length>8)b=b.slice(-8)' in chk and 'delete c.fotoThumb' in chk,
 'dados chegando SEMPRE liberam o menu - erro no processamento nao deixa tela morta':'function telaFalhaApp' in chk and 'tropeçou' in chk and "catch(e){falha='ao aplicar seus dados: '" in chk,
 'login aprovado tira a tela de login na hora (nao espera o banco) - o laco nascia aqui':'function telaCarregando' in chk and 'limpouRedirect();_telaLoginNoAr=false;telaCarregando();' in chk,
 'volta do Google sem logar avisa em vez de calar (SDK resolve nulo, nao rejeita)':'function voltouDeRedirect' in chk and 'voltou do Google mas o login não completou' in chk,
 'desistir do popup nao arrasta pro Google; so bloqueio real troca de metodo':'popup-blocked|operation-not-supported' in chk and 'popup-closed-by-user|cancelled-popup-request' in chk,
 'voltar pelo botao do navegador nao deixa o botao de entrar preso':"addEventListener('pageshow'" in chk,
 'login no celular usa redirecionamento (popup do Safari nao volta - loop infinito)':'function ehCelular' in chk and 'signInWithRedirect' in chk and 'getRedirectResult' in chk,
 'login mostra o erro na tela em vez de voltar mudo pro formulario':'O Google recusou o login: ' in chk and 'me manda esta mensagem' in chk,
 # [21/08] a guarda do balde de fotos passou a rodar ANTES deste return — ela nao PINTA nada,
 # so decide se a foto do item continua valendo, entao a protecao do login segue inteira. A
 # linha ficou mais exigente, nao menos: agora ela crava a ORDEM das duas.
 'login: render nao pinta por cima da tela de login (app ficava intransponivel deslogado)':'let _telaLoginNoAr=false' in chk and "function render(){guardaBaldeItem();if(_telaLoginNoAr)return;" in chk and 'function telaLogin(msg){_telaLoginNoAr=true;' in chk and '_syncReady=true;_telaLoginNoAr=false;' in chk,
 'scanner: leitura de codigo aberta a prefixo de letra (TG/GG/SV) e promocional com infinito':'0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ' in chk and '[A-Z]{0,3}' in chk,
 'scanner: deteccao de escrita morta removida, nao promete o que nao entrega':'await w.detect' not in chk and 'leitura duvidosa' in chk,
 'colinha de codigos declara o jogo e admite o que nao foi estudado':'function jogoAtualCod' in chk and 'ainda não foi estudado' in chk and 'Exclusiva daquele país = SEM letra' in chk,
 'aviso de gemeos com custo diferente no vinculo de venda':'gêmeo com custo diferente' in chk and 'chaveDup' in chk,
 'mesma compra: segunda saida do diagnostico (nunca so soltar), com redistribuicao provada':'function _calcMesmaCompra' in chk and 'function aplicarMesmaCompra' in chk and 'nada vai pra coleção' in chk and 'MESMA compra' in chk,
 'mesma compra: pedaco com filhos proprios fica fora da redistribuicao':'!movs.some(y=>y.loteOrigem===p.id)' in chk,
 'diagLote nao conta em dobro caixa aberta (mesma regra da prova real)':"origem==='ABERTURA'" in chk and 'filhosD' in chk,
 'diagnostico neutro: duas leituras, nunca induz (soltar OU mesma compra)':'Duas leituras possíveis' in chk and 'ela é de OUTRA compra' in chk and 'ela é da MESMA compra' in chk,
}
print('--- BUILD tcg-web ---')
for k,v in checks.items():print(('OK  ' if v else 'FALHA ')+k)
print(f'bytes deploy={len(chk)}  fonte={len(src)}  diff={len(chk)-len(src)}')
if not all(checks.values()):
    print('TEM FALHA')
    print('ARTEFATO NAO FOI TROCADO — o arquivo publicado continua exatamente como estava.')
    raise SystemExit(1)   # [21/08] antes saia 0 mesmo reprovando: quem chamasse por script via sucesso
open(DEP,'w',encoding='utf-8').write(out)
open(_VERSAO_JSON,'w',encoding='utf-8').write(_CARIMBO)   # [21/08] o carimbo anda junto com o artefato, nunca antes
print('TODOS OK')
