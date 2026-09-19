"""SUITE DA VACINA — prova que o checks-app.js pega o que promete E nao barra o que e legitimo.

Rodar:  python checks-suite.py     (da raiz do repo; nao toca em nada de producao)

Cada MUTACAO veio de um ataque real de revisao adversarial em 2026-08-20 — tres rodadas, cada
uma furando a versao anterior da vacina. Manter esta suite verde e o que impede a vacina de
regredir para "verde sem ter exercido nada", que foi como a regressao de 19/08 passou.

As REFATORACOES do fim sao o outro lado: trava que barra troca de aspas ou arrow function
ensina a usar --no-verify, e ai ela nao protege mais nada. Falso positivo aqui e defeito igual.
"""
import io, json, os, re, shutil, subprocess, sys, tempfile
# a saida tem seta e acento; sem isto o Windows tenta cp1252, estoura UnicodeEncodeError e a
# suite "falha" sem ter falhado (foi o que abortou a primeira publicacao que a chamou)
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# pasta de trabalho POR PROCESSO. Antes era um nome fixo: duas execucoes ao mesmo tempo
# (o publicar.sh e uma conferencia manual, ou um agente revisor em paralelo) disputavam a mesma
# pasta — uma apagava a da outra e a suite devolvia "0/6 refatoracoes passam", que e VEREDITO
# FALSO, nao falha real. Instrumento que mente sob concorrencia e pior que instrumento ausente:
# manda consertar o que nao esta quebrado. (Achado ao vivo em 2026-08-21.)
SP = os.path.join(tempfile.gettempdir(), 'checks-suite-tcg-%d' % os.getpid())
REPO = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir(SP):
    shutil.rmtree(SP, ignore_errors=True)
os.makedirs(os.path.join(SP, 'robo'))
import atexit
atexit.register(lambda: shutil.rmtree(SP, ignore_errors=True))
shutil.copy(os.path.join(REPO, 'precos.json'), os.path.join(SP, 'precos.json'))
shutil.copy(os.path.join(REPO, 'robo', 'codigos.txt'), os.path.join(SP, 'robo', 'codigos.txt'))
S = io.open(os.path.join(REPO, 'index.html'), encoding='utf-8').read()

def corta(src, n, decl='function '):
    i = src.index(decl + n + '(')
    j = src.index('{', i); k = 0
    while j < len(src):
        if src[j] == '{': k += 1
        elif src[j] == '}':
            k -= 1
            if k == 0: return i, j + 1
        j += 1
    raise SystemExit('nao fechou: ' + n)

_NOMES_SUB = set()
def sub(nome, texto):
    # [v2.6d, revisor fiacao r7 L5] a guarda de nome repetido mora aqui, e vale para dano, legit e nucleo: com um dano() repetido a suite dizia
    # 34/34 e a mutacao original nunca rodava
    # [v2.6e, revisor fiacao r8 L2] pelo nome sem maiuscula: o <nome>.html vai para uma pasta do Windows, que nao diferencia Q1 de q1
    if nome.lower() in _NOMES_SUB:
        raise SystemExit('MUTACAO REPETIDA: o nome "%s" ja foi usado nesta suite (o Windows nao diferencia maiuscula no nome do arquivo); a segunda sobrescreveria a primeira e so uma rodaria. De outro nome.' % nome)
    _NOMES_SUB.add(nome.lower())
    io.open(os.path.join(SP, nome + '.html'), 'w', encoding='utf-8', newline='').write(texto)
    return nome

ON = ' onchange="this.value=fixaParenteses(this.value);ligaHint(this.value,\'ligaHintCod\')"'
ONN = ' onchange="this.value=fixaParenteses(this.value);ligaHint(this.value,\'ligaHintCodN\')"'

DANO, LEGIT = [], []

def dano(n, t):
    if t == S:
        raise SystemExit(
            'MUTACAO MORTA: "' + n + '" nao alterou nada do index.html. '
            'O texto que ela procura deixou de existir (uma refatoracao mudou o codigo). '
            'Ela reportaria FURO da vacina sendo que o furo e dela — CORRIJA a mutacao, '
            'nunca ignore: mutacao morta e trava desarmada sem ninguem ver.')
    DANO.append(sub(n, t))
def legit(n, t): LEGIT.append(sub(n, t))

i, j = corta(S, 'precoLigaDe')
dano('D', S[:i] + "function precoLigaDe(cod){if(!_precosLiga||!cod)return null;\n const direto=_precosLiga.cartas[(''+cod).trim()];\n if(direto)return direto;\n const ix=idxLigaNorm();if(!ix)return null;\n return ix[normCod(cod)]||null;}" + S[j:])
i, j = corta(S, 'codLimpo')
dano('Q1', S[:i] + "function codLimpo(cod){cod=normCod(cod);const m=cod.match(/\\(([^()]+\\/[^()]+)\\)\\s*$/);if(m)return normCod(m[1]);const t=cod.match(/\\s([0-9A-Za-z]{1,6}\\/[0-9A-Za-z\u221e]{1,6})\\s*$/);return t?normCod(t[1]):cod;}" + S[j:])
dano('F8', S[:i] + "function codLimpo(cod){cod=normCod(cod);const m=cod.match(/\\(([^()]+)\\)\\s*$/);return m?normCod(m[1]):cod;}" + S[j:])
dano('A', S.replace(ON, '').replace(ONN, '').replace('function normCod(', 'function _lixo(){fixaParenteses("a");fixaParenteses("b");fixaParenteses("c");}\nfunction normCod(', 1))
dano('B', S.replace(ON, '').replace(ONN, '').replace('function normCod(', "const _AJUDA='onchange=\"this.value=fixaParenteses(this.value);ligaHint(x)\" '.repeat(3);\nfunction normCod(", 1))
dano('C', S.replace('onclick="abrirPendencias()"', 'onclick="nada()"').replace('function normCod(', 'function _lp(){if(0)abrirPendencias();}\nfunction normCod(', 1))
i, j = corta(S, 'ambiguasPendentes')
dano('E', S[:i] + S[i:j].replace("movs.filter(m=>m.tipo==='COMPRA'&&m.cat==='Single/Carta'&&(+m.qtd||1)>0&&['Em estoque','Pedido','Coleção'].includes(sitDe(m))&&m.codigo&&!m.codigoUrl)", "movs.filter(m=>m.codigo)") + S[j:])
dano('Q2b', S[:i] + S[i:j].replace("['Em estoque','Pedido','Coleção'].includes(sitDe(m))", "sitDe(m)==='Em estoque'") + S[j:])
i, j = corta(S, 'ehCelular')
dano('F', S[:i] + 'function ehCelular(){return /iPhone/i.test(navigator.userAgent);}' + S[j:])
i, j = corta(S, 'voltouDeRedirect')
dano('G', S[:i] + "function voltouDeRedirect(){try{return true;}catch(e){return false;}}" + S[j:])
i, j = corta(S, 'escolherOpcaoAmbigua')
dano('M', S[:i] + '/* apagada: escolherOpcaoAmbigua( escolherOpcaoAmbigua( */' + S[j:])
dano('PERDA', S[:i] + S[j:])
i, j = corta(S, 'pendenciasCodigo')
dano('Q3', S[:i] + 'function pendenciasCodigo(){return [];}' + S[j:])
dano('Q4', S.replace("const salvarCodRes=()=>gravaLocal('tcg_codres',JSON.stringify(codigosResolvidos));", "const salvarCodRes=()=>{};"))
i, j = corta(S, 'setCodigoUrlGlobal')
dano('Q5', S[:i] + 'function setCodigoUrlGlobal(codC){}' + S[j:])
i, j = corta(S, 'abrirPendencias')
dano('F3', S[:i] + '/* removido: function abrirPendencias() e o chamador abrirPendencias() */' + S[j:])
dano('F4', S.replace(ON, '').replace(ONN, '').replace('function normCod(', '/* fixaParenteses( fixaParenteses( fixaParenteses( */\nfunction normCod(', 1))
i, j = corta(S, 'telaCarregando')
dano('F5', S[:i] + 'function telaCarregando(){}' + S[j:])

# ---- mutacoes do 4o reataque (2026-08-20): as 3 que passavam VERDE com dano real ----
def troca(nome, velho, novo_txt):
    if velho in S:
        dano(nome, S.replace(velho, novo_txt, 1))
    else:
        print('  AVISO: alvo de %s nao existe mais no index.html — mutacao NAO gerada' % nome)

troca('M4', 'salvarPontoNuvem(true,true).then(r=>{', 'Promise.resolve({ok:true}).then(r=>{')
troca('M5', 'ids.slice(PONTOS_NUVEM_MAX).forEach', 'ids.slice(1).forEach')
troca('M6', "const SEV={vermelho:['🔴','conta quebrada'],amarelo:['🟡','pendência de conta'],info:['ℹ️','informativo']};",
            "const SEV={vermelho:['🔴','conta quebrada']};")

# ---- rodada EXCLUSAO-LASTRO (21/08): as travas que impedem a exclusao de voltar ----
# X1: o filtro do registro de exclusao some -> volta a uniao pura, o bug que a Laura sofreu
dano('X1', S.replace("return Object.values(byId).filter(m=>!estaExcluido(m&&m.id));",
                     "return Object.values(byId);"))
# X2: o registro para de viajar pela nuvem -> apaga aqui e o outro aparelho nunca fica sabendo
dano('X2', S.replace("codigosResolvidos,excluidos};", "codigosResolvidos};"))
# X3: o filtro do catalogo some -> fornecedor apagado ressuscita pelo outro aparelho
dano('X3', S.replace("if(pref&&estaExcluido(pref+v))return;", ""))
# X4: excluir venda deixa de achar o produto -> item preso em "Vendido" sem dono
i, j = corta(S, 'pecaDaVenda')
dano('X4', S[:i] + 'function pecaDaVenda(v){return null;}' + S[j:])
# X5: a familia deixa de subir ate a raiz -> excluir estoque nao leva mais o pedido junto
dano('X5', S.replace("const raiz=raizDe(m0)||m0;", "const raiz=m0;"))
# X6: devolver para de devolver -> o produto nao volta pro lugar de onde saiu
i, j = corta(S, 'voltarPeca')
dano('X6', S[:i] + "function voltarPeca(peca,v){return 'Em estoque';}" + S[j:])

# ---- correcoes da revisao adversarial (21/08) ----
# X7: aviso de varias linhas volta pra DENTRO do botao -> o template emite quebra de linha
#     de verdade no atributo, o handler nao compila e o clique fica mudo (bug real de 21/08)
dano('X7', S.replace('onclick="limparTudo()"', 'onclick="if(confirm(\'Apagar TODOS?\\n\\nTem certeza?\')){movs=[];save();render()}"'))
# X8: o filtro da exclusao volta a depender do campo vir no snapshot -> aparelho que ainda
#     nao recarregou grava sem o campo e RESSUSCITA tudo (a cura valia so pela metade)
dano('X8', S.replace('if(Array.isArray(movs))movs=movs.filter(m=>!estaExcluido(m&&m.id));',
                     'if(d.excluidos&&Array.isArray(movs))movs=movs.filter(m=>!estaExcluido(m&&m.id));', 1))

# ---- guarda de toque repetido (21/08) ----
# X9/X10: tirar da lista justamente os dois nomes da queixa do dono. Com a comparacao por
#         substring (a 1a versao) os dois passavam VERDE, porque 'salvar' aparece dentro de
#         'salvarNota' e 'excluir' dentro de 'excluirPess'.
dano('X9',  S.replace('const RE_GRAVA=/\\b(salvar|', 'const RE_GRAVA=/\\b(', 1))
dano('X10', S.replace('const RE_GRAVA=/\\b(salvar|salvarNota|salvarVendaVarios|salvarTroca|salvarTransferencia|salvarCadastro|salvarConta|salvarEdicaoNota|salvarPontoNuvem|excluir|', 'const RE_GRAVA=/\\b(salvar|salvarNota|salvarVendaVarios|salvarTroca|salvarTransferencia|salvarCadastro|salvarConta|salvarEdicaoNota|salvarPontoNuvem|', 1))
# X11: a guarda para de engolir o segundo toque -> a venda volta a entrar 2x
dano('X11', S.replace('ev.preventDefault();ev.stopImmediatePropagation();', '', 1))
# X12: o retorno visual some -> a pessoa continua com motivo pra tocar de novo
dano('X12', S.replace("el.classList.add('agindo');", '', 1))

# ---- refatoracoes LEGITIMAS: nao podem barrar ----
i, j = corta(S, 'codLimpo')
corpo = S[i:j]
legit('R1', S[:i] + 'const codLimpo = (cod) => ' + corpo[corpo.index('{'):] + ';' + S[j:])
legit('R2', S.replace('fixaParenteses(this.value);ligaHint(', 'fixaParenteses(this.value); ligaHint('))
legit('R3', S.replace('onchange="this.value=fixaParenteses(this.value);ligaHint(this.value,\'ligaHintCod\')"',
                      'onchange="ligaHint(this.value,\'ligaHintCod\');this.value=fixaParenteses(this.value)"'))
i, j = corta(S, 'voltouDeRedirect')
legit('R4', S[:i] + "function voltouDeRedirect(){try{const t=+sessionStorage.getItem('tcg_redir')||0;return t>0&&Date.now()-t<900000;}catch(e){return false;}}" + S[j:])
legit('R5', S.replace('onclick="abrirPendencias()"', "onclick='abrirPendencias()'"))
legit('OK', S)

# ---- rodada PLANILHA (13/09): caractere de controle gravado literalmente mata o script no navegador ----
# os caracteres sao montados com chr(): escrever o escape no arquivo e justamente o defeito que a mutacao simula
dano('INV', S.replace('function normCod(', '/* ' + chr(0) + ' */' + chr(10) + 'function normCod(', 1))
legit('R6', S.replace('function normCod(', chr(9) + '/*' + chr(9) + 'tab e CRLF sao legitimos */' + chr(13) + chr(10) + 'function normCod(', 1))

def roda(n):
    r = subprocess.run(['node', os.path.join(REPO, 'checks-app.js'), os.path.join(SP, n + '.html')],
                       capture_output=True, cwd=SP)
    saida = (r.stdout + r.stderr).decode('utf-8', 'replace')
    linha = ''
    for l in saida.split('\n'):
        t = l.strip()
        if t and (t[0].islower() or t.startswith('sumiu') or t.startswith('o handler') or t.startswith('checks') or t.startswith('NAO') or t.startswith('funcao') or t.startswith(str(0))):
            linha = t; break
    return r.returncode, linha[:74]

print('MUTACOES COM DANO (todas devem BARRAR, exit=1):')
falhou = 0
for n in DANO:
    c, l = roda(n)
    v = 'ok  ' if c == 1 else 'FUROU'
    if c != 1: falhou += 1
    print('  %-6s exit=%s  %s  %s' % (n, c, v, l))
print()
print('REFATORACOES LEGITIMAS (todas devem PASSAR, exit=0):')
fp = 0
for n in LEGIT:
    c, l = roda(n)
    v = 'ok  ' if c == 0 else 'FALSO POSITIVO'
    if c != 0: fp += 1
    print('  %-6s exit=%s  %s  %s' % (n, c, v, l))
print()
print('RESUMO: %d/%d mutacoes pegas · %d/%d refatoracoes passam' % (len(DANO) - falhou, len(DANO), len(LEGIT) - fp, len(LEGIT)))

# ---- MUTACOES DA PLANILHA (13/09, revisores numero r2/r3 e disco r2/r3) ----
# Cada uma desfaz UMA regra da exportacao, ou das regras que a planilha divide com o app (a caixa aberta em caixaRedistribuida e o
# "comprei" em entraNoComprei), e o testes-nucleo.js TEM de reprovar na secao 31. Na rodada 2, 8 de 17 regras quebradas de proposito
# passavam com a secao verde; na rodada 3, 42 de 60 do revisor disco. Trecho que sumiu ABORTA a suite (mutacao morta).
from concurrent.futures import ThreadPoolExecutor
NUC = []
NL = chr(10)
def nucleo(nome, velho, novo):
    # [v2.6, revisor fiacao r6 L8] nome repetido: o arquivo N-<nome>.html da segunda sobrescrevia o da primeira antes de a fila rodar, e a
    # primeira nunca rodava (215 entradas, 214 nomes, e o placar dizia 215/215)
    if 'N-' + nome in NUC:
        raise SystemExit('MUTACAO REPETIDA (planilha): o nome "%s" ja foi usado; a segunda sobrescreveria a primeira e so uma rodaria. De outro nome.' % nome)
    c = S.count(velho)
    if c != 1:
        raise SystemExit('MUTACAO MORTA (planilha): "%s" procura um trecho que aparece %d vez(es) no index.html, e devia ser 1. '
                         'Se o trecho mudou por refatoracao legitima, reaponte a mutacao. Se a regra foi COPIADA ou mudou de lugar, '
                         'conserte o app antes: a caixa aberta mora so em caixaRedistribuida e o comprei so em entraNoComprei.' % (nome, c))
    NUC.append(sub('N-' + nome, S.replace(velho, novo)))
# caixa aberta: a regra e quem soma compra
nucleo('card-soma-caixa', "const tot=fam.reduce((s,x)=>caixaRedistribuida(x)?s:s+(+x.valor||0),0);", "const tot=fam.reduce((s,x)=>s+(+x.valor||0),0);")
nucleo('verLote-soma-caixa', "const totLote=familia.reduce((s,x)=>caixaRedistribuida(x)?s:s+(+x.valor||0),0);", "const totLote=familia.reduce((s,x)=>s+(+x.valor||0),0);")
nucleo('faixa-soma-caixa', "const totL=fam.reduce((s,x)=>caixaRedistribuida(x)?s:s+(+x.valor||0),0);", "const totL=fam.reduce((s,x)=>s+(+x.valor||0),0);")
nucleo('regra-sempre-falsa', "function caixaRedistribuida(x,filhos){if(!x||sitDe(x)!=='Aberto')return false;", "function caixaRedistribuida(x,filhos){return false;")
nucleo('regra-qualquer-situacao', "function caixaRedistribuida(x,filhos){if(!x||sitDe(x)!=='Aberto')return false;", "function caixaRedistribuida(x,filhos){if(!x)return false;")
nucleo('regra-qualquer-filho-mapa', "(filhos.get(x.id)||[]).some(f=>f.origem==='ABERTURA')", "(filhos.get(x.id)||[]).length>0")
nucleo('regra-qualquer-filho-movs', "movs.some(f=>f.tipo==='COMPRA'&&f.loteOrigem===x.id&&f.origem==='ABERTURA')", "movs.some(f=>f.tipo==='COMPRA'&&f.loteOrigem===x.id)")
nucleo('regra-sem-filtro-compra', "movs.some(f=>f.tipo==='COMPRA'&&f.loteOrigem===x.id&&f.origem==='ABERTURA')", "movs.some(f=>f.loteOrigem===x.id&&f.origem==='ABERTURA')")
nucleo('mapa-de-filhos-vazio', "function mapaFilhosCompra(){const f=new Map();", "function mapaFilhosCompra(){return new Map();const f=new Map();")
nucleo('diagLote-soma-caixa', "caixaRedistribuida(x,filhosD)?s:", "false?s:")
nucleo('provaReal-soma-caixa', "caixaRedistribuida(x,filhos)?s:s+(+x.valor||0),0)*100)/100;", "false?s:s+(+x.valor||0),0)*100)/100;")
nucleo('aceitar-soma-caixa', "caixaRedistribuida(x,filhos2)?s:", "false?s:")
nucleo('compraOriginal-soma-caixa', "const redistribuida=x=>caixaRedistribuida(x,filhos);", "const redistribuida=x=>false;")
nucleo('entra-compra-invertido', "return caixaRedistribuida(x,filhos)?'não — o que saiu de dentro entra no lugar':'não — item aberto sem nada lançado dentro (conferir)';",
       "return caixaRedistribuida(x,filhos)?'não — item aberto sem nada lançado dentro (conferir)':'não — o que saiu de dentro entra no lugar';")
nucleo('card-nota-soma-caixa', "tot=totNota-caixasNota.reduce((s,x)=>s+(+x.valor||0),0);", "tot=totNota;")
nucleo('card-pedacos-compra-de-0', "${qt?`compra de ${qt} ${catR||'un'}`:`o que saiu de ${catR||'item'} aberto`}", "compra de ${qt} ${catR||'un'}")
# comprei do Painel: a regra e quem soma
nucleo('motor-sem-regra', "if(!entraNoComprei(m))continue;", "if(false)continue;")
nucleo('regra-comprei-conta-aberto', "return s!=='Trocado'&&s!=='Aberto';}", "return s!=='Trocado';}")
nucleo('comprei-lista-crua', "const compComprei=compPer.filter(entraNoComprei);", "const compComprei=compPer;")
nucleo('comparativo-cru', "o:agg(compComprei,relDimAll,false)[0]}", "o:agg(compPer,relDimAll,false)[0]}")
nucleo('consulta-soma-cru', "const naSoma=m=>(contaComprei&&m.tipo==='COMPRA'&&!entraNoComprei(m))?0:(+m.valor||0);", "const naSoma=m=>(+m.valor||0);")
nucleo('consulta-so-caixa', "const naSoma=m=>(contaComprei&&m.tipo==='COMPRA'&&!entraNoComprei(m))?0:", "const naSoma=m=>(contaComprei&&m.tipo==='COMPRA'&&caixaRedistribuida(m,filhosCons))?0:")
nucleo('trocas-com-regra-do-painel', "const contaComprei=consF==='COMPRA'||consF==='tudo'", "const contaComprei=true")
nucleo('frase-comprei-some', "const notaComprei=foraComprei.length?", "const notaComprei=false?")
nucleo('cabecalho-mes-cru', "ord.forEach(m=>{const k=gKey(m),v=naSoma(m);", "ord.forEach(m=>{const k=gKey(m),v=+m.valor||0;")
nucleo('aba-vazia-sem-aviso', "let vistaNotas=ord.length?'':'<div class=\"empty\">Nada nesse filtro.</div>';", "let vistaNotas='';")
nucleo('botao-some-aba-vazia', "<div class=\"acoes\">${ord.length?`<button class=\"btn g\" onclick=\"imprimir()\">🖨 Imprimir</button>`:''}<button class=\"btn g\" onclick=\"exportarPlanilha()\">⬇ Planilha completa (Excel)</button></div>",
       "${ord.length?`<div class=\"acoes\"><button class=\"btn g\" onclick=\"imprimir()\">🖨 Imprimir</button><button class=\"btn g\" onclick=\"exportarPlanilha()\">⬇ Planilha completa (Excel)</button></div>`:''}")
# planilha: periodo e nada gravado
nucleo('periodo-nao-volta', "finally{perDe=_pd;perAte=_pa;}", "finally{}")
nucleo('periodo-ate-nao-volta', "finally{perDe=_pd;perAte=_pa;}", "finally{perDe=_pd;}")
nucleo('periodo-nao-limpa', "try{perDe='';perAte='';r=motor(false);}", "try{r=motor(false);}")
nucleo('periodo-so-limpa-de', "try{perDe='';perAte='';r=motor(false);}", "try{perDe='';r=motor(false);}")
nucleo('chama-save', "function montarPlanilhaTCG(){", "function montarPlanilhaTCG(){save();")
# arquivo .xlsx
nucleo('total-sem-valor-guardado', "'</f><v>'+(Math.round(cache*100)/100)+'</v></c>'", "'</f></c>'")
nucleo('xml-sem-filtro-de-controle', "String(s).replace(CTRL,'')", "String(s)")
nucleo('ctrl-sem-vt-ff', "String.fromCharCode(8,11,12,14)", "String.fromCharCode(8,14)")
nucleo('total-nao-segue-filtro', "SUBTOTAL(109,", "SUM(")
nucleo('sem-autofiltro', "<autoFilter ref=", "<autoFiltro ref=")
nucleo('impressao-retrato', 'orientation="landscape"', 'orientation="portrait"')
# nomes, codigos e observacao
nucleo('venda-sem-nome-da-origem', "if(!nomeItemDe(m)&&orig&&nomeItemDe(orig))io.item=_plItemObs(orig).item;", "if(false)io.item=_plItemObs(orig).item;")
nucleo('venda-item-sem-codigo-da-origem', "else if(m.cat==='Single/Carta'&&!_plCodigo(m)&&orig", "else if(false&&m.cat==='Single/Carta'&&!_plCodigo(m)&&orig")
nucleo('venda-sem-codigo-da-origem', "const codigoDaVenda=(m,orig)=>_plCodigo(m)||(orig?_plCodigo(orig):'');", "const codigoDaVenda=(m,orig)=>_plCodigo(m);")
nucleo('todos-item-cru', "io=m.tipo==='VENDA'?itemDaVenda(m,origV):_plItemObs(m)", "io=_plItemObs(m)")
nucleo('todos-codigo-cru', "m.tipo==='VENDA'?codigoDaVenda(m,origV):_plCodigo(m)", "_plCodigo(m)")
nucleo('parenteses-ate-o-primeiro', "function _plFimParenteses(o,i){", "function _plFimParenteses(o,i){return o.indexOf(')',i)+1;")
nucleo('emoji-opcional-sem-u', r"o=o.replace(/\s*·?\s*(?:🔓\s*)?aberto (de|em) [^·]*/gi,''); /*", r"o=o.replace(/\s*·?\s*🔓?\s*aberto (de|em) [^·]*/gi,''); /*")
nucleo('codigo-fica-no-nome', "const o=_plNomeSemCodigo(_plObsLimpa(m.obs));", "const o=_plObsLimpa(m.obs);")
nucleo('codigo-sem-letra', "if(!k||!/[A-Za-zÀ-ú]/.test(k[1]))return null;", "if(!k)return null;")
nucleo('codigo-data-vira-codigo', "if(dm&&+dm[1]<=31&&+dm[2]<=12)return null;", "")
nucleo('obs-pista-some', "return {item,obs:(obs&&(diverge||!soRepete))?obs:'',diverge};}", "return {item,obs:(obs&&!soRepete)?obs:'',diverge};}")
nucleo('item-sem-codigo', "item=_plCodigoCarta(cod)?nome+' ('+cod+')':nome;", "item=nome;")
nucleo('item-codigo-em-qualquer-tipo', "const cod=m.cat==='Single/Carta'?_plCodigo(m):''", "const cod=_plCodigo(m)")
nucleo('codigo-malformado-no-nome', r"function _plCodigoCarta(c){return !!(c&&/\d/.test(c)&&!/[()]/.test(c));}", r"function _plCodigoCarta(c){return !!(c&&/\d/.test(c));}")
nucleo('codigo-sem-infinito', r"\s*\/\s*(?:(?:[A-Za-z]{1,4})?\d{2,3}|∞))\s*\)\s*$/);", r"\s*\/\s*(?:[A-Za-z]{1,4})?\d{2,3})\s*\)\s*$/);")
nucleo('obs-sem-normalizar', r"function _plNorm(t){return String(t||'').replace(/\s+/g,' ').trim().toLowerCase();}", "function _plNorm(t){return String(t||'');}")
nucleo('lacrado-sem-travessao', "return {item:base?base+' — '+limpa:limpa,", "return {item:base?base+' '+limpa:limpa,")
nucleo('carta-sem-nome-sem-aviso', "+(tipo==='Single/Carta'?' (sem nome'+(_plCodigoCarta(codS)?', '+codS:'')+')':'')", "+''")
nucleo('carta-sem-nome-sem-codigo', "(_plCodigoCarta(codS)?', '+codS:'')", "''")
# compras: familia, orfas, conferir, parcela, ponte
nucleo('despesa-futura-entra', "const entra=!(m.status==='apagar'&&m.data>hojeISO2);", "const entra=true;")
nucleo('orfa-fora-da-aba', "const fam=new Map();C.forEach(x=>{const k=ridDe(x);", "const fam=new Map();C.forEach(x=>{const k=ridDe(x);if(String(k).indexOf('ORFA:')===0)return;")
nucleo('orfa-sem-grupo', "return (top.loteOrigem&&!byId.get(top.loteOrigem))?'ORFA:'+top.loteOrigem:top.id;};", "return top.id;};")
nucleo('orfa-sem-amarelo', "if(co.orfa){alertas.push(", "if(co.orfa){avisos.push(")
nucleo('orfa-texto-antigo', "alertas.push('Compra não existe mais no app, mas '+", "alertas.push('pedaço de uma compra que não existe mais no app '+")
nucleo('ponte-sempre-fecha', "fechaCompras=celComprasOk&&somaComprasOk;", "fechaCompras=true;")
nucleo('confere-sem-soma-bruta-compras', "fechaCompras=celComprasOk&&somaComprasOk;", "fechaCompras=celComprasOk;")
nucleo('confere-sem-celula-compras', "fechaCompras=celComprasOk&&somaComprasOk;", "fechaCompras=somaComprasOk;")
nucleo('ponte-texto-invertido', "+nFamRef+' das '+nFamDiv+' compras divididas em pedaços têm esse valor)'", "+nFamDiv+' das '+nFamRef+' compras divididas em pedaços têm esse valor)'")
nucleo('ponte-uma-invertida', "' (a única compra dividida em pedaços tem esse valor)':' (a única compra dividida em pedaços não tem esse valor)'", "' (a única compra dividida em pedaços não tem esse valor)':' (a única compra dividida em pedaços tem esse valor)'")
nucleo('ponte-zero-com-contagem', "não tem esse valor)'):''))+' e compara o custo por unidade entre eles.'", "não tem esse valor)'):' (só 0 das 0 compras divididas em pedaços têm esse valor)'))+' e compara o custo por unidade entre eles.'")
nucleo('check-sem-custo-unidade', "+' e compara o custo por unidade entre eles.'", "+'.'")
nucleo('parcela-dividida-errado', "fmt(_pl2(co.custo/(+rz.nParc)))", "fmt(_pl2(co.custo/(+rz.nParc+1)))")
nucleo('parcela-pela-referencia', "fmt(_pl2(co.custo/(+rz.nParc)))", "fmt(_pl2((co.ref||0)/(+rz.nParc)))")
nucleo('conferir-exige-2-pecas', "const temDif=co.ref!=null&&Math.abs(co.custo-co.ref)>0.02;", "const temDif=co.ref!=null&&co.fam.length>1&&Math.abs(co.custo-co.ref)>0.02;")
nucleo('ref-sem-frete-taxa', "_pl2((+raiz.valorProduto||0)+(+raiz.freteRateio||0)+(+raiz.taxaRateio||0))", "_pl2(+raiz.valorProduto||0)")
nucleo('seta-sempre', r"baseSit+(/\babertos?\b/.test(baseSit)?' → saíram ':' · saíram ')", "baseSit+' → saíram '")
nucleo('pagamento-troca-repete', "const pag=ehTroca?'':(parc?", "const pag=ehTroca?'troca':(parc?")
nucleo('unidade-que-nao-multiplica', "qtd||'',unitOk?unit:'',", "qtd||'',qtd>0?_pl2(valMesma/qtd):'',")
nucleo('troca-coluna-vazia', "_plTrocaTexto(rz.obs),io.obs,rz.id]);", "'',io.obs,rz.id]);")
nucleo('mais-antigo-em-cima', ".sort((a,b)=>desc(a.raiz.data,b.raiz.data)||", ".sort((a,b)=>desc(b.raiz.data,a.raiz.data)||")
# contas a pagar e a receber
nucleo('apagar-sem-despesas', "const apT=_pl2(ap.reduce((s,x)=>s+x.valor,0))", "const apT=_pl2(ap.filter(x=>x.pi).reduce((s,x)=>s+x.valor,0))")
nucleo('frase-apagar-sem-futura', "despFut>0?fmt(despFut)+' de despesas com data futura ainda não.':''", "''")
nucleo('frase-apagar-sem-atrasada', "(despAtras>0?', inclusive '+fmt(despAtras)+' que já passaram da data e continuam como a pagar':'')", "''")
nucleo('apagar-despesa-hoje-fora-do-caixa', "(x.m.data||'')<=hojeUTC", "(x.m.data||'')<hojeUTC")
nucleo('apagar-atrasada-inclui-hoje', "apDesp.filter(x=>x.venc<h0)", "apDesp.filter(x=>x.venc<=h0)")
nucleo('apagar-sem-parcelas-no-caixa', "(parcT>0||despNoCaixa>0)?'Já está descontado no caixa acima: '", "(despNoCaixa>0)?'Já está descontado no caixa acima: '")
nucleo('apagar-sempre-hoje', "hojeUTC===hojeLocal?'hoje ('+fmt(despNoCaixa)+')':", "true?'hoje ('+fmt(despNoCaixa)+')':")
nucleo('apagar-amanha-sem-motivo', "'; depois das '+hVira+'h o app já conta o dia seguinte)'", "')'")
nucleo('apagar-sem-valor-parcelas', "'as parcelas de compra que ainda vão vencer ('+fmt(parcT)+')'", "'todas as parcelas de compra ('+fmt(parcT)+')'")
nucleo('apagar-mes-inclui-vencido', "ap.filter(x=>x.venc>=h0&&x.venc.getMonth()===hm", "ap.filter(x=>x.venc.getMonth()===hm")
nucleo('receber-mes-errado', "menor do que devia.':'');" + NL + "  const arMes=ar.filter(x=>x.data.getMonth()===hm&&", "menor do que devia.':'');" + NL + "  const arMes=ar.filter(x=>x.data.getMonth()===hm+1&&")
nucleo('zero-com-frase', "lin('A receber (app)',arT,arT>0?", "lin('A receber (app)',arT,true?")
# Liga, Vale e as conferencias
nucleo('vale-pelo-custo-no-resumo', "const ev=valorMercadoDe(r.disp),cv=valorMercadoDe(r.colItens);",
       "const ev={val:_pl2(r.estoque),comN:0,semN:r.disp.length,porUltimo:0,porCusto:r.disp.length},cv={val:_pl2(r.colCusto),comN:0,semN:r.colItens.length,porUltimo:0,porCusto:r.colItens.length};")
nucleo('vale-bruto-pelo-custo', "if(st==='No estoque')somaValeEstB+=valeB;if(st==='Na coleção')somaValeColB+=valeB;", "if(st==='No estoque')somaValeEstB+=custo;if(st==='Na coleção')somaValeColB+=custo;")
nucleo('estoque-bruto-arredondado', "somaEstB[st]+=+m.valor||0;", "somaEstB[st]+=custo;")
nucleo('vendas-bruto-arredondado', "somaLiqB+=liqDe(m);", "somaLiqB+=liq;")
nucleo('bruto-identidade-sempre', "ok:_plMesmaSoma(r.investido-r.cmv,r.estoque+r.colCusto+r.pedido),", "ok:true,")
nucleo('despesas-sempre-fecham', "fechaDesp=celDespOk&&somaDespOk;", "fechaDesp=true;")
nucleo('vale-contagem-errada', "v.comN+'/'+tot+' com preço da Liga'", "v.comN+'/'+v.semN+' com preço da Liga'")
nucleo('vale-menos-custo-sem-branco', "peloCusto?'':_pl2(vm.val-custo)", "_pl2(vm.val-custo)")
nucleo('liga-fonte-errada', "vm.comN?'Liga, hoje':", "vm.comN?'Liga':")
nucleo('arred-sem-limite', "function _plArredOk(celula,bruto){return Math.abs((+celula||0)-(+bruto||0))<=0.005+1e-9;}", "function _plArredOk(celula,bruto){return true;}")
nucleo('mesma-soma-folgada', "function _plMesmaSoma(a,b){a=+a||0;b=+b||0;return Math.abs(a-b)<=Math.min(1e-9*Math.max(1,Math.abs(a),Math.abs(b)),0.004);}", "function _plMesmaSoma(a,b){a=+a||0;b=+b||0;return Math.abs(a-b)<=0.05;}")
nucleo('estoque-diferenca-zero', "ok:fechaEst,dif:_pl2(", "ok:fechaEst,dif:0*_pl2(")
# textos e estrutura do Resumo e das abas
nucleo('margem-sobre-venda', "const margem=r.cmv>0?pct(r.lucro/r.cmv)+' sobre o custo':'';" + NL + "  const ev=valorMercadoDe(r.disp)",
       "const margem=r.cmv>0?pct(r.lucro/r.vendasLiq)+' sobre o custo':'';" + NL + "  const ev=valorMercadoDe(r.disp)")
nucleo('investido-sem-despesas', "lin('Investido total',_pl2(r.investido+r.despTotal),", "lin('Investido total',_pl2(r.investido),")
nucleo('taxa-como-inteiro', "_pl2(m.valor),app?(+m.taxa||0)/100:''", "_pl2(m.valor),app?(+m.taxa||0):''")
nucleo('recebe-em-sem-dias', "app?_plIsoMaisDias(m.data,+m.recDias||0):m.data", "m.data")
nucleo('situacao-palavra-crua', "const st=compra?(SIT[sitDe(m)]||sitDe(m)):", "const st=compra?sitDe(m):")
nucleo('sem-aviso-nao-restaura', "a planilha não volta para o app.',s:'negrito'", "',s:'negrito'")
nucleo('sem-linha-vendas-sem-vinculo', "if(faltaN>0)lin('Vendas sem vínculo',null,", "if(false)lin('Vendas sem vínculo',null,")
nucleo('sem-linha-vendas-zero', "if(nVendaZero>0)lin('Vendas de R$ 0,00',null,", "if(false)lin('Vendas de R$ 0,00',null,")
nucleo('amarelas-sem-motivos', "+' na aba Compras: '+motivos.join(' · ')+(nMultiAviso?", "+' na aba Compras.'+(nMultiAviso?")
nucleo('amarelas-sem-multi', "if(alertas.length>1){nMultiAviso++;", "if(false){nMultiAviso++;")
nucleo('despesas-aba-sempre', "if(despL.length)abas.push({nome:'Despesas'", "abas.push({nome:'Despesas'")
nucleo('todos-com-total', "abas.push({nome:'Todos os lançamentos',total:false,", "abas.push({nome:'Todos os lançamentos',")
nucleo('toast-sem-aviso', "if(falhou)alert('A planilha foi baixada, mas saiu com erro: veja a linha com ✗ no começo do Resumo.');else ", "")
# v2.5 (rodada 4): codigo a conferir, custo por unidade, Todos sem Pagamento, telas da nota, Relatorio, Painel e o que a rodada 4 achou verde
nucleo('estoque-sem-codigo-a-conferir', "(io.diverge||codNome)?(peloCusto?'custo, código a conferir':'Liga, código a conferir'):", "false?(peloCusto?'custo, código a conferir':'Liga, código a conferir'):")
nucleo('codigo-nome-some', "if(codNome)nCodNome++;", "if(false)nCodNome++;")
nucleo('codigo-nome-sem-rotulo', "(io.diverge||codNome)?(peloCusto?", "io.diverge?(peloCusto?")
nucleo('codigo-nome-conta-lote', "&&q===1&&", "&&")
nucleo('codigo-a-conferir-sempre-liga', "(peloCusto?'custo, código a conferir':'Liga, código a conferir')", "'Liga, código a conferir'")
nucleo('resumo-sem-codigo-diferente', "if(nCodDiv+nCodNome>0)lin('Código a conferir'", "if(false)lin('Código a conferir'")
nucleo('codigo-diferente-conta-um', "if(io.diverge)nCodDiv++;", "if(io.diverge)nCodDiv=1;")
nucleo('estoque-coluna-estreita', "T('De onde veio o valor','texto',24)", "T('De onde veio o valor','texto',18)")
nucleo('liga-ultimo-visto-some', "(vm.porUltimo?'Liga, último visto':'custo (sem preço na Liga)')", "'custo (sem preço na Liga)'")
nucleo('unidade-diferente-some', "if(!temDif&&!co.orfa&&uMax>0&&uMax-uMin>0.05&&(uMax-uMin)/uMax>0.02){", "if(false){")
nucleo('unidade-diferente-sem-folga', "uMax-uMin>0.05&&(uMax-uMin)/uMax>0.02){", "uMax-uMin>0){")
nucleo('unidade-diferente-em-orfa', "if(!temDif&&!co.orfa&&uMax>0", "if(!temDif&&uMax>0")
nucleo('unidade-sem-motivo', "nUnidDif?(nUnidDif+' com o custo por unidade diferente entre os pedaços'):''", "''")
nucleo('unidade-tolerancia-apertada', "<=0.005*qtd+0.005+1e-9", "<=0.005+1e-9")
nucleo('todos-pagamento-abertura', "compra&&!semPag?(m.pgTipo||''):''", "compra?(m.pgTipo||''):''")
nucleo('todos-pagamento-troca', "const semPag=como==='Saiu de item aberto'||como==='Troca';", "const semPag=como==='Saiu de item aberto';")
nucleo('resumo-conta-lancamentos-cru', "const nCompraConta=C.filter(entraNoComprei).length;", "const nCompraConta=C.length;")
nucleo('saldo-contas-fisico', "lin('Saldo em contas',_pl2(contasBanc.reduce((s,cb)=>s+saldoConta(cb),0))", "lin('Saldo em contas',_pl2(contasBanc.reduce((s,cb)=>s+saldoFisicoConta(cb),0))")
nucleo('numero-nao-finito', "if(typeof v!=='number'||!isFinite(v))return txt();", "if(typeof v!=='number')return txt();")
nucleo('formato-moeda-localizado', 'formatCode="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"', 'formatCode="&quot;R$&quot; #.##0,00;[Red]-&quot;R$&quot; #.##0,00"')
nucleo('espera-catalogo', "if(typeof _precosTentado!=='undefined'&&!_precosTentado){", "if(false){")
nucleo('faixa-sem-caixa', "${algumaCaixaNota?', menos a caixa aberta':''}", "")
nucleo('nota-consulta-ponto', "].filter(Boolean).join(', e ')+((nForaCaixa||nForaTroca)", "].filter(Boolean).join(' · ')+((nForaCaixa||nForaTroca)")
nucleo('faixa-caixa-sempre', "algumaCaixaNota?', menos a caixa aberta", "true?', menos a caixa aberta")
nucleo('nota-parcela-sem-nota-inteira', "${caixasNota.length?' · nota inteira':''}", "")
nucleo('nota-parcela-sem-caixa', "${h.nParc}× ${fmt(totNota/h.nParc)}", "${h.nParc}× ${fmt(tot/h.nParc)}")
nucleo('nota-tira-qualquer-aberto', "caixasNota=todos.filter(x=>caixaRedistribuida(x,filhosCons))", "caixasNota=todos.filter(x=>sitDe(x)==='Aberto')")
nucleo('pedacos-parcela-repete', "(raiz.notaId?`${raiz.nParc}× — na nota`:", "(false?`${raiz.nParc}× — na nota`:")
nucleo('pedacos-aberto-antigo', "outras.length?'saíram '+outrasLista:''", "outras.length?'+'+outrasLista+' (aberto)':''")
nucleo('pedacos-sem-filtro-vazio', "[raiz.colecao||'',outrasLista]).filter(Boolean).join(' · ')", "[raiz.colecao||'',outrasLista]).join(' · ')")
nucleo('pedacos-repete-caixa', "[raiz.colecao||'',outrasLista]", "[(raiz.colecao?raiz.colecao+' · ':'')+(raiz.cat||''),outrasLista]")
nucleo('relatorio-subtitulo-antigo', "caixa aberta conta pelo que saiu dela, e o que saiu em troca pelo que você recebeu, na data em que cada um foi lançado'", "caixa aberta e o que saiu em troca ficam fora'")
nucleo('relatorio-subtitulo-sem-aberto', "(compPer.some(m=>sitDe(m)==='Aberto'&&!caixaRedistribuida(m))?'; item aberto sem nada lançado dentro fica fora':'')", "''")
nucleo('consulta-nota-sem-data', "((nForaCaixa||nForaTroca)?', na data em que cada um foi lançado':'')", "''")
nucleo('consulta-nota-sem-valor-troca', "o que saiu em troca ('+fmt(vForaTroca)+') conta pelo que você recebeu", "o que saiu em troca conta pelo que você recebeu")
nucleo('consulta-nota-caixa-com-valor-na-nota', "(porNotaC?'':' ('+fmt(vForaCaixa)+')')", "(' ('+fmt(vForaCaixa)+')')")
nucleo('relatorio-toque-busca-texto', "if(relDimAll==='pessoa')consPess=k;else if(relDimAll==='jogo')consJogo=k;else if(relDimAll==='cat')consCat=k;else consCol=k;", "consQ=k;")
nucleo('consulta-vazio-sem-rotulo', "(!consCol||(m.colecao||((m.tipo==='COMPRA'||m.tipo==='VENDA')?'(sem coleção)':''))===consCol)", "(!consCol||(m.colecao||'')===consCol)")
nucleo('consulta-pessoa-vazio-sem-rotulo', "(m.contraparte||((m.tipo==='COMPRA'||m.tipo==='VENDA')?'(sem cliente/fornecedor)':''))===consPess", "(m.contraparte||'')===consPess")
nucleo('filtro-sem-opcao-pessoa', "concat(movs.some(m=>cvF(m)&&!m.contraparte)?['(sem cliente/fornecedor)']:[])", "concat([])")
nucleo('rotulo-pessoa-traco', "(m,d)=>d==='pessoa'?(m.contraparte||'(sem cliente/fornecedor)')", "(m,d)=>d==='pessoa'?(m.contraparte||'—')")
nucleo('consulta-grupo-pessoa-traco', "consOrd==='pessoa'?(m.contraparte||'(sem cliente/fornecedor)')", "consOrd==='pessoa'?(m.contraparte||'—')")
nucleo('painel-vence-com-atrasada', "ap.filter(x=>x.venc>=h0P&&x.venc.getMonth()===hm", "ap.filter(x=>x.venc.getMonth()===hm")
nucleo('painel-sem-atrasada', "${apAtras>0?' · '+fmt(apAtras)+' já passou da data':''}", "")
# ---- v2.6, 2a onda (rodada 5 de numero, disco e fiacao): a conferencia le a celula ja montada, teto da tolerancia, Resultado bruto com
# fracao, aviso de arredondamento, toque do Relatorio por aba do cartao, rodape liquido, frase e faixa da Consulta, bordas do custo por
# unidade, codigo sem digito, 1a parcela no pedaco, A pagar depois das 21h e com parcela vencida, comparativo enganado por comentario ----
nucleo('celula-compras-desligada', "if(!_plArredOk(l[4],b.custo))celComprasOk=_falhaCel(", "if(false)celComprasOk=_falhaCel(")
nucleo('celula-liquido-desligada', "if(!_plArredOk(l[7],b.liq))celVendasOk=_falhaCel(", "if(false)celVendasOk=_falhaCel(")
nucleo('celula-lucro-desligada', "if(b.custo!=null&&!_plArredOk(l[9],_cel(l[7])-_cel(l[8])))celLucroOk=_falhaCel(", "if(false)celLucroOk=_falhaCel(")
nucleo('celula-estoque-desligada', "if(!custoOkE)celEstOk=_falhaCel(", "if(false)celEstOk=_falhaCel(")
nucleo('celula-vale-desligada', "if(!_plArredOk(l[6],b.vale))celValeOk=_falhaCel(", "if(false)celValeOk=_falhaCel(")
nucleo('vale-menos-custo-sem-conferencia', "if(!b.peloCusto&&!_plArredOk(l[8],_cel(l[6])-_cel(l[4])))celValeOk=_falhaCel(", "if(false)celValeOk=_falhaCel(")
nucleo('celula-despesa-desligada', "if(!_plArredOk(l[2],b.valor))celDespOk=_falhaCel(", "if(false)celDespOk=_falhaCel(")
# ---- v2.6c, rodada 6 de numero e disco: o ✗ com o motivo, os rotulos e as colunas de conta conferidos, o limite do arredondamento,
# parcelas vencidas por parcela (nota, marca de paga, hoje, singular), rodape com venda sem taxa, faixa com caixa e lote, arredondamento a menos ----
nucleo('celula-custo-venda-desligada', "if(b.custo!=null&&!_plArredOk(l[8],b.custo))celLucroOk=_falhaCel(", "if(false)celLucroOk=_falhaCel(")
nucleo('conferencia-sem-como-entrou', "if((l[3]==='Troca')!==b.troca)celComprasOk=_falhaCel(", "if(false)celComprasOk=_falhaCel(")
nucleo('conferencia-sem-lucro-pct', "if(l[10]!==''&&_cel(l[8])&&Math.abs(", "if(false&&Math.abs(")
nucleo('conferencia-sem-situacao', "if(l[0]!==b.st){", "if(false){")
nucleo('conferencia-sem-custo-unidade', "if(l[5]!==''&&_cel(l[3])&&!_plArredOk(l[5],_cel(l[4])/_cel(l[3])))celEstOk=_falhaCel(", "if(false)celEstOk=_falhaCel(")
nucleo('conferencia-sem-vale-pct', "if(l[9]!==''&&_cel(l[4])&&Math.abs(", "if(false&&Math.abs(")
nucleo('conferencia-sem-regra-despesa', "if((l[4]==='sim')!==b.entra)celDespOk=_falhaCel(", "if(false)celDespOk=_falhaCel(")
nucleo('arredondamento-sem-limite', "if(c.col&&c.ok&&Math.abs(c.dif)>0.005*(c.n+4)+1e-9){", "if(false){")
nucleo('x-sem-motivo-demais', "('NÃO fecha — '+(c.motivo||(", "('NÃO fecha — '+((")
nucleo('x-sem-motivo-compras', "('NÃO fecha — '+(conferencia[0].motivo||(", "('NÃO fecha — '+((")
nucleo('comprei-ok-sem-limite', "lin((conferencia[0].ok?'✓':'✗')+' = comprei (mercadoria)',_pl2(r.investido),conferencia[0].ok?(", "lin((fechaCompras?'✓':'✗')+' = comprei (mercadoria)',_pl2(r.investido),fechaCompras?(")
nucleo('apagar-nota-fora-da-vencida', "if((vencidas?d<hoje:d>=hoje)&&!pg[i+1])L.push({venc:d,valor:v,m:h,", "if((vencidas?false:d>=hoje)&&!pg[i+1])L.push({venc:d,valor:v,m:h,")
nucleo('apagar-paga-como-vencida', "if((vencidas?d<hoje:d>=hoje)&&!pg[i+1])L.push({venc:d,valor:v,m,pi", "if((vencidas?d<hoje:d>=hoje)&&(vencidas||!pg[i+1]))L.push({venc:d,valor:v,m,pi")
nucleo('apagar-hoje-nas-duas', "if((vencidas?d<hoje:d>=hoje)&&!pg[i+1])L.push({venc:d,valor:v,m,pi", "if((vencidas?d<=hoje:d>=hoje)&&!pg[i+1])L.push({venc:d,valor:v,m,pi")
nucleo('apagar-singular-trocado', "(nParcVenc===1?' A parcela já vencida", "(nParcVenc===0?' A parcela já vencida")
# [v2.6g] o rodape soma pela somaLiqVendas, a conta do Painel: a mesma mutacao, reapontada para a chamada
nucleo('rodape-liquido-so-com-taxa', "'líquido '+fmt(somaLiqVendas(ord))+', sem a taxa do app'", "'líquido '+fmt(somaLiqVendas(ord.filter(m=>(+m.taxa||0)>0)))+', sem a taxa do app'")
nucleo('rodape-liquido-sem-taxa-tambem', "const notaLiq=consF==='VENDA'&&ord.some(m=>m.tipo==='VENDA'&&(+m.taxa||0)>0)?", "const notaLiq=consF==='VENDA'&&ord.some(m=>m.tipo==='VENDA')?")
nucleo('faixa-soma-caixa-da-nota', "vEscondido+=todos.filter(x=>!vis.has(x.id)&&!caixasNota.includes(x)).reduce(", "vEscondido+=todos.filter(x=>!vis.has(x.id)).reduce(")
nucleo('faixa-soma-caixa-do-lote', "vEscondido+=fam.filter(x=>!vis.has(x.id)&&!caixaRedistribuida(x)).reduce(", "vEscondido+=fam.filter(x=>!vis.has(x.id)).reduce(")
nucleo('faixa-lote-parcial-fora', "if(noFiltro<fam.length){const vis=new Set(famIdx[rid].map(x=>x.id));vEscondido+=", "if(false){const vis=new Set(famIdx[rid].map(x=>x.id));vEscondido+=")
nucleo('arredondamento-sem-sinal', "fmt(Math.abs(c.dif))+(c.dif>0?' a mais':' a menos')+(i?'':' que o Painel')", "fmt(Math.abs(c.dif))+' a mais'+(i?'':' que o Painel')")
nucleo('limite-sem-lado', "(c.dif>0?' a mais':' a menos')+' que o Painel, e isso", "' a mais'+' que o Painel, e isso")
nucleo('arredondamento-compras-sem-aviso', "e compara o custo por unidade entre eles.'+arredTxt([conferencia[0]])", "e compara o custo por unidade entre eles.'")
nucleo('arredondamento-ramo-x-sem-aviso', "c.ok?'Fecha.'+arredTxt([c]):(", "c.ok?'Fecha.':(")
nucleo('filtro-sem-opcao-colecao', "concat(movs.some(m=>cvF(m)&&!m.colecao)?['(sem coleção)']:[])", "concat([])")
nucleo('filtro-vazio-colecao-conta-despesa', "movs.some(m=>cvF(m)&&!m.colecao)?['(sem coleção)']", "movs.some(m=>!m.colecao)?['(sem coleção)']")
nucleo('filtro-sem-opcao-tipo', "concat(movs.some(m=>cvF(m)&&!m.cat)?['(sem tipo)']:[])", "concat([])")
nucleo('filtro-colecao-sem-marca', "${optC(colsUc,consCol)}", "${optC(colsUc,'')}")
nucleo('consulta-vazio-colecao-pega-despesa', "(m.colecao||((m.tipo==='COMPRA'||m.tipo==='VENDA')?'(sem coleção)':''))===consCol", "(m.colecao||'(sem coleção)')===consCol")
nucleo('conferencia-antes-da-celula-mexida', "if(typeof _plDepoisDeMontar==='function')_plDepoisDeMontar(", "if(false)_plDepoisDeMontar(")
nucleo('celula-custo-total-mais-1c', "comoDe(rz),co.custo,pag,", "comoDe(rz),_pl2(co.custo+0.01),pag,")
nucleo('celula-liquido-mais-1c', "_pl2((+m.valor||0)-liqDe(m)),liq,custo,", "_pl2((+m.valor||0)-liqDe(m)),_pl2(liq+0.01),custo,")
nucleo('celula-lucro-mais-100', "vinc?_pl2(liq-custo):''", "vinc?_pl2(liq-custo+100):''")
nucleo('celula-estoque-custo-mais-1c', "q,custo,q?_pl2(custo/q):'',", "q,_pl2(custo+0.01),q?_pl2(custo/q):'',")
nucleo('celula-vale-mais-100', "q?_pl2(custo/q):'',vm.val,(io.diverge||codNome)?", "q?_pl2(custo/q):'',_pl2(vm.val+100),(io.diverge||codNome)?")
nucleo('celula-vale-menos-custo-mais-100', "peloCusto?'':_pl2(vm.val-custo)", "peloCusto?'':_pl2(vm.val-custo+100)")
nucleo('celula-despesa-mais-1c', "return [m.data,m.cat||'',_pl2(m.valor),", "return [m.data,m.cat||'',_pl2((+m.valor||0)+0.01),")
nucleo('vale-dif-pelo-custo', "dif:_pl2(somaValeEst+somaValeCol-ev.val-cv.val)", "dif:_pl2(somaEst['No estoque']+somaEst['Na coleção']-ev.val-cv.val)")
nucleo('bruto-sem-tolerancia', "ok:_plMesmaSoma(r.investido-r.cmv,r.estoque+r.colCusto+r.pedido),", "ok:(r.investido-r.cmv)===(r.estoque+r.colCusto+r.pedido),")
nucleo('mesma-soma-sem-teto', "Math.min(1e-9*Math.max(1,Math.abs(a),Math.abs(b)),0.004)", "1e-9*Math.max(1,Math.abs(a),Math.abs(b))")
nucleo('arredondamento-sem-aviso', "return l.length?' Diferença só de arredondamento de centavo: '", "return false?' Diferença só de arredondamento de centavo: '")
nucleo('filtro-vazio-tipo', "(m.cat||((m.tipo==='COMPRA'||m.tipo==='VENDA')?'(sem tipo)':''))===consCat", "(m.cat||'')===consCat")
nucleo('toque-nao-leva-filtros-rel', "consJogo=relJogo||'todos';consCol=relCol||'';consPess=relPess||'';consCat=relCat||'';", "consJogo='todos';consCol='';consPess='';consCat='';")
nucleo('toque-sem-voltar', "function abrirConsultaPorDim(k,f,hoje){navHist.push(snap());", "function abrirConsultaPorDim(k,f,hoje){")
nucleo('toque-f-ignorado', "consF=f||'tudo';tela='consultar';editId=null;render();}", "consF='tudo';tela='consultar';editId=null;render();}")
nucleo('toque-mantem-busca', "consQ='';expandId=null;consMenu=false;consJogo=relJogo", "expandId=null;consMenu=false;consJogo=relJogo")
nucleo('toque-mantem-conta', "consCat=relCat||'';consConta='';", "consCat=relCat||'';")
nucleo('toque-pessoa-vira-colecao', "if(relDimAll==='pessoa')consPess=k;else if(relDimAll==='jogo')consJogo=k;else if(relDimAll==='cat')consCat=k;else consCol=k;", "if(relDimAll==='jogo')consJogo=k;else if(relDimAll==='cat')consCat=k;else consCol=k;")
nucleo('toque-tipo-vira-colecao', "if(relDimAll==='pessoa')consPess=k;else if(relDimAll==='jogo')consJogo=k;else if(relDimAll==='cat')consCat=k;else consCol=k;", "if(relDimAll==='pessoa')consPess=k;else if(relDimAll==='jogo')consJogo=k;else consCol=k;")
nucleo('toque-jogo-vira-colecao', "if(relDimAll==='pessoa')consPess=k;else if(relDimAll==='jogo')consJogo=k;else if(relDimAll==='cat')consCat=k;else consCol=k;", "if(relDimAll==='pessoa')consPess=k;else if(relDimAll==='cat')consCat=k;else consCol=k;")
nucleo('toque-hoje-mantem-periodo', "if(hoje)emprestaPeriodo(f==='COLECAO'?'Na coleção':'Estoque parado',f);", "")
nucleo('toque-hoje-zera-periodo-do-app', "if(hoje)emprestaPeriodo(f==='COLECAO'?'Na coleção':'Estoque parado',f);", "if(hoje){perDe='';perAte='';perSel='tudo';}")
nucleo('grafico-toque-busca', "onclick=\"abrirConsultaPorDim('${esc}')\"/>", "onclick=\"consQ='${esc}';consF='tudo';go('consultar')\"/>")
nucleo('tabela-toque-busca', "','${f||'tudo'}'${hoje?',1':''})\"><td style=\"${td}\">${k} <span", "','${f||'tudo'}'${hoje?',1':''});consQ='${k}'\"><td style=\"${td}\">${k} <span")
nucleo('tabela-toque-sem-aba', "','${f||'tudo'}'${hoje?',1':''})\"><td style=\"${td}\">${k} <span", "','tudo')\"><td style=\"${td}\">${k} <span")
nucleo('lista-toque-sem-aba', "','${f||'tudo'}'${hoje?',1':''})\"><div style=\"display:flex;justify-content:space-between;font-size:13px\">", "','tudo')\"><div style=\"display:flex;justify-content:space-between;font-size:13px\">")
nucleo('estoque-toque-abre-todos', "'var(--blue)',false,'ESTOQUE',1)", "'var(--blue)',false)")
nucleo('colecao-toque-abre-todos', "'var(--amber)',false,'COLECAO',1)", "'var(--amber)',false)")
nucleo('vendi-toque-abre-todos', "'var(--green)',true,'VENDA')", "'var(--green)',true)")
nucleo('rodape-vendas-sem-liquido', "${notaComprei||notaLiq}</span>", "${notaComprei}</span>")
nucleo('frase-caixa-sem-valor-fora-da-nota', "'caixa aberta'+(porNotaC?'':' ('+fmt(vForaCaixa)+')')+' conta pelo que saiu dela'", "'caixa aberta'+' conta pelo que saiu dela'")
nucleo('frase-por-nota-em-itens', "porNotaC=consF==='COMPRA'&&consVer==='notas'", "porNotaC=consF==='COMPRA'")
nucleo('frase-data-so-com-troca', "((nForaCaixa||nForaTroca)?', na data em que cada um foi lançado':'')", "(nForaTroca?', na data em que cada um foi lançado':'')")
nucleo('faixa-caixa-sempre-nota-sem-caixa', "if(caixasNota.length)algumaCaixaNota=true;", "algumaCaixaNota=true;")
nucleo('nota-inteira-sempre', "${caixasNota.length?' · nota inteira':''}", "${' · nota inteira'}")
nucleo('pedacos-na-nota-mesmo-avulsa', "(raiz.notaId?`${raiz.nParc}× — na nota`:", "(true?`${raiz.nParc}× — na nota`:")
nucleo('subtitulo-aberto-sempre', "(compPer.some(m=>sitDe(m)==='Aberto'&&!caixaRedistribuida(m))?", "(true?")
nucleo('unidade-limite-50-centavos', "uMax-uMin>0.05&&", "uMax-uMin>0.5&&")
nucleo('unidade-limite-1-real', "uMax-uMin>0.05&&", "uMax-uMin>1&&")
nucleo('unidade-limite-20pct', "(uMax-uMin)/uMax>0.02)", "(uMax-uMin)/uMax>0.2)")
nucleo('unidade-limite-6pct', "(uMax-uMin)/uMax>0.02)", "(uMax-uMin)/uMax>0.06)")
nucleo('unidade-inclui-abertura', "const mesma=co.fam.filter(x=>(x.cat||'')===(rz.cat||'')&&x.origem!=='ABERTURA')", "const mesma=co.fam.filter(x=>(x.cat||'')===(rz.cat||''))")
nucleo('codigo-carta-sem-digito', r"function _plCodigoCarta(c){return !!(c&&/\d/.test(c)&&!/[()]/.test(c));}", "function _plCodigoCarta(c){return !!(c&&!/[()]/.test(c));}")
nucleo('todos-venc1-em-pedaco', "compra&&!semPag&&m.pgTipo==='Parcelado'?(m.venc1||'')", "compra&&m.pgTipo==='Parcelado'?(m.venc1||'')")
nucleo('apagar-atras-pelo-utc', "apDesp.filter(x=>x.venc<h0)", "apDesp.filter(x=>(x.m.data||'')<hojeUTC)")
nucleo('apagar-sem-vencidas', "+(nParcVenc?(nParcVenc===1?", "+(false?(nParcVenc===1?")
nucleo('apagar-vencida-como-a-pagar', "if((vencidas?d<hoje:d>=hoje)&&!pg[i+1])L.push({venc:d,valor:v,m,pi:i+1,pn:+m.nParc,cobrar:true});", "if(d<hoje&&!pg[i+1])L.push({venc:d,valor:v,m,pi:i+1,pn:+m.nParc,cobrar:true});")
nucleo('faixa-sem-escondido', "${vEscondido>0.004?", "${false?")
nucleo('comparativo-comentario-engana', "o:agg(compComprei,relDimAll,false)[0]}", "o:agg( compPer,relDimAll,false)[0]/* o:agg(compComprei,relDimAll,false)[0] */}")
# ---- v2.6, 3a onda (le-como-felype r6): periodo emprestado que volta ao sair da Consulta, parcelas vencidas contadas por compra e com o que
# isso muda no dinheiro, textos da faixa, do arredondamento, das amarelas, do codigo e do grafico ----
nucleo('go-nao-devolve-periodo', "if(t!=='consultar')devolvePeriodo();", "")
nucleo('voltar-perde-emprestimo', "_perEmprestado=('perEmp' in s)?s.perEmp:null;", "_perEmprestado=null;")
nucleo('irconsultar-nao-devolve-periodo', "shift();devolvePeriodo();tela='consultar';consMenu=true;", "shift();tela='consultar';consMenu=true;")
nucleo('setper-mantem-emprestimo', "function setPer(k){_perEmprestado=null;perSel=k;", "function setPer(k){perSel=k;")
nucleo('vermov-zera-periodo-do-app', "  emprestaPeriodo('');expandId=id;", "  perDe='';perAte='';perSel='tudo';expandId=id;")
nucleo('aviso-periodo-emprestado-some', "(_perEmprestado?'Tudo só nesta tela'+", "(false?'Tudo só nesta tela'+")
# ---- v2.6d, rodada 7 de superficie: "Tudo só nesta tela", motivo so na aba que o toque abriu, barra sem o parentese repetido, mensagem
# do vazio na aba Despesas, nome da soma e lado da diferenca no limite ----
nucleo('aviso-motivo-em-outra-aba', "_perEmprestado.motivo&&_perEmprestado.aba===consF&&!consMenu?", "_perEmprestado.motivo&&!consMenu?")
nucleo('barra-repete-parentese', "${_perEmprestado?' · período Tudo':''}", "${_perEmprestado?' · período Tudo ('+_perEmprestado.motivo+' é o de hoje)':''}")
nucleo('despesa-vazio-sem-explicacao', "const nadaTxt=vazioSoCV.length?", "const nadaTxt=false?")
# ---- v2.6d, revisor disco r7 M1: saidas do emprestimo (data De e Ate, vinculo dentro da Consulta emprestada, limpar da barra), valor do limite
# preso e Lucro % e Vale − custo % sem folga ----
nucleo('emprestimo-sobrescreve', "function emprestaPeriodo(motivo,aba){if(!_perEmprestado)_perEmprestado=", "function emprestaPeriodo(motivo,aba){_perEmprestado=")
nucleo('data-de-nao-desfaz', "perDe=this.value;perSel='custom';_perEmprestado=null;render()", "perDe=this.value;perSel='custom';render()")
nucleo('data-ate-nao-desfaz', "perAte=this.value;perSel='custom';_perEmprestado=null;render()", "perAte=this.value;perSel='custom';render()")
nucleo('limpar-nao-devolve', "consCat='';devolvePeriodo();render()", "consCat='';render()")
nucleo('limite-10-vezes', "Math.abs(c.dif)>0.005*(c.n+4)+1e-9", "Math.abs(c.dif)>0.05*(c.n+4)+1e-9")
nucleo('lucro-pct-com-folga', "(_cel(l[7])-_cel(l[8]))/_cel(l[8]))>1e-9", "(_cel(l[7])-_cel(l[8]))/_cel(l[8]))>0.01")
nucleo('vale-pct-com-folga', "(_cel(l[6])-_cel(l[4]))/_cel(l[4]))>1e-9", "(_cel(l[6])-_cel(l[4]))/_cel(l[4]))>0.01")
nucleo('planilha-zera-emprestimo', "r=motor(false);}finally{perDe=_pd;perAte=_pa;}", "r=motor(false);}finally{perDe=_pd;perAte=_pa;_perEmprestado=null;}")
nucleo('apagar-vencidas-por-pedaco', "nCompVenc=new Set(apVenc.map(chaveVenc)).size", "nCompVenc=apVenc.length")
nucleo('apagar-parcelas-por-pedaco', "nParcVenc=new Set(apVenc.map(x=>chaveVenc(x)+'#'+x.venc.getTime())).size", "nParcVenc=apVenc.length")
# ---- v2.6d, revisor numero r7: vencidas pela familia da aba e pela data, limite da aba Compras pelos numeros arredondados, ✗ que avisa
# quando ha mais ----
nucleo('vencidas-parcela-por-numero', "chaveVenc(x)+'#'+x.venc.getTime()", "chaveVenc(x)+'#'+x.pi")
nucleo('vencidas-orfa-por-pedaco', "?'F:ORFA:'+t.loteOrigem:'F:'+t.id;", "?'F:'+t.id:'F:'+t.id;")
nucleo('limite-compras-uma-por-linha', "n:nArredC,", "n:comprasL.length,")
nucleo('motivo-sem-outras-linhas', "([..._linErr[_abaK(k)]].some(j=>j!==_motI[k])?'; outras linhas dessa aba também têm erro':'')", "''")
nucleo('apagar-vencidas-sem-o-que-muda', "'. Se '+(nParcVenc===1?'ela':'alguma')+' não foi paga, este A pagar está menor do que devia.'", "'.'")
nucleo('apagar-vencidas-caixa-sempre', "((apT>0&&(parcT>0||despNoCaixa>0))?'':", "(false?'':")
nucleo('faixa-escondido-texto-antigo', "`. Com o filtro atual, ${fmt(vEscondido)} do valor dos cards são de lançamentos escondidos, que o total embaixo não soma.`", "`, mesmo quando esta aba mostra só parte dela. Com o filtro de agora, ${fmt(vEscondido)} do valor dos cards são lançamentos que não estão na lista nem no total embaixo.`")
nucleo('amarelas-multi-some', "(nMultiAviso?' ('+nMultiAviso+", "(false?' ('+nMultiAviso+")
nucleo('grafico-subtitulo-antigo', "toque na coluna pra ver os lançamentos dela em Todos, no período", "toque na coluna pra abrir")
nucleo('codigo-sem-substantivo', "(o Vale sai pelo código do Item)", "(o Vale sai pelo do Item)")
# ---- v2.6e, rodada 8 (le-como-felype r8; revisores numero, fiacao e disco r8): o ✗ da soma com nome, lado e total; "outras linhas" contando
# linhas; o Vale culpando o Custo errado; o comprei com a aba; a soma que nao bate no fim do motivo; o menu sem o motivo; o vazio que nomeia
# todos; a mensagem da planilha e o ✗ no topo; o perSel do emprestimo; e as mutacoes do revisor disco r8 que passavam com a secao 31 verde ----
nucleo('soma-sem-nome-no-caminho-da-soma', "else if(!c.ok&&!c.motivo){c.subCentavo=", "else if(false){c.subCentavo=")
nucleo('compras-sem-total', "(c.total!=null?fmt(c.total)+', ':'')", "''")
nucleo('bruto-sem-lado', "'o Resultado bruto dá '+fmt(Math.abs(c.dif))+(c.dif>0?' a mais':' a menos')", "'o Resultado bruto dá '+fmt(Math.abs(c.dif))+' a mais'")
nucleo('soma-some-com-erro-de-celula', "else if(!c.ok&&c.soma===false)c.motivo+=", "else if(false)c.motivo+=")
nucleo('outras-linhas-conta-checagem', "[..._linErr[_abaK(k)]].some(j=>j!==_motI[k])", "[..._linErr[_abaK(k)]].length>0")
nucleo('estoque-e-vale-abas-separadas', "_abaK=k=>k==='vl'?'e':k", "_abaK=k=>k")
nucleo('vale-culpa-vale-menos-custo', "const vcTxt=t=>custoOkE?t:", "const vcTxt=t=>true?t:")
nucleo('motivo-compras-sem-aba', "' da aba Compras não é o custo da compra'", "' não é o custo da compra'")
nucleo('menu-mostra-motivo', "_perEmprestado.aba===consF&&!consMenu?", "_perEmprestado.aba===consF?")
nucleo('vazio-nomeia-so-o-primeiro', "vazioSoCV.map(v=>'\"'+v+'\"').join(', ')", "vazioSoCV.slice(0,1).map(v=>'\"'+v+'\"').join(', ')")
nucleo('topo-sem-conferencia-que-nao-fecha', "if(_falhaReal.length)lin(", "if(false)lin(")
nucleo('emprestimo-sem-persel', "perDe='';perAte='';perSel='tudo';}", "perDe='';perAte='';}")
nucleo('botao-so-nesta-tela-sem-emprestimo', "(_perEmprestado?'Tudo só nesta tela'+(_perEmprestado.motivo&&_perEmprestado.aba===consF&&!consMenu?' ('+_perEmprestado.motivo+' é o de hoje)':''):perRotTxt())", "('Tudo só nesta tela'+(_perEmprestado&&_perEmprestado.motivo&&_perEmprestado.aba===consF&&!consMenu?' ('+_perEmprestado.motivo+' é o de hoje)':''))")
nucleo('barra-periodo-sem-emprestimo', "${_perEmprestado?' · período Tudo':''}", "${' · período Tudo'}")
nucleo('segundo-emprestimo-apaga-motivo', "motivo:motivo||'',aba:aba||''};", "motivo:motivo||'',aba:aba||''};else{_perEmprestado.motivo=motivo||'';_perEmprestado.aba=aba||'';}")
nucleo('vazio-so-cliente', "[consCol,consCat,consPess].filter(v=>", "[consPess].filter(v=>")
nucleo('vazio-sem-colecao', "v==='(sem coleção)'||v==='(sem tipo)'", "v==='(sem tipo)'")
nucleo('vazio-sem-tipo', "||v==='(sem tipo)'||", "||")
nucleo('vazio-em-toda-aba', "const vazioSoCV=consF==='DESPESA'?", "const vazioSoCV=true?")
nucleo('limite-compras-dois-por-compra', "nArredC+=1+(co.trocado?1:0)", "nArredC+=2+(co.trocado?1:0)")
nucleo('limite-quase-1-centavo', "Math.abs(c.dif)>0.005*(c.n+4)+1e-9", "Math.abs(c.dif)>0.0095*(c.n+4)+1e-9")
nucleo('vencidas-por-mes', "chaveVenc(x)+'#'+x.venc.getTime()", "chaveVenc(x)+'#'+x.venc.getMonth()")
nucleo('vencidas-orfas-juntas', "?'F:ORFA:'+t.loteOrigem:", "?'F:ORFA':")
nucleo('nome-vale-antigo', "col:'a coluna Vale das linhas No estoque e Na coleção'", "col:'a coluna Vale da aba Estoque e coleção'")
nucleo('nome-estoque-trocado', "col:'a coluna Custo da aba Estoque e coleção'", "col:'a coluna Custo total da aba Estoque e coleção'")
nucleo('limite-sempre-a-menos', "(c.dif>0?' a mais':' a menos')+' que o Painel, e isso", "' a menos'+' que o Painel, e isso")
# ---- v2.6f, rodada 9 (le-como-felype r9; revisores disco, numero e fiacao r9): a causa da soma que nao bate; abaixo de meio centavo fora do
# topo e do aviso; o topo contando conferencias, com a soma do estoque, o que fazer, o ✗ e o negrito; a janela ao baixar; o texto do Vale; o
# voltar que devolve o menu; e os 5 fios do emprestimo que tinham teste e nenhuma mutacao (fiacao r9, L3) ----
nucleo('soma-sem-causa', "+(c.soma===false?_causaSoma:'')", "")
nucleo('sufixo-sem-causa', "c.motivo+='; e a soma da aba também não bate com o Painel'+_causaSoma;", "c.motivo+='; e a soma da aba também não bate com o Painel';")
nucleo('subcentavo-no-topo', "(!c.ok&&!c.subCentavo)?i:-1", "(!c.ok)?i:-1")
nucleo('subcentavo-no-aviso', "filter(c=>!c.ok&&!c.subCentavo).length", "filter(c=>!c.ok).length")
nucleo('subcentavo-texto-antigo', "' bate com o Painel até o centavo; a diferença é menor que um centavo e não muda soma nenhuma, mas avise o Felype'", "' fica a menos de meio centavo do Painel, mas a soma sem arredondar não bate'")
nucleo('bruto-subcentavo-texto-antigo', "'o Resultado bruto bate com essa conta até o centavo; a diferença é menor que um centavo e não muda o resultado, mas avise o Felype'", "'o Resultado bruto fica a menos de meio centavo dessa conta, mas a conta sem arredondar não bate'")
nucleo('topo-conta-abas', "(_falhaReal.length===1?'Conferência que não fecha'", "(_abasErro.length+(_fr(5)?1:0)===1?'Conferência que não fecha'")
nucleo('topo-estoque-sem-soma', "'aba Estoque e coleção ('+(_fr(2)&&_fr(3)?'Custo e Vale':(_fr(2)?'Custo':'Vale'))+')'", "'aba Estoque e coleção'")
nucleo('topo-estoque-so-custo', "(_fr(2)?'Custo':'Vale')", "'Custo'")
nucleo('topo-sem-negrito', "no fim do Resumo.','negrito');", "no fim do Resumo.');")
nucleo('topo-sem-x', "lin('✗ '+(_falhaReal", "lin(''+(_falhaReal")
nucleo('topo-juncao-sem-e', "_abasErro.join(', ').replace(/, ([^,]*)$/,' e $1')", "_abasErro.join(', ')")
nucleo('topo-bruto-sem-frase', "' não bate com a conta dele: não decida por esse número antes de avisar o Felype.'", "''")
nucleo('topo-plural-de-uma-aba', "'nessas abas. Não some por elas nem use os valores delas'", "'nessa aba. Não some por ela nem use os valores dela'")
nucleo('topo-sem-avise', "' e avise o Felype.'", "'.'")
nucleo('vale-texto-antigo', "' não é o Vale que o app dá a esse item'", "' não é o valor do lançamento'")
nucleo('voltar-perde-menu', "consMenu=s.consMenu;", "consMenu=false;")
nucleo('snap-sem-emprestimo', "perEmp:_perEmprestado?Object.assign({},_perEmprestado):null}", "perEmp:null}")
nucleo('devolve-sem-zerar', "perSel=_perEmprestado.perSel;_perEmprestado=null;}", "perSel=_perEmprestado.perSel;}")
nucleo('devolve-sem-persel', "perAte=_perEmprestado.perAte;perSel=_perEmprestado.perSel;", "perAte=_perEmprestado.perAte;")
nucleo('devolve-sem-perate', "perDe=_perEmprestado.perDe;perAte=_perEmprestado.perAte;", "perDe=_perEmprestado.perDe;")
nucleo('empresta-sem-guardar-persel', "_perEmprestado={perDe,perAte,perSel,motivo", "_perEmprestado={perDe,perAte,motivo")
# ---- v2.6g (revisor numero 14/09, M3 e M2): o liquido pela conta do Painel e a contagem que acompanha o total comprado ----
nucleo('liquido-na-ordem-da-lista', "fmt(somaLiqVendas(ord))", "fmt(ord.reduce((s,m)=>s+(m.tipo==='VENDA'?(+m.valor||0)*(1-(+m.taxa||0)/100):0),0))")
nucleo('liquido-soma-sem-a-ordem-guardada', "const naLista=new Set(lista);let s=0;for(const m of movs)", "const naLista=new Set(lista);let s=0;for(const m of lista)")
nucleo('motor-liquido-noutra-ordem', "const vendasLiq=somaLiqVendas(vendas.map(x=>x.m));", "const vendasLiq=vendas.slice().reverse().reduce((s,x)=>s+x.receita,0);")
nucleo('contagem-com-as-compras-de-fora', "const nNoComprei=contaComprei?ord.filter(entraNoComprei).length:0;", "const nNoComprei=contaComprei?ord.filter(m=>m.tipo==='COMPRA').length:0;")
nucleo('rodape-compras-sem-contagem', "consF==='COMPRA'?(foraComprei.length?", "consF==='COMPRA'?(false?")
nucleo('rodape-compras-plural-com-1', "(nNoComprei===1?' entra':' entram')", "' entram'")
nucleo('rodape-compras-zero-sem-nenhum', "(nNoComprei?nNoComprei+", "(true?nNoComprei+")
nucleo('todos-sem-contagem', "${nNoComprei!==ord.length?' em '+nNoComprei", "${false?' em '+nNoComprei")
nucleo('todos-plural-com-1', "(nNoComprei===1?' lançamento':' lançamentos')", "' lançamentos'")
nucleo('cabecalho-compras-sem-contagem', "consF==='COMPRA'&&(gNC[gk]||0)!==gN[gk]?", "false?")
nucleo('cabecalho-conta-as-de-fora', "if(entraNoComprei(m)){const k=gKey(m);gNC[k]=(gNC[k]||0)+1;}", "if(m.tipo==='COMPRA'){const k=gKey(m);gNC[k]=(gNC[k]||0)+1;}")

def roda_nucleo(n):
    r = subprocess.run(['node', os.path.join(REPO, 'testes-nucleo.js'), os.path.join(SP, n + '.html')], capture_output=True, cwd=SP)
    saida = (r.stdout + r.stderr).decode('utf-8', 'replace')
    return n, r.returncode, [l.strip() for l in saida.split('\n') if l.strip().startswith('FALHOU') and '31' in l]
print()
print('MUTACOES DA PLANILHA (os testes do nucleo devem REPROVAR na secao 31, exit=1):')
furou_nuc = 0
with ThreadPoolExecutor(max_workers=4) as ex:
    for n, c, f31 in ex.map(roda_nucleo, NUC):
        pegou = c == 1 and len(f31) > 0
        if not pegou: furou_nuc += 1
        print('  %-32s exit=%s  %s  %s' % (n, c, 'ok  ' if pegou else 'FUROU', f31[0][8:84] if f31 else ''))

# ---- PORTAO DO NUCLEO (13/09, revisores fiacao r2 M1 e r3 M3): trava-nucleo.sh e a regra das 3 portas e nao pode sair muda.
# Tres estados, nunca "provado" para o que nao rodou (sem sh = NAO PROVADO). ----
print()
print('PORTAO DO NUCLEO (trava-nucleo.sh com nucleos falsos: tem de barrar dizendo o motivo e deixar passar o que passa):')
portao, furou_portao = 'NAO PROVADO', 0
SH = shutil.which('sh')
TRAVA = os.path.join(REPO, 'trava-nucleo.sh')
if not SH:
    print('  sem sh nesta maquina: o portao NAO foi provado aqui (ambiente)')
elif not os.path.isfile(TRAVA):
    furou_portao, portao = 1, 'FUROU'
    print('  FUROU: trava-nucleo.sh nao existe')
else:
    fake, minimo = os.path.join(SP, 'nucleo-falso.js'), os.path.join(SP, 'nucleo-falso.minimo')
    for rot, js, mn, deve_passar, textos in (
            ('nucleo que falha', "console.log('  FALHOU  regra de mentira quebrada');console.log('  3 passaram, 1 falharam');process.exit(1);", '3', False, ('ABORTADO', 'FALHOU  regra de mentira quebrada')),
            ('abaixo do minimo', "console.log('  3 passaram, 0 falharam');process.exit(0);", '5', False, ('ABORTADO', 'minimo declarado 5')),
            ('minimo vazio', "console.log('  3 passaram, 0 falharam');process.exit(0);", '', False, ('ABORTADO', 'nao tem um numero')),
            ('minimo com BOM', "console.log('  5 passaram, 0 falharam');process.exit(0);", chr(65279) + '5', True, ('5 passaram',)),
            ('sai 0 sem contagem', "console.log('tudo certo, confia');process.exit(0);", '5', False, ('ABORTADO', 'passou 0 testes')),
            ('nucleo que passa', "console.log('  5 passaram, 0 falharam');process.exit(0);", '5', True, ('5 passaram',)),
            # [v2.5, revisor fiacao r4 L3] com `sh -e`, como o Actions roda: sem o `|| N=` a trava saia MUDA aqui, e o portao dizia provado
            ('sem contagem, sh -e', "console.log('tudo certo, confia');process.exit(0);", '5', False, ('ABORTADO', 'passou 0 testes')),
            # [v2.5, revisor fiacao r4 L2] o proprio arquivo de testes quebra: sem linha FALHOU, a trava tem de mostrar o erro
            ('testes que explodem', "throw new Error('arquivo de testes quebrado de mentira');", '5', False, ('ABORTADO', 'quebrou antes de terminar', 'arquivo de testes quebrado de mentira')),
            # [v2.6d, revisor fiacao r7 L2] quebra no meio, depois de ~200 linhas de testes impressas: a trava tem de achar o arquivo:linha onde
            # estiver (a v2.6 so olhava as 4 primeiras linhas, e a regressao passava verde aqui)
            ('quebra no meio', "for(let i=0;i<220;i++)console.log('  PASSOU  teste de mentira '+i);throw new Error('quebra no meio de mentira');", '5', False, ('ABORTADO', 'quebrou antes de terminar', 'nucleo-falso.js:1'))):
        io.open(fake, 'w', encoding='utf-8').write(js)
        io.open(minimo, 'w', encoding='utf-8').write(mn)
        r = subprocess.run([SH] + (['-e'] if rot.endswith('sh -e') else []) + [TRAVA.replace(chr(92), '/'), 'index.html', fake.replace(chr(92), '/'), minimo.replace(chr(92), '/')], capture_output=True, cwd=REPO)
        saida = (r.stdout + r.stderr).decode('utf-8', 'replace')
        certo = ((r.returncode == 0) == deve_passar) and all(x in saida for x in textos)
        if not certo: furou_portao += 1
        print('  %-18s exit=%s  %s' % (rot, r.returncode, 'ok' if certo else 'FUROU: ' + saida.strip().replace(chr(10), ' | ')[:150]))
    portao = 'provado' if not furou_portao else 'FUROU'

# ---- NEGATIVOS DOS CAMINHOS POR TEXTO (13/09, revisor fiacao r3 M1): quem mata a mutacao de um caminho e o app, nao o
# caminhos.js. Toda publicacao e o CI conferem por texto se cada mutacao ainda casa com o index.html. ----
print()
print('NEGATIVOS DOS CAMINHOS (a mutacao de cada caminho ainda casa com o index.html?):')
furou_neg = 0
CAM = os.path.join(REPO, 'caminhos.js')
if not os.path.isfile(CAM):
    print('  este repo nao tem caminhos.js: nada a conferir')
else:
    r = subprocess.run(['node', '-e', "const c=require(process.argv[1]);console.log(JSON.stringify((c.caminhos||[]).map(x=>({id:x.id,de:x.negativo&&x.negativo.de}))))", CAM], capture_output=True)
    if r.returncode != 0:
        furou_neg += 1
        print('  FUROU: nao consegui ler o caminhos.js — ' + (r.stdout + r.stderr).decode('utf-8', 'replace')[:200])
    else:
        # [v2.5, revisor fiacao r4 M1] ocorrencia dentro de comentario nao conta: a cura reescrita com a grafia antiga guardada num
        # comentario fazia o trecho "casar" e o negativo morto sair verde numa publicacao. Comentario = /* */ ou // depois de espaco ou
        # pontuacao de codigo (assim "image/*" e "https://" nao viram comentario).
        S_SEM_COMENT = re.sub(r'(?<=[\s;{}(),])//[^\n]*', '', re.sub(r'(?<=[\s;{}(),])/\*[\s\S]*?\*/', '', S))
        for cam in json.loads(r.stdout.decode('utf-8')):
            total = S.count(cam['de']) if cam.get('de') else 0
            n = S_SEM_COMENT.count(cam['de']) if cam.get('de') else 0
            if n < 1: furou_neg += 1
            print('  %-44s %s' % (cam['id'], ('ok     (%d no index.html, fora de comentario)' % n) if n >= 1 else ('MORTA  (sem negativo declarado)' if not cam.get('de') else ('MORTA  (o trecho so existe dentro de comentario)' if total else 'MORTA  (o trecho nao existe mais no index.html)'))))
print()
print('RESUMO DA PLANILHA: %d/%d mutacoes pegas pelos testes do nucleo · portao do nucleo %s · negativos dos caminhos %s' % (
    len(NUC) - furou_nuc, len(NUC), portao, 'ok' if not furou_neg else 'FUROU'))
# [v2.5, revisor fiacao r4 L3] tres estados tambem na SAIDA: NAO PROVADO (sem sh nesta maquina) sai 3, como a suite do runner; quem
# chama decide (o publicar.sh segue e marca o commit com SEM-PORTAO). Nunca 0, que e "provado".
# ---- PORTAS DA V2.6C A V2.6F (revisores fiacao r7 L2, r8 L3 e r9 M1): as curas das portas, guardadas por texto e por comportamento. Na v2.6e
# o texto bastava aparecer em qualquer lugar do arquivo: 3 guardas eram satisfeitas por outra linha ou por um comentario, 17 curas nao tinham
# guarda, e 4 regressoes com efeito (git mv da peca, o inventario no gatilho, a fase do push, o trap desligado logo depois de ligado) passavam
# com 300/300 e "PORTAS ok". Agora a regua e a das mutacoes: cada trecho aparece 1 vez, fora de comentario, ancorado na linha que cura (a fase
# junto do comando dela); e o pre-commit roda de verdade num repositorio temporario. ----
import shutil, tempfile
PUB = io.open(os.path.join(REPO, 'publicar.sh'), encoding='utf-8').read() if os.path.isfile(os.path.join(REPO, 'publicar.sh')) else ''
PCM = io.open(os.path.join(REPO, '.githooks', 'pre-commit'), encoding='utf-8').read() if os.path.isfile(os.path.join(REPO, '.githooks', 'pre-commit')) else ''
def _sem_coment_sh(t):
    return NL.join(l for l in t.replace(chr(13), '').split(NL) if not l.lstrip().startswith('#'))
furou_portas = 0
def porta(arq, txt, rot, trecho):
    global furou_portas
    n = _sem_coment_sh(txt).count(trecho)
    if n != 1:
        furou_portas += 1
        print('  PORTAS FUROU: %s, "%s": o trecho aparece %d vez(es) fora de comentario, e devia ser 1 (%s)' % (arq, rot, n, trecho.replace(NL, ' / ')[:150]))
for rot, trecho in (
        ('md5 do runner pelo conteudo', 'MD5_RUN=$(md5sum 2>/dev/null < "$RUNNER_CAMINHOS" | cut -c1-8) || MD5_RUN=""'),
        ('md5 fora de 8 hexadecimais vale desconhecido', 'printf \'%s\' "$MD5_RUN" | grep -qE \'^[0-9a-f]{8}$\' || MD5_RUN="desconhecido"'),
        ('runner= so da linha NEGATIVO-OK', "grep '^NEGATIVO-OK' | grep -oE 'runner=[0-9a-f]{8}([^0-9a-f]|$)'"),
        ('contagem tirada do resumo do runner, no codigo', "N_OK=$(grep -oE '^  [0-9]+ verdes / 0 vermelhos' \"$SAIDA_NEG\""),
        ('inventario na consulta do que mudou nesta publicacao', 'if [ -n "$(git status --porcelain -- caminhos.js caminhos-controles.json)" ]; then'),
        ('inventario no gatilho do negativo', 'N_CAM=$(git rev-list --count "$H_NEG"..HEAD -- caminhos.js caminhos-controles.json'),
        ('saida do negativo na hora, e o tee que falha diz que nada foi publicado', '} | tee "$SAIDA_NEG" \\' + NL + '        || { rm -f "$SAIDA_NEG" "$RC_ARQ"; echo "ABORTADO: nao consegui gravar a saida do controle negativo (disco cheio?). Nada foi publicado."; exit 1; }'),
        ('REPETIDA e PORTAS no filtro da suite', "grep -E 'RESUMO|FUROU|MORTA|REPETIDA|NAO PROVADO|PORTAS' | head -20"),
        ('trap no topo', 'trap interrompe INT TERM'),
        ('o trap so e desligado dentro da interrupcao', 'trap - INT TERM'),
        ('a interrupcao apaga os temporarios', 'interrompe() {' + NL + '  trap - INT TERM; limpa_pub'),
        ('os temporarios que a interrupcao apaga', 'limpa_pub() { for f in "${NOAR:-}" "${SAIDA_NEG:-}" "${RC_ARQ:-}"; do [ -n "$f" ] && rm -f "$f"; done; return 0; }'),
        ('saida 130 da interrupcao', '  esac' + NL + '  exit 130' + NL + '}' + NL + 'trap interrompe INT TERM'),
        ('mensagem do push', '"no push") echo "[publicar] interrompido no push: pode ter subido ou nao. Confira no GitHub antes de publicar de novo." ;;'),
        ('mensagem da conferencia do ar', '"na conferencia do ar") echo "[publicar] interrompido na conferencia do ar: a publicacao ja tinha sido feita." ;;'),
        ('mensagem do commit que ficou so neste computador, com o HEAD lido pelo proprio shell (v2.6f)', '"no commit") cabeca_agora; if [ -n "$CAB" ] && [ "$CAB" != "$H_ANTES" ]; then'),
        ('o HEAD lido sem processo novo (v2.6f)', '{ read -r LH < .git/HEAD; } 2>/dev/null || LH=""'),
        ('mensagem das outras fases', '*) echo "[publicar] interrompido $FASE. Nada foi publicado." ;;'),
        ('fase do build', 'FASE="no build"' + NL + 'if [ -f _build_deploy.py ] && [ -f "$SRC_DEV" ]; then'),
        ('fase do carimbo', 'FASE="no carimbo"' + NL + 'python - "$TAG" <<\'PY\''),
        ('fase da conferencia contra o app no ar', 'FASE="na conferencia contra o app no ar"' + NL + 'PULOU_CONTRA=""'),
        ('fase dos caminhos', 'FASE="nos caminhos do usuario"' + NL + 'if [ -f caminhos.js ] && [ -f "$RUNNER_CAMINHOS" ]; then'),
        ('fase do controle negativo', '      FASE="no controle negativo"' + NL + '      SAIDA_NEG=$(mktemp'),
        ('fase da trava', 'FASE="na trava do nucleo"' + NL + '[ -f trava-nucleo.sh ]'),
        ('fase da suite, com o aviso', '  FASE="na suite da vacina"' + NL + '  echo "[publicar] suite da vacina rodando: 2 a 4 min sem mostrar nada (interromper aqui nao publica nada)"'),
        ('HEAD guardado antes da fase do commit (v2.6f)', 'cabeca_agora; H_ANTES=$CAB' + NL + 'FASE="no commit"' + NL + 'git add -A .'),
        ('fase do push, e o push recusado avisa (v2.6f)', 'FASE="no push"' + NL + 'git push -q origin master || { echo "ABORTADO: o push nao foi aceito'),
        ('fase da conferencia do ar, depois do publicado', 'echo "publicado: $(git rev-parse --short HEAD) as $(date \'+%H:%M:%S\')"' + NL + 'FASE="na conferencia do ar"')):
    porta('publicar.sh', PUB, rot, trecho)
# [v2.6f, cenas K1f0 do autor] processo novo dentro da interrupcao trava ou falha com a tecla de verdade: o corpo da interrupcao nao chama o git
_pub_sc = _sem_coment_sh(PUB); _ini = _pub_sc.find('interrompe() {'); _fim = _pub_sc.find(NL + '}', _ini)
if _ini < 0 or _fim < 0 or 'git ' in _pub_sc[_ini:_fim] or '$(' in _pub_sc[_ini:_fim]:
    furou_portas += 1
    print('  PORTAS FUROU: publicar.sh chama processo novo dentro da interrupcao (git ou $(...)), que trava ou falha com a tecla de verdade')
for rot, trecho in (
        ('peca fora do indice barra', 'if ! git cat-file -e :checks-app.js 2>/dev/null; then'),
        ('ausente so e ambiente quando o HEAD tambem nao tem a peca', 'if git cat-file -e HEAD:checks-app.js 2>/dev/null; then'),
        ('renomeacao nao esconde a peca que sai', "MUDOU=$(git diff --cached --no-renames --name-only | grep -xE 'index.html|checks-app.js|checks-suite.py|testes-nucleo.js|testes-nucleo.minimo|trava-nucleo.sh' || true)"),
        ('renomeacao nao esconde o dado de preco', "DADO=$(git diff --cached --no-renames --name-only | grep -xE 'precos.json|robo/codigos.txt' || true)"),
        ('interrupcao do hook limpa e avisa', "trap 'limpa; echo \"[pre-commit] interrompido: nada foi commitado\"; exit 130' INT TERM"),
        ('a limpeza leva a pasta das pecas', 'limpa() { for f in "$TMP" "$BASE" "$PECAS" "$TP" "$TC"; do [ -n "$f" ] && rm -rf "$f"; done; return 0; }'),
        ('peca fora do commit barra', 'COMMIT BARRADO: ${par%%:*} nao esta neste commit'),
        ('temporarios com prefixo fixo (v2.6f)', 'tmpf() { mktemp "$TMPD/tcg-precommit.XXXXXX"'),
        ('pasta das pecas com prefixo fixo (v2.6f)', 'tmpd() { mktemp -d "$TMPD/tcg-precommit.XXXXXX"'),
        ('faxina dos temporarios de hook interrompido (v2.6f)', "find \"$TMPD\" -maxdepth 1 -name 'tcg-precommit.*' -mmin +10 -exec rm -rf {} + 2>/dev/null || true"),
        ('as pecas do indice na pasta com prefixo (v2.6f)', 'PECAS=$(tmpd)')):
    porta('.githooks/pre-commit', PCM, rot, trecho)
# comportamento: o pre-commit de verdade num repositorio temporario (so o git; nesses tres casos o hook barra antes de chamar o node)
if not shutil.which('git'):
    furou_portas += 1
    print('  PORTAS FUROU: sem git nesta maquina, o comportamento do pre-commit nao foi provado')
elif PCM:
    _envg = dict(os.environ, GIT_AUTHOR_NAME='suite', GIT_AUTHOR_EMAIL='suite@local', GIT_COMMITTER_NAME='suite', GIT_COMMITTER_EMAIL='suite@local')
    for _nome, _acao in (('git mv checks-app.js', ['mv', 'checks-app.js', 'vacina-renomeada.js']), ('git rm --cached checks-app.js', ['rm', '-q', '--cached', 'checks-app.js']),
                         ('git mv testes-nucleo.js', ['mv', 'testes-nucleo.js', 'testes-renomeados.js'])):
        _d = tempfile.mkdtemp(prefix='portas-')
        try:
            def _g(*a):
                return subprocess.run(['git', '-c', 'core.autocrlf=false'] + list(a), cwd=_d, capture_output=True, env=_envg)
            for _f in ('index.html', 'checks-app.js', 'testes-nucleo.js', 'testes-nucleo.minimo', 'trava-nucleo.sh', 'checks-suite.py'):
                if os.path.isfile(os.path.join(REPO, _f)): shutil.copy(os.path.join(REPO, _f), os.path.join(_d, _f))
            os.makedirs(os.path.join(_d, '.githooks')); shutil.copy(os.path.join(REPO, '.githooks', 'pre-commit'), os.path.join(_d, '.githooks', 'pre-commit'))
            os.chmod(os.path.join(_d, '.githooks', 'pre-commit'), 0o755)
            _g('init', '-q'); _g('add', '-A', '.'); _g('commit', '-q', '--no-verify', '-m', 'base'); _g('config', 'core.hooksPath', '.githooks')
            _h0 = _g('rev-parse', 'HEAD').stdout
            _g(*_acao)
            with io.open(os.path.join(_d, 'index.html'), 'a', encoding='utf-8', newline='') as _fh: _fh.write(NL)
            _g('add', 'index.html')
            _r = _g('commit', '-q', '-m', 'porta')
            _h1 = _g('rev-parse', 'HEAD').stdout
            _s = (_r.stdout + _r.stderr).decode('utf-8', 'replace')
            _ok = _r.returncode != 0 and 'COMMIT BARRADO' in _s and _h0 == _h1 and bool(_h0.strip())
            if not _ok: furou_portas += 1
            print('  comportamento do pre-commit, %-30s %s' % (_nome, 'barra ok' if _ok else 'FUROU (saida %d, HEAD %s): %s' % (_r.returncode, 'igual' if _h0 == _h1 else 'mudou', _s.strip()[-160:])))
        finally:
            shutil.rmtree(_d, ignore_errors=True)
print('PORTAS DA V2.6C A V2.6F: %s' % ('ok' if not furou_portas else 'FUROU (%d)' % furou_portas))
sys.exit(1 if (falhou or fp or furou_nuc or furou_portao or furou_neg or furou_portas) else (3 if portao == 'NAO PROVADO' else 0))
