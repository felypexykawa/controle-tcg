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
 * detector: o app tem 198 checagens (105 comportamentos no checks-app.js + 93 no testes-nucleo.js,
 * conferido rodando os dois) e o precos.json, que e o dado que o Felype LE, tinha zero.
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
// so-alfanumerico: o desempate final, que faz hifen e barra caírem no mesmo balde.
// O infinito vira a letra "inf" ANTES da limpeza: se ele fosse simplesmente removido,
// "Quaxly (063/∞)" viraria a chave "063" — tres digitos, que casam por acidente com meio
// arquivo. Ha 12 fichas NNN/∞ aqui; cada uma seria uma mina.
function chave(cod) {
  return normCod(cod).toLowerCase().replace(new RegExp(INF, 'g'), 'inf')
    .normalize('NFKD').replace(/[^a-z0-9]/g, '');
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
  if (!fs.readFileSync(fPre, 'utf8').trim() || !fs.readFileSync(fCod, 'utf8').trim()) {
    console.log('[fichas-rachadas] codigos.txt ou precos.json veio VAZIO — sem conferir (passando).' +
      ' Isso e falha de ambiente (git show que nao devolveu nada), nao dado ruim.');
    process.exit(0);
  }
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
  // UMA lente so, de proposito: mesma chave alfanumerica com codLimpo diferente — separador
  // trocado (hifen x barra x infinito/emoji). Separador nao carrega significado em codigo de
  // carta, entao aqui juntar e sempre certo. Foi essa lente que pegou o caso real de
  // 2026-08-21: "Vaporeon (tg02/tg30)" x "Vaporeon (tg02-tg30)", R$200,00 sumindo da tela.
  //
  // TINHA UMA SEGUNDA LENTE (prefixo de ate 3 caracteres + nome cadastrado igual) e ela foi
  // REMOVIDA no mesmo dia, pela revisao adversarial, antes de rodar em producao. Ela juntava
  // "Charmander (168/165)" com "Charmander (168/165jp)" — inglesa e japonesa, cartas diferentes
  // com precos diferentes. Barrava o commit do Felype por nada E, pior, a mensagem de cura
  // mandava espelhar o preco de uma na outra: a trava instruindo a corrupcao que veio impedir.
  // Mesmo defeito em "Pikachu (SM12)" x "Pikachu (SM120)" e em promo de arte paralela.
  // NAO reintroduzir prefixo sem um criterio que distinga "mesma carta escrita torto" de
  // "carta diferente do mesmo Pokemon" — nome igual NAO distingue, foi o que se provou.
  // Consequencia assumida: par que difere no proprio codigo (swsh183 x swsh183/71) esta FORA
  // do alcance desta trava. Fica declarado aqui em vez de coberto por uma lente que erra.
  const porChave = {};
  linhas.forEach(l => {
    const c = chave(codLimpo(l.t));
    if (!c) return;
    (porChave[c] = porChave[c] || []).push(l);
  });
  const colisoes = Object.keys(porChave)
    .filter(c => new Set(porChave[c].map(l => codLimpo(l.t))).size > 1)
    .map(c => porChave[c]);
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
