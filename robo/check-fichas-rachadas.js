#!/usr/bin/env node
/* TRAVA DE FICHA RACHADA — a mesma carta cadastrada de dois jeitos vira duas fichas de preco,
 * uma com preco e outra vazia, e o item do cadastro que usa a grafia "errada" aparece SEM PRECO
 * na tela do Felype tendo o preco a um palmo de distancia.
 *
 * POR QUE EXISTE (2026-08-21): a rodada do coletor gerou CINCO rachaduras de uma vez
 * (swsh183/71, swsh181-71, tg02-tg30, Xy116/emoji, Jolteon). Uma delas — "Vaporeon (tg02-tg30)" —
 * tinha preco R$200,00 publicado no dia anterior e passou a devolver NADA, em silencio, porque o
 * merge renomeou a ficha para "tg02/tg30" e a linha do cadastro continuou com o hifen.
 * A classe ja tinha reincidido antes (caso Spiritomb, 2026-08-12) e mesmo assim nao havia
 * detector: o app tem 273 checagens e o precos.json, que e o dado que o Felype LE, tinha zero.
 * O pre-commit tambem nao cobria — o filtro dele so olha index.html, checks-app.js,
 * checks-suite.py e testes-nucleo.js, entao commit que mexe so no precos.json nao acionava nada.
 *
 * DESENHO (skill 25): detector de ESTADO determinado, medido pelo CAMINHO DO USUARIO.
 * Nao pergunta "as chaves parecem parecidas?" — pergunta "esta linha do cadastro acha preco?".
 * FAIL-OPEN quanto ao AMBIENTE (arquivo faltando = passa com aviso; a trava nunca impede salvar).
 * FAIL-CLOSED quanto ao CONTEUDO (rachadura viva = exit 1).
 * ESCAPE: git commit --no-verify
 *
 * As funcoes normCod/codLimpo abaixo sao COPIA da fonte canonica em index.html (L3755-3761).
 * Se um dia divergirem, quem manda e o index.html — e este arquivo esta errado.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');

const INF = '∞';           // infinito matematico, o que a Liga usa
const EMOJI = /♾️?/g; // infinito do teclado do celular

function normCod(cod) {
  return ('' + (cod || '')).replace(EMOJI, INF).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
}
function codLimpo(cod) {
  cod = normCod(cod);
  const m = cod.match(/\(([^()]+)\)\s*$/);
  if (m) return normCod(m[1]);
  const t = cod.match(new RegExp('\\s([0-9A-Za-z]{1,6}\\/[0-9A-Za-z' + INF + ']{1,6})\\s*$'));
  return t ? normCod(t[1]) : cod;
}
// so-alfanumerico: o desempate final, que faz hifen e barra caírem no mesmo balde
function chave(cod) {
  return normCod(cod).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
}

function ler() {
  // Os dois caminhos podem ser sobrepostos por ambiente. O pre-commit usa isso pra conferir a
  // versao do INDICE (o que de fato vai ser commitado) em vez da do disco, que pode ter mudanca
  // ainda nao adicionada. Sem as variaveis, confere o disco — que e o certo pra rodada do robo.
  const fCod = process.env.CODIGOS_TXT || path.join(raiz, 'robo', 'codigos.txt');
  const fPre = process.env.PRECOS_JSON || path.join(raiz, 'precos.json');
  if (!fs.existsSync(fCod) || !fs.existsSync(fPre)) {
    console.log('[fichas-rachadas] codigos.txt ou precos.json ausente — sem conferir (passando)');
    process.exit(0);
  }
  const linhas = fs.readFileSync(fCod, 'utf8').split(/\r?\n/)
    .map((t, i) => ({ n: i + 1, t: t.trim() }))
    .filter(l => l.t && !l.t.startsWith('#'));
  let precos;
  try { precos = JSON.parse(fs.readFileSync(fPre, 'utf8')); }
  catch (e) { console.error('[fichas-rachadas] precos.json NAO e JSON valido: ' + e.message); process.exit(1); }
  return { linhas, cartas: precos.cartas || {} };
}

// reproduz precoLigaDe() do app: chave exata -> codLimpo -> indice normalizado
function fichaDe(cartas, idx, cod) {
  return cartas[('' + cod).trim()] || cartas[codLimpo(cod)] || idx[normCod(cod)] || idx[codLimpo(cod)] || null;
}
function temPreco(f) {
  return !!(f && f.status === 'OK' && Array.isArray(f.versoes) && f.versoes.length);
}

function main() {
  const { linhas, cartas } = ler();
  const idx = {};
  Object.keys(cartas).forEach(k => { idx[normCod(k)] = cartas[k]; idx[codLimpo(k)] = cartas[k]; });

  // (A) ORIGEM: duas linhas do cadastro que sao a mesma carta escrita de jeitos diferentes.
  // Duas lentes, porque a rodada de 2026-08-21 produziu as duas formas:
  //   A1 — mesma chave alfanumerica, codLimpo diferente: hifen x barra, emoji x infinito
  //        ("Vaporeon (tg02/tg30)" x "Vaporeon (tg02-tg30)")
  //   A2 — um codigo e PREFIXO do outro (ate 3 caracteres a mais) E o nome cadastrado e o mesmo
  //        ("Jolteon-v (swsh183)" x "Jolteon-v (swsh183/71)")
  // A2 exige o nome igual de proposito: so o prefixo acusaria "036/08" x "036/081", que podem
  // ser cartas de verdade diferentes. O nome do cadastro e a prova barata de que e a mesma.
  const nomeDe = t => chave(normCod(t).replace(/\s*\([^()]*\)\s*$/, '')
    .replace(new RegExp('\\s[0-9A-Za-z]{1,6}\\/[0-9A-Za-z' + INF + ']{1,6}$'), ''));
  const pai = new Map();
  const acha = x => { while (pai.get(x) !== x) { pai.set(x, pai.get(pai.get(x))); x = pai.get(x); } return x; };
  const une = (a, b) => { a = acha(a); b = acha(b); if (a !== b) pai.set(a, b); };
  linhas.forEach(l => pai.set(l, l));
  for (let i = 0; i < linhas.length; i++) {
    for (let j = i + 1; j < linhas.length; j++) {
      const a = linhas[i], b = linhas[j];
      const ca = chave(codLimpo(a.t)), cb = chave(codLimpo(b.t));
      if (!ca || !cb) continue;
      const a1 = ca === cb && codLimpo(a.t) !== codLimpo(b.t);
      const pref = ca !== cb && (ca.startsWith(cb) || cb.startsWith(ca)) && Math.abs(ca.length - cb.length) <= 3;
      const a2 = pref && nomeDe(a.t) && nomeDe(a.t) === nomeDe(b.t);
      if (a1 || a2) une(a, b);
    }
  }
  const grupos = new Map();
  linhas.forEach(l => { const r = acha(l); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(l); });
  const colisoes = [...grupos.values()].filter(g => g.length > 1);
  const grupoDe = new Map();
  colisoes.forEach(g => g.forEach(l => grupoDe.set(l, g)));

  // (B) DANO: linha do cadastro que nao acha preco, tendo uma irma que acha
  const semPreco = [];
  linhas.forEach(l => {
    const f = fichaDe(cartas, idx, l.t);
    if (temPreco(f)) return;
    const irmas = grupoDe.get(l) || [];
    const irmaBoa = irmas.find(o => o !== l && temPreco(fichaDe(cartas, idx, o.t)));
    if (irmaBoa) semPreco.push({ l, irmaBoa });
  });

  let ruim = 0;
  if (colisoes.length) {
    console.log('[fichas-rachadas] MESMA CARTA ESCRITA DE MAIS DE UM JEITO no cadastro:');
    colisoes.forEach(g => {
      const curado = g.every(l => { const f = fichaDe(cartas, idx, l.t); return temPreco(f); });
      console.log('   ' + (curado ? '[coberto por apelido] ' : '[RACHADA VIVA] ') +
        g.map(l => 'L' + l.n + ' "' + l.t + '"').join('  x  '));
    });
  }
  if (semPreco.length) {
    ruim = semPreco.length;
    console.log('[fichas-rachadas] CADASTRO SEM PRECO TENDO IRMA COM PRECO (dano na tela):');
    semPreco.forEach(({ l, irmaBoa }) => {
      const f = fichaDe(cartas, idx, irmaBoa.t);
      console.log('   L' + l.n + ' "' + l.t + '" -> nada' +
        '   |   L' + irmaBoa.n + ' "' + irmaBoa.t + '" -> ' + f.titulo + ' R$' + f.versoes[0].mn);
    });
    console.log('   CURA: na ficha do codigo orfao, copiar os campos de preco da irma e por' +
      ' aliasDe apontando pra ela (historico fica SO na canonica). Ver SKILL.md da rotina precos-liga.');
  }
  if (!colisoes.length && !semPreco.length) {
    console.log('[fichas-rachadas] ok — ' + linhas.length + ' linhas do cadastro, nenhuma rachadura');
  } else if (!ruim) {
    console.log('[fichas-rachadas] ok — ' + colisoes.length +
      ' grafia(s) dupla no cadastro, todas cobertas por apelido (nenhum preco sumindo da tela)');
  }
  process.exit(ruim ? 1 : 0);
}
main();
