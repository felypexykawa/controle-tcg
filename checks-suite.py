"""SUITE DA VACINA — prova que o checks-app.js pega o que promete E nao barra o que e legitimo.

Rodar:  python checks-suite.py     (da raiz do repo; nao toca em nada de producao)

Cada MUTACAO veio de um ataque real de revisao adversarial em 2026-08-20 — tres rodadas, cada
uma furando a versao anterior da vacina. Manter esta suite verde e o que impede a vacina de
regredir para "verde sem ter exercido nada", que foi como a regressao de 19/08 passou.

As REFATORACOES do fim sao o outro lado: trava que barra troca de aspas ou arrow function
ensina a usar --no-verify, e ai ela nao protege mais nada. Falso positivo aqui e defeito igual.
"""
import io, os, shutil, subprocess, sys, tempfile
# a saida tem seta e acento; sem isto o Windows tenta cp1252, estoura UnicodeEncodeError e a
# suite "falha" sem ter falhado (foi o que abortou a primeira publicacao que a chamou)
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

SP = os.path.join(tempfile.gettempdir(), 'checks-suite-tcg')
REPO = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir(SP):
    shutil.rmtree(SP)
os.makedirs(os.path.join(SP, 'robo'))
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

def sub(nome, texto):
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
sys.exit(1 if (falhou or fp) else 0)
