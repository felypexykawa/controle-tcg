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
 *  - Deteccao: ESTADO DETERMINADO — as funcoes sao extraidas do arquivo e EXERCITADAS com
 *    casos reais. Nao se conferem comentarios nem se procuram frases: se codLimpo deixar de
 *    devolver "192/184" pra "Frosmoth 192/184", falha. Precisao 100% por construcao.
 *  - Fail-CLOSED de proposito, ao contrario de um hook de trabalho: se este script NAO
 *    conseguir exercitar as funcoes, ele FALHA em vez de passar. Vacina que se declara verde
 *    sem ter exercido nada e pior que vacina nenhuma — foi assim que a regressao passou.
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

/* ---------- extrator: pega o corpo de uma funcao declarada no arquivo ----------
 * Conta chaves ignorando o que esta dentro de string, template, comentario ou regex —
 * necessario porque as proprias funcoes que queremos testar contem regex com {1,6}. */
function extrairFuncao(src, nome) {
  const ini = src.indexOf('function ' + nome + '(');
  if (ini < 0) return null;
  let i = src.indexOf('{', ini);
  if (i < 0) return null;
  let nivel = 0, anterior = '';
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = fimLiteral(src, i, c); anterior = 'x'; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return null; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; if (i < 1) return null; continue; }
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
      for (; j < src.length && n > 0; j++) { if (src[j] === '{') n++; else if (src[j] === '}') n--; }
      j--; }
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

/* ---------- o que o app NAO pode perder ---------- */
const CAPACIDADES = [
  {
    nome: 'codigo solto no cadastro',
    perde: 'cadastro escrito "Frosmoth 192/184" (sem parenteses) para de casar com o preco coletado — a carta fica sem preco na tela, e o grafico de historico dela some junto',
    precisa: ['normCod', 'codLimpo'],
    casos: [
      ['codLimpo', 'Frosmoth 192/184', '192/184'],
      ['codLimpo', 'Spiritomb da cintia 244/217', '244/217'],
      ['codLimpo', "Cynthia's spiritomb (244/217)", '244/217'],
      ['codLimpo', '211/172', '211/172'],
      ['codLimpo', 'Mega gardevoir ex (032/♾️)', '032/∞'],
      ['codLimpo', '110JP/108', '110JP/108']
    ]
  },
  {
    nome: 'campo de codigo fecha o parentese',
    perde: 'o formato torto volta a nascer no cadastro em vez de ser corrigido na entrada — foi o que gerou 18 fichas de preco duplicadas',
    precisa: ['normCod', 'fixaParenteses'],
    chamadas: [['fixaParenteses', 3, 'os 3 formularios que tem campo de codigo (compra, venda avulsa, nota)']],
    casos: [
      ['fixaParenteses', 'Frosmoth 192/184', 'Frosmoth (192/184)'],
      ['fixaParenteses', 'Spiritomb da cintia 244/217', 'Spiritomb da cintia (244/217)'],
      ['fixaParenteses', '244/217', '244/217'],
      ['fixaParenteses', 'Charizard (211/172)', 'Charizard (211/172)'],
      ['fixaParenteses', '', '']
    ]
  },
  {
    nome: 'lista unificada de pendencias no Painel',
    perde: 'as cartas ambiguas da Liga voltam a nao ter lista nenhuma — so apareciam dentro de cada carta, uma por uma; com 24 ambiguas, achar cada uma vira adivinhacao',
    precisa: ['ambiguasPendentes', 'pendenciasResumo', 'abrirPendencias'],
    chamadas: [['abrirPendencias', 1, 'o link do Painel que abre a lista']]
  },
  {
    nome: 'escolha da carta ambigua (picker)',
    perde: 'nao ha como escolher qual carta e a sua quando o codigo bate em varias — o preco fica travado pra sempre',
    precisa: ['abrirEscolhaAmbigua'],
    chamadas: [['abrirEscolhaAmbigua', 1, 'a lista de pendencias e/ou a carta aberta']]
  },
  {
    nome: 'login que nao entra em laco',
    perde: 'as correcoes de login de 19-20/08: redirecionamento no celular, a tela "Entrou/carregando" e a tela de falha com saidas. Sem elas o app volta a prender o dono na tela de login',
    precisa: ['ehCelular', 'telaCarregando', 'telaFalhaApp', 'voltouDeRedirect'],
    chamadas: [['telaCarregando', 1, 'o momento em que o login e aprovado']]
  }
];

/* ---------- execucao ---------- */
let html;
try { html = fs.readFileSync(alvo, 'utf8'); }
catch (e) { console.error('CHECKS: nao consegui ler ' + alvo + ' — ' + e.message); process.exit(1); }
const js = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x => x[1]).join('\n;\n');
if (!js.trim()) { console.error('CHECKS: nenhum <script> em ' + alvo); process.exit(1); }

const falhas = [];

/* 0. sintaxe — mesma checagem de sempre, aqui pra este arquivo ser autossuficiente */
try { new Function(js); }
catch (e) { falhas.push(['sintaxe', 'o JavaScript do app nao parseia: ' + e.message, 'publicar assim deixa o app no ar sem funcionar']); }

for (const cap of CAPACIDADES) {
  const ausentes = cap.precisa.filter(f => !new RegExp('function\\s+' + f + '\\s*\\(').test(js));
  if (ausentes.length) { falhas.push([cap.nome, 'sumiu do arquivo: ' + ausentes.join(', '), cap.perde]); continue; }

  for (const [fn, minimo, onde] of (cap.chamadas || [])) {
    const usos = (js.match(new RegExp('\\b' + fn + '\\s*\\(', 'g')) || []).length - 1; // -1 = a propria declaracao
    if (usos < minimo) falhas.push([cap.nome, fn + ' existe mas e chamada ' + usos + 'x (esperado no minimo ' + minimo + ': ' + onde + ')', 'funcao definida e nao ligada nao faz nada — ' + cap.perde]);
  }

  if (!cap.casos) continue;
  let ambiente;
  try {
    const fontes = cap.precisa.map(n => extrairFuncao(js, n));
    if (fontes.some(f => !f)) throw new Error('nao consegui recortar ' + cap.precisa.filter((n, i) => !fontes[i]).join(', '));
    ambiente = new Function(fontes.join('\n') + '\nreturn {' + cap.precisa.join(',') + '};')();
  } catch (e) {
    falhas.push([cap.nome, 'NAO CONSEGUI EXERCITAR as funcoes (' + e.message + ')', 'esta checagem se recusa a passar sem ter testado — verde sem teste foi como a regressao de 19/08 passou']);
    continue;
  }
  for (const [fn, entrada, esperado] of cap.casos) {
    let real;
    try { real = ambiente[fn](entrada); }
    catch (e) { real = 'ERRO: ' + e.message; }
    if (real !== esperado) falhas.push([cap.nome, fn + '(' + JSON.stringify(entrada) + ') devolveu ' + JSON.stringify(real) + ', esperado ' + JSON.stringify(esperado), cap.perde]);
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
console.log('checks do app OK — ' + CAPACIDADES.length + ' capacidades exercitadas, sintaxe valida');
