/* DETECTOR DE LINHA PARALELA — impede publicar por cima de trabalho que veio por outra porta.
 *
 * POR QUE EXISTE (2026-08-21). O app tinha DUAS copias vivas: a fonte de desenvolvimento
 * (app-tcg/index.html) e a pasta de publicacao (tcg-web/index.html). Uma sessao trabalhou
 * direto na de publicacao (pendencias por tipo, aviso de versao, pontos na nuvem) e outra na
 * fonte (memoria cheia, login, exclusao). Ninguem errou; ninguem mentiu. Quando a segunda
 * publicou, as tres pecas da primeira SUMIRAM DO AR — e o dono percebeu que "perdemos algumas
 * coisas" sem conseguir apontar o que.
 *
 * A vacina de capacidade (checks-app.js) NAO pega isto sozinha: ela sabe o que o app DEVIA ter
 * porque alguem escreveu a capacidade nela. Uma peca nascida na outra copia nunca foi escrita
 * ali — entao sumir dela e mudo para a vacina tambem. Aqui a regua e outra: o que ESTA NO AR.
 *
 * REGRA: se o que esta no ar tem funcao que o que vamos publicar NAO tem, existe uma linha
 * paralela. Publicar apagaria trabalho de alguem. Aborta e diz exatamente o que sumiria.
 *
 * DESENHO (skill 25-travas-e-vigias):
 *  - Degrau: trava de PUBLICACAO. Custo de atencao enquanto verde: ZERO.
 *  - Deteccao: ESTADO DETERMINADO — compara o artefato REAL no ar com o REAL a publicar,
 *    nome a nome. Nao pergunta a ninguem o que deveria existir.
 *  - Fail-OPEN quanto a REDE (sem internet nao barra publicacao: seria trava que impede
 *    trabalho por motivo alheio) e fail-CLOSED quanto ao ACHADO (achou perda, aborta).
 *  - Consumidor: publicar.sh, antes do commit.
 *  - Falso positivo previsto e tratado: remocao INTENCIONAL de funcao. Saida do impasse
 *    declarada na propria mensagem (PUBLICAR_MESMO_ASSIM=1), com o nome do que vai sumir.
 *
 * Uso:  node checa-linha-paralela.js <url-do-app-no-ar> <arquivo-a-publicar>
 */
'use strict';
const fs = require('fs');

const url = process.argv[2];
const alvo = process.argv[3];
if (!url || !alvo) { console.error('uso: node checa-linha-paralela.js <url> <arquivo>'); process.exit(2); }

function nomes(src) {
  /* so o que e DECLARACAO de funcao: e o que some junto quando uma copia sobrescreve a outra.
     Comentario nao conta — a copia velha pode citar o nome da peca nova numa nota. */
  const limpo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const s = new Set();
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
  let m; while ((m = re.exec(limpo))) s.add(m[1] || m[2]);
  return s;
}

function baixar(u) {
  return new Promise((ok, nao) => {
    const lib = u.startsWith('https') ? require('https') : require('http');
    const req = lib.get(u + (u.indexOf('?') < 0 ? '?' : '&') + 'cb=' + Date.now(), r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return baixar(r.headers.location).then(ok, nao); }
      if (r.statusCode !== 200) { r.resume(); return nao(new Error('HTTP ' + r.statusCode)); }
      let b = ''; r.setEncoding('utf8'); r.on('data', c => b += c); r.on('end', () => ok(b));
    });
    req.on('error', nao);
    req.setTimeout(20000, () => { req.destroy(new Error('demorou demais')); });
  });
}

baixar(url).then(noAr => {
  const aPublicar = fs.readFileSync(alvo, 'utf8');
  if (noAr.length < 50000) throw new Error('o que voltou do ar nao parece o app (' + noAr.length + ' bytes)');
  const A = nomes(noAr), B = nomes(aPublicar);
  const sumiriam = [...A].filter(n => !B.has(n)).sort();
  if (!sumiriam.length) {
    console.log('linha paralela: nao ha — o que vai ao ar contem tudo o que ja estava (' + A.size + ' pecas conferidas)');
    return;
  }
  console.error('');
  console.error('  ABORTADO — existe uma LINHA PARALELA deste app.');
  console.error('');
  console.error('  Estas ' + sumiriam.length + ' peca(s) estao NO AR agora e NAO estao no arquivo que voce ia publicar.');
  console.error('  Publicar assim as apagaria do app, e ninguem receberia aviso:');
  console.error('');
  for (const n of sumiriam.slice(0, 40)) console.error('    - ' + n);
  if (sumiriam.length > 40) console.error('    ... e mais ' + (sumiriam.length - 40));
  console.error('');
  console.error('  Isto quer dizer que alguem publicou trabalho por OUTRA porta que nao esta');
  console.error('  na sua copia. Traga esse trabalho pra ca ANTES de publicar (junte as duas');
  console.error('  copias) — nao publique por cima.');
  console.error('');
  console.error('  Se a remocao for INTENCIONAL, publique com:  PUBLICAR_MESMO_ASSIM=1 sh publicar.sh "..."');
  console.error('');
  process.exit(1);
}).catch(e => {
  /* fail-OPEN de rede: sem internet, ou o site fora do ar, nao pode impedir de publicar —
     seria trava que trava o trabalho por motivo alheio, e trava assim ensina a burlar trava. */
  console.log('linha paralela: nao deu pra conferir com o ar (' + e.message + ') — seguindo sem esta conferencia');
});
