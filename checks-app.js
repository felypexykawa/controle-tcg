/* CHECKS DO APP — barra publicacao de index.html que perdeu capacidade em silencio.
 *
 * POR QUE EXISTE (2026-08-20). Em 18/08 o app ganhou tres pecas por direcao do Felype:
 * o codLimpo passou a ler codigo solto ("Frosmoth 192/184"), o campo de codigo passou a
 * fechar o parentese sozinho, e o Painel ganhou a lista unificada de pendencias (unico
 * lugar onde as cartas ambiguas da Liga aparecem juntas). Em 19/08 as tres sumiram de uma
 * vez: o commit bab2341 foi escrito por cima de uma copia anterior do arquivo. Ninguem
 * percebeu por um dia inteiro — 17 cartas com preco coletado nao apareciam na tela e o
 * dono nao tinha lista nenhuma pra resolver as 24 ambiguas.
 *
 * A trava que ja existia NAO pegaria isso: ela confere se o JavaScript PARSEIA, e o app
 * sem esses blocos parseia perfeitamente. Sumico de capacidade e mudo pra sintaxe.
 *
 * DESENHO (skill 25-travas-e-vigias):
 *  - Degrau: trava de PUBLICACAO (aborta antes do commit/push), nao apito na tela do Felype.
 *    Custo de atencao dele enquanto verde: ZERO. Nada aqui chega em forma de mensagem.
 *  - Deteccao: ESTADO DETERMINADO. Toda capacidade e EXERCITADA — as funcoes sao recortadas
 *    do arquivo, executadas com dublês (dados de mentira no lugar do banco e da tela) e o
 *    RESULTADO e conferido. Presenca de nome nunca basta, e comentario nao conta: as buscas
 *    de nome rodam sobre uma copia do arquivo COM OS COMENTARIOS REMOVIDOS.
 *    [Isto foi corrigido em 2026-08-20 depois que a revisao adversarial furou a 1a versao:
 *     3 das 5 capacidades so eram conferidas por texto, e um comentario mencionando o nome
 *     da funcao apagada fazia o check passar verde. Verde que nao exerceu nada e o defeito
 *     que esta pagina existe pra impedir.]
 *  - Fail-CLOSED de proposito, ao contrario de um hook de trabalho: se este script NAO
 *    conseguir exercitar as funcoes, ele FALHA em vez de passar.
 *    (O pre-commit continua fail-open quanto ao AMBIENTE: sem node, ele nao barra nada.)
 *  - Consumidores (lei 1 — saida sem leitor e teatro): .githooks/pre-commit, publicar.sh e
 *    .github/workflows/app-sintaxe.yml. Os tres chamam ESTE arquivo; ele e a fonte canonica
 *    das regras. Se algum divergir, vale este.
 *  - Frequencia/limiar: classe rara (2 ocorrencias) porem IRREVERSIVEL na pratica — o app
 *    fica no ar quebrado e o dono so descobre por acaso. E a excecao por irreversibilidade
 *    prevista na skill 25, e ela exige justamente detector de estado, que e o caso aqui.
 *
 * COMO ESTENDER: acrescente uma entrada em CAPACIDADES. Cada uma diz, em portugues, o que
 * o app perde se ela sumir — a mensagem de erro e escrita pra quem for ler as pressas.
 *
 * Uso:  node checks-app.js [caminho/do/index.html]
 */
'use strict';
const fs = require('fs');
const alvo = process.argv[2] || 'index.html';

/* ---------- leitura do arquivo ---------- */
function semComentarios(src) {
  let fora = '', i = 0, anterior = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { const f = fimLiteral(src, i, c); fora += src.slice(i, f + 1); i = f + 1; anterior = 'x'; continue; }
    if (c === '/' && src[i + 1] === '/') { const f = src.indexOf('\n', i); i = f < 0 ? src.length : f; continue; }
    if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); i = f < 0 ? src.length : f + 2; continue; }
    if (c === '/' && podeIniciarRegex(anterior)) { const f = fimRegex(src, i); fora += src.slice(i, f + 1); i = f + 1; anterior = 'x'; continue; }
    fora += c; if (!/\s/.test(c)) anterior = c; i++;
  }
  return fora;
}
function extrairFuncao(src, nome) {
  const ini = src.indexOf('function ' + nome + '(');
  if (ini < 0) return null;
  let i = src.indexOf('{', ini), nivel = 0, anterior = '';
  if (i < 0) return null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = fimLiteral(src, i, c); anterior = 'x'; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return null; continue; }
    if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); if (f < 0) return null; i = f + 1; continue; }
    if (c === '/' && podeIniciarRegex(anterior)) { i = fimRegex(src, i); anterior = 'x'; continue; }
    if (c === '{') nivel++;
    else if (c === '}') { nivel--; if (nivel === 0) return src.slice(ini, i + 1); }
    if (!/\s/.test(c)) anterior = c;
  }
  return null;
}
function fimLiteral(src, i, aspa) {
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === aspa) return j;
    if (aspa === '`' && src[j] === '$' && src[j + 1] === '{') { let n = 1; j += 2;
      for (; j < src.length && n > 0; j++) { if (src[j] === '{') n++; else if (src[j] === '}') n--; } j--; }
  }
  return src.length;
}
function fimRegex(src, i) {
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === '[') { while (j < src.length && src[j] !== ']') { if (src[j] === '\\') j++; j++; } continue; }
    if (src[j] === '/') return j;
    if (src[j] === '\n') return i;
  }
  return i;
}
function podeIniciarRegex(anterior) { return !/[A-Za-z0-9_$)\]]/.test(anterior || '('); }

/* ---------- dublê de tela: guarda o HTML que o app tentaria desenhar ---------- */
function telaFalsa() {
  const escrito = [];
  const el = () => ({ innerHTML: '', style: {}, remove() {}, textContent: '',
                      set innerHTMLSetter(v) {} });
  const view = { get innerHTML() { return this._h || ''; }, set innerHTML(v) { this._h = v; escrito.push(v); }, style: {} };
  return {
    escrito,
    doc: {
      getElementById: id => (id === 'view' ? view : null),
      querySelectorAll: () => [],
      querySelector: () => null,
      body: { insertAdjacentHTML: (_, h) => escrito.push(h) }
    }
  };
}

/* ---------- o que o app NAO pode perder ---------- */
const CAPACIDADES = [
  {
    nome: 'codigo solto no cadastro',
    perde: 'cadastro escrito "Frosmoth 192/184" (sem parenteses) para de casar com o preco coletado — a carta fica sem preco na tela, e o grafico de historico dela some junto',
    precisa: ['normCod', 'codLimpo'],
    exercicio: F => [
      ['codLimpo("Frosmoth 192/184")', F.codLimpo('Frosmoth 192/184'), '192/184'],
      ['codLimpo("Spiritomb da cintia 244/217")', F.codLimpo('Spiritomb da cintia 244/217'), '244/217'],
      ['codLimpo("Cynthia\'s spiritomb (244/217)")', F.codLimpo("Cynthia's spiritomb (244/217)"), '244/217'],
      ['codLimpo("211/172")', F.codLimpo('211/172'), '211/172'],
      ['codLimpo("Mega gardevoir ex (032/♾️)")', F.codLimpo('Mega gardevoir ex (032/♾️)'), '032/∞'],
      ['codLimpo("110JP/108")', F.codLimpo('110JP/108'), '110JP/108']
    ]
  },
  {
    nome: 'campo de codigo fecha o parentese',
    perde: 'o formato torto volta a nascer no cadastro em vez de ser corrigido na entrada — foi o que gerou 18 fichas de preco duplicadas',
    precisa: ['normCod', 'fixaParenteses'],
    chamadas: [['fixaParenteses', 3, 'os 3 formularios com campo de codigo (compra, venda avulsa, nota)']],
    exercicio: F => [
      ['fixaParenteses("Frosmoth 192/184")', F.fixaParenteses('Frosmoth 192/184'), 'Frosmoth (192/184)'],
      ['fixaParenteses("Spiritomb da cintia 244/217")', F.fixaParenteses('Spiritomb da cintia 244/217'), 'Spiritomb da cintia (244/217)'],
      ['fixaParenteses("244/217")', F.fixaParenteses('244/217'), '244/217'],
      ['fixaParenteses("Charizard (211/172)")', F.fixaParenteses('Charizard (211/172)'), 'Charizard (211/172)'],
      ['fixaParenteses("")', F.fixaParenteses(''), '']
    ]
  },
  {
    nome: 'lista unificada de pendencias no Painel',
    perde: 'as cartas ambiguas da Liga voltam a nao ter lista nenhuma — so apareciam dentro de cada carta, uma por uma; com 24 ambiguas, achar cada uma vira adivinhacao',
    precisa: ['ambiguasPendentes', 'pendenciasResumo', 'abrirPendencias'],
    recorta: ['normCod', 'codLimpo', 'ambiguasPendentes', 'pendenciasResumo', 'abrirPendencias'],
    chamadas: [['abrirPendencias', 1, 'o link do Painel que abre a lista']],
    contexto: () => {
      const tela = telaFalsa();
      const FICHAS = {
        'Frosmoth 192/184': { status: 'AMBIGUO', opcoes: [{ titulo: 'A', url: 'u1' }, { titulo: 'B', url: 'u2' }] },
        '192/184': { status: 'AMBIGUO', opcoes: [{ titulo: 'A', url: 'u1' }, { titulo: 'B', url: 'u2' }] },
        '188/172': { status: 'AMBIGUO', opcoes: [] },
        '211/172': { status: 'OK', versoes: [{ v: 'Normal', mn: 1, md: 1, mx: 1 }] }
      };
      return {
        _tela: tela,
        movs: [
          { id: 'a', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: 'Frosmoth 192/184', obs: 'Frosmoth' },
          { id: 'b', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: '188/172', obs: 'Sem opcoes' },
          { id: 'c', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: '211/172', obs: 'Com preco' }
        ],
        _precosLiga: { cartas: FICHAS },
        codigosResolvidos: {},
        sitDe: () => 'Em estoque',
        precoLigaDe: c => FICHAS[('' + c).trim()] || null,
        pendenciasCodigo: () => [{ motivo: 'sem_preco', cod: '999/999', m: { id: 'z', obs: 'carta sem preco' } }],
        provaReal: () => ({ A: [], n: { vermelho: 0, amarelo: 0 } }),
        _provaCache: { A: [{ sev: 'vermelho', titulo: 'conta quebrada', detalhe: 'x' }], n: { vermelho: 1, amarelo: 0 } },
        document: tela.doc,
        window: {}
      };
    },
    exercicio: (F, ctx) => {
      const amb = F.ambiguasPendentes();
      const resumo = F.pendenciasResumo();
      ctx.codigosResolvidos['192/184'] = 'https://exemplo';
      const depoisDeResolver = F.ambiguasPendentes().length;
      ctx.codigosResolvidos['192/184'] = undefined; delete ctx.codigosResolvidos['192/184'];
      F.abrirPendencias();
      const html = ctx._tela.escrito.join('');
      return [
        ['ambiguasPendentes() acha as 2 ambiguas', amb.length, 2],
        ['e agrupa pelo codigo LIMPO (nao pelo texto do cadastro)', amb[0] && amb[0].codC, '192/184'],
        ['contando as opcoes que o robo capturou', amb[0] && amb[0].nOpc, 2],
        ['poe quem resolve em 1 toque na frente', amb[1] && amb[1].codC, '188/172'],
        ['carta ja resolvida sai da lista', depoisDeResolver, 1],
        ['pendenciasResumo() soma ambiguas + cadastro + contas', resumo.total, 2 + 1 + 1],
        ['e conta quantas resolvem em 1 toque', resumo.n1toque, 1],
        ['abrirPendencias() desenha a secao de escolher carta', /escolher qual carta é a sua/.test(html), true],
        ['com o codigo da carta na tela', html.indexOf('192/184') >= 0, true],
        ['a secao de quem nao tem opcoes', /sem opções na tela/.test(html), true],
        ['e o achado de conta vindo da prova real', html.indexOf('conta quebrada') >= 0, true]
      ];
    }
  },
  {
    nome: 'escolha da carta ambigua (picker)',
    perde: 'nao ha como escolher qual carta e a sua quando o codigo bate em varias — o preco fica travado pra sempre',
    precisa: ['abrirEscolhaAmbigua'],
    recorta: ['normCod', 'codLimpo', 'abrirEscolhaAmbigua'],
    chamadas: [['abrirEscolhaAmbigua', 1, 'a lista de pendencias e/ou a carta aberta']],
    contexto: () => {
      const tela = telaFalsa(); const caiuNoManual = [];
      const FICHAS = {
        '192/184': { status: 'AMBIGUO', opcoes: [{ titulo: 'Frosmoth A', url: 'u1', img: 'i1' }, { titulo: 'Frosmoth B', url: 'u2', img: 'i2' }] },
        '188/172': { status: 'AMBIGUO', opcoes: [] }
      };
      return { _tela: tela, _manual: caiuNoManual, document: tela.doc,
               precoLigaDe: c => FICHAS[('' + c).trim()] || null,
               setCodigoUrlGlobal: c => caiuNoManual.push(c) };
    },
    exercicio: (F, ctx) => {
      F.abrirEscolhaAmbigua('Frosmoth 192/184');
      const html = ctx._tela.escrito.join('');
      F.abrirEscolhaAmbigua('188/172');
      return [
        ['abre o picker achando a ficha pelo codigo limpo', /Frosmoth A/.test(html) && /Frosmoth B/.test(html), true],
        ['cada opcao leva a escolha pro app', (html.match(/escolherOpcaoAmbigua\(/g) || []).length, 2],
        ['sem opcoes capturadas, cai no colar-link manual', ctx._manual.length, 1]
      ];
    }
  },
  {
    nome: 'login que nao entra em laco',
    perde: 'as correcoes de login de 19-20/08: redirecionamento no celular, a tela "Entrou/carregando" e a tela de falha com saidas. Sem elas o app volta a prender o dono na tela de login',
    precisa: ['ehCelular', 'voltouDeRedirect', 'telaCarregando', 'telaFalhaApp'],
    chamadas: [['telaCarregando', 1, 'o momento em que o login e aprovado']],
    contexto: () => {
      const tela = telaFalsa();
      const nav = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 };
      const ss = { _v: {}, getItem(k) { return this._v[k]; }, setItem(k, v) { this._v[k] = v; }, removeItem(k) { delete this._v[k]; } };
      return { _tela: tela, _nav: nav, _ss: ss, document: tela.doc,
               navigator: nav, sessionStorage: ss, setTimeout: () => 0, _syncReady: false };
    },
    exercicio: (F, ctx) => {
      const celular = F.ehCelular();
      ctx._nav.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; ctx._nav.maxTouchPoints = 0;
      const desktop = F.ehCelular();
      const semMarca = F.voltouDeRedirect();
      ctx._ss.setItem('tcg_redir', String(Date.now()));
      const comMarca = F.voltouDeRedirect();
      ctx._ss.setItem('tcg_redir', String(Date.now() - 3600000));
      const marcaVelha = F.voltouDeRedirect();
      F.telaCarregando();
      const carregando = ctx._tela.escrito.join('');
      ctx._tela.escrito.length = 0;
      F.telaFalhaApp('ao aplicar seus dados: teste');
      const falha = ctx._tela.escrito.join('');
      return [
        ['iPhone e tratado como celular (usa redirecionamento)', celular, true],
        ['computador nao (mantem o popup, que funciona)', desktop, false],
        ['sem ter saido pro Google, nao ha volta pendente', semMarca, false],
        ['tendo saido agora, a volta e detectada', comMarca, true],
        ['marca velha nao conta como volta de agora', marcaVelha, false],
        ['a tela "Entrou/carregando" existe de verdade', /Entrou/.test(carregando) && /Carregando/i.test(carregando), true],
        ['a tela de falha diz o que quebrou', falha.indexOf('ao aplicar seus dados: teste') >= 0, true],
        ['e oferece saidas em vez de tela morta', /recarregar/.test(falha) && /sair/.test(falha) && /backup/.test(falha), true]
      ];
    }
  }
];

/* ---------- execucao ---------- */
let html;
try { html = fs.readFileSync(alvo, 'utf8'); }
catch (e) { console.error('CHECKS: nao consegui ler ' + alvo + ' — ' + e.message); process.exit(1); }
const js = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x => x[1]).join('\n;\n');
if (!js.trim()) { console.error('CHECKS: nenhum <script> em ' + alvo); process.exit(1); }
let jsLimpo;
try { jsLimpo = semComentarios(js); }
catch (e) { console.error('CHECKS: nao consegui limpar os comentarios — ' + e.message); process.exit(1); }

const falhas = [];
let exercicios = 0;

try { new Function(js); }
catch (e) { falhas.push(['sintaxe', 'o JavaScript do app nao parseia: ' + e.message, 'publicar assim deixa o app no ar sem funcionar']); }

for (const cap of CAPACIDADES) {
  /* presenca e chamadas sempre sobre o codigo SEM COMENTARIOS — comentario que menciona o
     nome da funcao apagada nao pode satisfazer check nenhum (furo real da 1a versao) */
  const definida = f => new RegExp('(?:function\\s+' + f + '\\s*\\(|\\b(?:const|let|var)\\s+' + f + '\\s*=)').test(jsLimpo);
  const ausentes = cap.precisa.filter(f => !definida(f));
  if (ausentes.length) { falhas.push([cap.nome, 'sumiu do arquivo: ' + ausentes.join(', '), cap.perde]); continue; }

  for (const [fn, minimo, onde] of (cap.chamadas || [])) {
    const usos = (jsLimpo.match(new RegExp('\\b' + fn + '\\s*\\(', 'g')) || []).length - 1;
    if (usos < minimo) falhas.push([cap.nome, fn + ' existe mas e chamada ' + usos + 'x (esperado no minimo ' + minimo + ': ' + onde + ')', 'funcao definida e nao ligada nao faz nada — ' + cap.perde]);
  }

  if (!cap.exercicio) continue;
  const recorta = cap.recorta || cap.precisa;
  let F, ctx, asserts;
  try {
    const fontes = recorta.map(n => extrairFuncao(js, n));
    if (fontes.some(f => !f)) throw new Error('nao consegui recortar ' + recorta.filter((n, i) => !fontes[i]).join(', '));
    ctx = cap.contexto ? cap.contexto() : {};
    const globais = Object.keys(ctx);
    F = new Function(...globais, fontes.join('\n') + '\nreturn {' + recorta.join(',') + '};')(...globais.map(k => ctx[k]));
    asserts = cap.exercicio(F, ctx);
  } catch (e) {
    falhas.push([cap.nome, 'NAO CONSEGUI EXERCITAR as funcoes (' + e.message + ')', 'esta checagem se recusa a passar sem ter testado — verde sem teste foi como a regressao de 19/08 passou']);
    continue;
  }
  for (const [descricao, real, esperado] of asserts) {
    exercicios++;
    const bate = JSON.stringify(real) === JSON.stringify(esperado);
    if (!bate) falhas.push([cap.nome, descricao + ' → ' + JSON.stringify(real) + ' (esperado ' + JSON.stringify(esperado) + ')', cap.perde]);
  }
}

if (falhas.length) {
  console.error('');
  console.error('  BARRADO — o app perdeu capacidade que ja estava entregue:');
  console.error('');
  for (const [cap, o_que, perde] of falhas) {
    console.error('  * ' + cap);
    console.error('      ' + o_que);
    console.error('      sem isso: ' + perde);
    console.error('');
  }
  console.error('  Isto costuma ser edicao feita sobre uma copia ANTIGA do index.html.');
  console.error('  Antes de forcar: git log --oneline -5 -- index.html  (e compare com a versao boa).');
  console.error('  Escape consciente: git commit --no-verify');
  console.error('');
  process.exit(1);
}
console.log('checks do app OK — ' + CAPACIDADES.length + ' capacidades, ' + exercicios + ' comportamentos exercitados, sintaxe valida');
