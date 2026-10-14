/* ===========================================================================
   caminhos.js — os caminhos do USUARIO do Controle TCG, exercitados num
   navegador de verdade pelo runner C:\Users\USER\.claude\health\provar-caminhos.js

   POR QUE EXISTE
     As 4 camadas de verificacao deste app (checks-app.js, testes-nucleo.js,
     checks-suite.py, CI) sao todas verdes e NENHUMA abre tela: em
     testes-nucleo.js o DOM e dublê — getElementById devolve stub pra qualquer
     id, setTimeout nunca dispara, clipboard.writeText e no-op, FileReader
     tambem. Por isso 12 defeitos da semana passaram por elas. Aqui a tela abre,
     o botao e clicado e a assercao e sobre o que apareceu na TELA.

   GATILHO DE CONSULTA — quem / quando / por que
     quem   : publicar.sh (passo 2.5), automaticamente.
     quando : antes de toda publicacao. E a mao, sempre que alguem mexer num
              botao, tela ou gesto deste app.
     por que: publicacao. NAO roda no pre-commit de proposito — encarecer o
              commit empurra pra rota que contorna.
     a mao  : node C:\Users\USER\.claude\health\provar-caminhos.js C:\Users\USER\tcg-web\caminhos.js
     provar as travas: o publicar.sh roda sozinho quando caminhos.js muda na publicacao; a mao, ao mexer num caminho:
              ...\provar-caminhos.js ...\caminhos.js --negativo
              (roda cada caminho primeiro COM a cura, que tem de ficar verde, e depois SEM ela, e exige que reprove)

   REGRAS QUE ESTE ARQUIVO OBEDECE
     - todo caminho declara `negativo`: a mutacao que remove a cura. Caminho que
       fica verde sem a cura nao testa nada — o runner cobra isso.
     - nada de `all([])`: toda assercao sobre "todos" passa por t.aoMenos(n,...).
     - nunca cravar valor nem contagem do dia. Afirma RELACOES ("o 2o item
       tambem tem foto", "o que excluí nao voltou").
     - dado sintetico: a suite cria os proprios lancamentos, sempre com marca
       PROVA-<algo>. Nada de dado real.
     - dirige a PORTA (o botao), nunca a funcao interna.

   NUVEM DE MENTIRA — o que e simulado e o que NAO e
     O artefato publicado tem firebaseConfig preenchido, entao ele NASCE na tela
     de login do Google — que nenhum robo consegue passar. Aqui o SDK do Google
     e bloqueado na rede e trocado por uma nuvem de mentira que vive no processo
     do runner e e COMPARTILHADA pelos dois "aparelhos". Isso e simular o
     SERVICO REMOTO (legitimo), nao a tela: o DOM, os cliques, o render, o
     localStorage, o IndexedDB, o FileReader e o canvas sao todos reais.
     O que esta suite NAO cobre, por isso: login Google, regras do Firestore,
     atomicidade real da transacao e latencia de rede de verdade.
   =========================================================================== */

const fs = require('fs');
const path = require('path');

/* ---------------------------------------------------------------- nuvem falsa
   Um documento por caminho, na memoria do runner. Os dois aparelhos batem aqui,
   entao "o outro celular" e de verdade um segundo navegador com storage proprio. */
const nuvem = {};
function zerarNuvem() { Object.keys(nuvem).forEach(k => delete nuvem[k]); }

function bancoFalso(op, a) {
  if (op === 'set') { nuvem[a.p] = a.d; return true; }
  if (op === 'get') { return nuvem[a.p] || null; }
  if (op === 'del') { delete nuvem[a.p]; return true; }
  if (op === 'lista') {
    const pre = a.p + '/';
    let linhas = Object.keys(nuvem)
      .filter(k => k.startsWith(pre) && k.slice(pre.length).indexOf('/') < 0)
      .map(k => ({ id: k.slice(pre.length), d: nuvem[k] }));
    if (a.campo) linhas = linhas.filter(r => r.d && r.d[a.campo] === a.valor);
    if (a.ordem) linhas.sort((x, y) => {
      const vx = (x.d || {})[a.ordem], vy = (y.d || {})[a.ordem];
      return a.desc ? (vy > vx ? 1 : vy < vx ? -1 : 0) : (vx > vy ? 1 : vx < vy ? -1 : 0);
    });
    if (a.limite) linhas = linhas.slice(0, a.limite);
    return linhas;
  }
  return null;
}

/* roda DENTRO da pagina, antes de qualquer script do app */
const INIT = `(() => {
  const N = (op, a) => window.__banco(op, a);
  const usuario = { email: 'felypexykawa@gmail.com', uid: 'prova' };
  window.__semRede = false;
  const semRede = () => Promise.reject(new Error('sem rede (simulado)'));

  function docRef(p) {
    return {
      __p: p,
      collection(c) { return colRef(p + '/' + c); },
      set(d) { return window.__semRede ? semRede() : N('set', { p, d: JSON.parse(JSON.stringify(d)) }); },
      get() { return window.__semRede ? semRede() : N('get', { p }).then(v => envelopeDoc(p.split('/').pop(), v)); },
      delete() { return window.__semRede ? semRede() : N('del', { p }); },
      onSnapshot(cb, err) {
        let ultimo = '\\u0000';
        const bate = () => {
          if (window.__semRede) return;
          N('get', { p }).then(v => {
            const s = JSON.stringify(v || null);
            if (s === ultimo) return;
            ultimo = s;
            cb(envelopeDoc(p.split('/').pop(), v));
          }).catch(() => {});
        };
        bate();
        const h = setInterval(bate, 100);
        return () => clearInterval(h);
      }
    };
  }
  function envelopeDoc(id, v) {
    return { id, exists: !!v, data: () => v, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function envelopeQuery(linhas) {
    return {
      empty: !linhas.length, size: linhas.length,
      metadata: { fromCache: false },
      docs: linhas.map(r => envelopeDoc(r.id, r.d)),
      forEach(f) { linhas.forEach(r => f(envelopeDoc(r.id, r.d))); }
    };
  }
  function consulta(p, extra) {
    const q = Object.assign({ p }, extra || {});
    return {
      where(campo, op, valor) { return consulta(p, Object.assign({}, q, { campo, valor })); },
      orderBy(ordem, dir) { return consulta(p, Object.assign({}, q, { ordem, desc: dir === 'desc' })); },
      limit(limite) { return consulta(p, Object.assign({}, q, { limite })); },
      get() { return window.__semRede ? semRede() : N('lista', q).then(envelopeQuery); }
    };
  }
  function colRef(p) {
    const base = consulta(p);
    return Object.assign({}, base, { doc(id) { return docRef(p + '/' + id); } });
  }

  const bd = {
    collection: colRef,
    runTransaction(fn) {
      if (window.__semRede) return semRede();
      const pend = [];
      const tx = {
        get(r) { return r.get(); },
        set(r, d) { pend.push([r.__p, JSON.parse(JSON.stringify(d))]); return tx; },
        update(r, d) { pend.push([r.__p, JSON.parse(JSON.stringify(d))]); return tx; }
      };
      return Promise.resolve(fn(tx)).then(async v => {
        for (const [p, d] of pend) await N('set', { p, d });
        return v;
      });
    }
  };

  const autent = {
    currentUser: usuario,
    getRedirectResult() { return Promise.resolve({ user: null }); },
    onAuthStateChanged(cb) { setTimeout(() => { try { cb(usuario); } catch (e) {} }, 0); return () => {}; },
    signInWithPopup() { return Promise.resolve({ user: usuario }); },
    signInWithRedirect() { return Promise.resolve(); },
    signOut() { return Promise.resolve(); }
  };

  const auth = () => autent;
  auth.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };
  window.firebase = { initializeApp() {}, auth, firestore: () => bd, apps: [] };
})();`;

/* --------------------------------------------------------------- utilitarios
   Todos clicam no ELEMENTO REAL da tela. Nenhum chama funcao interna do app. */

/* 1x1 PNG valido — o app comprime de verdade (FileReader + Image + canvas) */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

async function achar(p, texto, dica) {
  const h = await p.evaluateHandle((t) => {
    const visivel = e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
    const cand = [];
    document.querySelectorAll('button,div,span,a,label,li').forEach(e => {
      if (!visivel(e)) return;
      const txt = (e.innerText || '').replace(/\s+/g, ' ').trim();
      if (!txt || txt.indexOf(t) < 0) return;
      cand.push(e);
    });
    /* o menor elemento que contem o texto e o controle; os maiores sao os pais */
    cand.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    return cand[0] || null;
  }, texto);
  const el = h.asElement();
  if (!el) { const e = new Error(`nao achei na tela o controle "${texto}"${dica ? ' (' + dica + ')' : ''}`); e.reprova = true; throw e; }
  return el;
}

/* O app tem cabecalho fixo em cima e barra de abas fixa embaixo. Sem centralizar
   o alvo, o clique de mouse REAL cai em cima da barra fixa e o controle nunca
   recebe nada — o teste passa a testar a barra. Centralizar e o que o dedo do
   dono faz sozinho quando ele rola a tela ate ver o botao. */
async function centralizar(el, p) {
  await el.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'center' }));
  await p.waitForTimeout(80);
}

async function clicar(p, texto, dica) {
  /* a tela pode se refazer entre achar o botao e clicar nele (a de backup fecha e reabre o modal quando os pontos da nuvem chegam) e o clique
     falha com "Element is not attached to the DOM" — 19/09/2026, no ensaio da publicacao. So ESSE erro e repetido (ate 3 tentativas, achando o
     botao de novo); qualquer outro — botao que nao existe, coberto, invisivel — reprova na primeira, como sempre. */
  for (let tentativa = 1; ; tentativa++) {
    try {
      const el = await achar(p, texto, dica);
      await centralizar(el, p);
      await el.click({ force: true });
      break;
    } catch (e) {
      if (tentativa < 3 && /not attached to the DOM/i.test(String((e && e.message) || e))) { await p.waitForTimeout(250); continue; }
      throw e;
    }
  }
  await p.waitForTimeout(180);
}

async function preencher(p, id, valor) {
  const ok = await p.evaluate(([i, v]) => {
    const e = document.getElementById(i);
    if (!e) return false;
    e.focus(); e.value = v;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, [id, valor]);
  if (!ok) { const e = new Error(`o campo "${id}" nao existe nesta tela`); e.reprova = true; throw e; }
}

async function esperarApp(p) {
  await p.waitForFunction(() => {
    const v = document.getElementById('view');
    return v && v.innerText && v.innerText.length > 40 && !/entrar com o google/i.test(v.innerText);
  }, null, { timeout: 15000 });
  await p.waitForTimeout(250);
}

/* abre a tela de lancar pelo botao do cabecalho (a porta do usuario) */
async function irLancar(p) { await clicar(p, 'Lançar'); await p.waitForTimeout(250); }

/* Consultar -> escolhe o cartao do filtro */
async function irConsultar(p, filtro) {
  await clicar(p, 'Consultar');
  await p.waitForTimeout(200);
  await clicar(p, filtro || 'Tudo', 'cartao de filtro da tela Consultar');
  await p.waitForTimeout(300);
}

/* linhas de lancamento renderizadas AGORA (id="mv-<id>"), com o texto e se tem foto */
function linhasNaTela(p) {
  return p.evaluate(() => [...document.querySelectorAll('[id^="mv-"]')].map(e => ({
    id: e.id.slice(3),
    txt: (e.innerText || '').replace(/\s+/g, ' ').trim(),
    temFoto: !!e.querySelector('img')
  })));
}

/* lanca uma COMPRA simples pela tela; devolve a marca usada na observacao */
async function lancarCompra(p, marca, extra) {
  extra = extra || {};
  await irLancar(p);
  await preencher(p, 'f_cat', extra.cat || 'Single/Carta');
  if (extra.jogo) await preencher(p, 'f_jogo', extra.jogo);
  if (extra.codigo) await preencher(p, 'f_cod', extra.codigo);
  await preencher(p, 'f_qtd', '1');
  await preencher(p, 'f_val', String(extra.valor || 10));
  await preencher(p, 'f_obs', marca);
  await clicar(p, 'Salvar e lançar outro');
  await p.waitForTimeout(400);
  return marca;
}

/* ---- Aparencia, fase B (14/10/2026): imagens PROPRIAS. Tudo aqui OBSERVA o navegador de verdade (canvas, IndexedDB, arquivo); quem age e sempre o clique. ---- */
const zlib = require('zlib');
function crc32(buf) { let crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { let c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function pedacoPng(tipo, dados) { const len = Buffer.alloc(4); len.writeUInt32BE(dados.length); const td = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
/* PNG de verdade: papel branco com uma faixa diagonal preta (cerca de 5% da area) — o que um desenho de traco em fundo liso e, em miniatura */
function pngDesenho(w, h) {
  const lin = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { lin[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const v = Math.abs(x * h / w - y) < 4 ? 0 : 255; const o = y * (w * 3 + 1) + 1 + x * 3; lin[o] = v; lin[o + 1] = v; lin[o + 2] = v; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pedacoPng('IHDR', ihdr), pedacoPng('IDAT', zlib.deflateSync(lin)), pedacoPng('IEND', Buffer.alloc(0))]);
}
/* PNG so de papel branco (barato de gerar e de comprimir): serve para provar o teto de megapixels sem mandar um arquivo gigante */
function pngBranco(w, h) {
  const lin = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) lin[y * (w * 3 + 1)] = 0;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pedacoPng('IHDR', ihdr), pedacoPng('IDAT', zlib.deflateSync(lin)), pedacoPng('IEND', Buffer.alloc(0))]);
}
/* espera uma condicao da tela; estourar o tempo e REPROVA do caminho (nunca pane da maquina) */
async function esperaOu(p, fn, arg, msg, ms) {
  try { await p.waitForFunction(fn, arg, { timeout: ms || 8000 }); }
  catch (e) { if (e && e.name === 'TimeoutError') { const r = new Error(msg); r.reprova = true; throw r; } throw e; }
}
/* a mascara que a testada usa AGORA (o que o dono ve) */
const mascaraDaTestada = p => p.evaluate(() => { const e = document.querySelector('.temaTopo .arte'); if (!e) return ''; const cs = getComputedStyle(e); return cs.webkitMaskImage || cs.maskImage || ''; });
/* o arquivo guardado, lido de volta por um canvas: quanto e opaco, quanto e transparente e qual a cor mais clara entre os pontos opacos */
const estatMascara = p => p.evaluate(async () => {
  const m = Object.values(MEUS)[0]; if (!m) return null;
  const bmp = await createImageBitmap(await (await fetch(m.url)).blob());
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data, n = c.width * c.height; let op = 0, tr = 0, cor = 0;
  for (let i = 0; i < n; i++) { const a = d[i * 4 + 3]; if (a > 128) { op++; cor = Math.max(cor, d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); } else if (a < 10) tr++; }
  return { id: m.id, nome: m.nome, w: c.width, h: c.height, opaco: op / n, transparente: tr / n, corMax: cor };
});
/* a transparencia (0-255) de UM ponto da primeira imagem guardada, lida de volta por um canvas */
const ALFA_PT = async xy => { const m = Object.values(MEUS)[0]; if (!m) return -1; const b = await createImageBitmap(await (await fetch(m.url)).blob()); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const x = c.getContext('2d'); x.drawImage(b, 0, 0); return x.getImageData(xy[0], xy[1], 1, 1).data[3]; };
const alfaDoPonto = (p, xy) => p.evaluate(ALFA_PT, xy);
/* espera ate a condicao sobre o ponto ficar verdadeira; estourar o tempo REPROVA o caminho */
async function esperaAlfa(p, xy, cond, msg, ms) {
  const fim = Date.now() + (ms || 8000);
  for (;;) { const a = await alfaDoPonto(p, xy); if (cond(a)) return a; if (Date.now() > fim) { const r = new Error(msg + ' (ultimo valor lido: ' + a + ')'); r.reprova = true; throw r; } await p.waitForTimeout(150); }
}
/* o elemento esta DENTRO da area visivel da folha aberta, sem rolar? (a folha e a caixa branca dentro do #modal) */
const naVistaDaFolha = (p, f) => p.evaluate(g => {
  const caixa = document.querySelector('#modal > div'); if (!caixa) return { achou: false, motivo: 'sem folha aberta' };
  const cr = caixa.getBoundingClientRect();
  const el = g.id ? caixa.querySelector('#' + g.id) : [...caixa.querySelectorAll(g.tag || '*')].filter(e => (e.innerText || '').includes(g.texto)).sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
  if (!el) return { achou: false, motivo: 'nao achei ' + (g.id || g.texto) };
  const r = el.getBoundingClientRect();
  const topoEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), livre = !!topoEl && (topoEl === el || el.contains(topoEl));
  return { achou: true, livre, cobertoPor: livre ? '' : (topoEl ? (topoEl.tagName + '.' + (topoEl.className || '')) : 'nada'), dentro: r.height > 1 && r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1, topo: Math.round(r.top - cr.top), base: Math.round(r.bottom - cr.top), folha: Math.round(cr.height), conteudo: caixa.scrollHeight };
}, f);
/* o que esta no IndexedDB do aparelho, lido direto (sem passar pelo app) */
const guardadasNoAparelho = p => p.evaluate(async () => {
  if (indexedDB.databases) { const bs = await indexedDB.databases(); if (!bs.some(b => b.name === 'tcg_aparencia_img')) return []; }
  return await new Promise(res => { const rq = indexedDB.open('tcg_aparencia_img'); rq.onerror = () => res(null);
    rq.onsuccess = () => { const db = rq.result; try { const r = db.transaction('imgs', 'readonly').objectStore('imgs').getAll();
      r.onsuccess = () => { db.close(); res(r.result.map(x => ({ id: x.id, nome: x.nome, w: x.w, h: x.h, tipo: x.blob && x.blob.type, tam: x.blob && x.blob.size }))); }; r.onerror = () => res(null); } catch (e) { res(null); } }; });
});

/* ------------------------------------------------------------------ caminhos */
const BASE_CONTROLES = path.join(__dirname, 'caminhos-controles.json');
const TELAS_VARRIDAS = ['Painel', 'Consultar', 'Fluxo de caixa', 'Fluxo de estoque', 'Relatório', 'Simular', 'Lançar'];

/* rotulo comparavel entre rodadas: numero vira "#" e mes com ano ("ago/26") vira "mês/#" — SO nesse formato, porque "set" e
   "dez" sao palavras comuns num app de TCG ("Coleção / set") e trocar a palavra solta juntaria dois controles num so (revisor
   disco r2, L7). Vale dos DOIS lados: no que a tela mostra agora e no inventario gravado (revisor fiacao r2, M2 — de um lado so,
   a virada de mes virava "controle sumiu", e a saida que o caminho sugere apagava o inventario inteiro). */
function normControle(item) {
  const s = String(item), i = s.indexOf(':');
  if (i < 0) return s;
  let rot = s.slice(i + 1).replace(/\s+/g, ' ').trim();
  rot = rot.replace(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/(?=[\d#])/gi, 'mês/');
  rot = rot.replace(/\d+/g, '#').trim().slice(0, 60);
  return s.slice(0, i) + ':' + rot;
}

async function varrerControles(p) {
  const mapa = {};
  for (const tela of TELAS_VARRIDAS) {
    await clicar(p, tela, 'aba do rodape/cabecalho');
    await p.waitForTimeout(350);
    const crus = await p.evaluate(() => {
      const visivel = e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
      const lista = [];
      document.querySelectorAll('button,select,input,[onclick]').forEach(e => {
        if (!visivel(e)) return;
        const tag = e.tagName.toLowerCase();
        const rot = (tag === 'input' || tag === 'select')
          ? (e.id || e.getAttribute('placeholder') || '')
          : (e.innerText || '').replace(/\s+/g, ' ').trim();
        if (rot) lista.push(tag + ':' + rot);
      });
      return lista;
    });
    mapa[tela] = [...new Set(crus.map(normControle))].sort();
  }
  return mapa;
}

module.exports = {
  app: 'index.html',
  ambiente: {
    bloquear: ['**/firebasejs/**'],
    initScript: INIT,
    expor: { __banco: bancoFalso },
    antes: async () => { zerarNuvem(); }
  },

  caminhos: [

    /* ------------------------------------------------------------------ (1) */
    {
      id: 'duplo-toque-nao-lanca-duas-vezes',
      titulo: 'dois toques colados no botao de gravar entram como UM lancamento',
      /* a cura: o ouvinte de clique na fase de captura, que barra o 2o toque com
         a MESMA chave (funcao + argumentos) dentro de 900ms */
      negativo: { de: 'if(_ultToque.chave===attr&&agora-_ultToque.ts<900){', para: 'if(false){' },
      async rodar(t) {
        const p = t.p;
        await esperarApp(p);
        const marca = 'PROVA-DUPLO-' + Date.now();
        await irLancar(p);
        await preencher(p, 'f_cat', 'Single/Carta');
        await preencher(p, 'f_qtd', '1');
        await preencher(p, 'f_val', '77');
        await preencher(p, 'f_obs', marca);

        /* Dois toques colados, como no celular. O 2o toque procura o botao DE
           NOVO de proposito: o 1o toque repinta a tela, entao o botao da 2a vez
           e outro ELEMENTO com o mesmo onclick — que e exatamente o buraco que a
           cura fecha (ela guarda o atributo, nao a identidade do elemento). */
        const b1 = await achar(p, 'Salvar e lançar outro');
        await centralizar(b1, p);
        await b1.click({ force: true });
        await p.waitForTimeout(60);
        const avisosApos1 = p.__dialogos.length;
        const b2 = await achar(p, 'Salvar e lançar outro');
        await centralizar(b2, p);
        await b2.click({ force: true });
        await p.waitForTimeout(700);

        /* O que o dono VE quando a cura falha: o gravador roda de novo, agora em
           cima do formulario ja limpo, e o app dispara um aviso na cara dele
           ("Escolha o tipo de produto"). Com a cura, o 2o toque nao chega la e
           nenhum aviso novo aparece. */
        const avisosNovos = p.__dialogos.slice(avisosApos1);
        t.ok(avisosNovos.length === 0,
          'o 2o toque CHEGOU a rodar o gravador — apareceu aviso na tela depois dele: ' +
          avisosNovos.map(d => d.tipo + ' "' + d.msg + '"').join(' · '));

        await irConsultar(p, 'Tudo');
        const linhas = await linhasNaTela(p);
        t.aoMenos(1, linhas, 'linha(s) de lancamento na tela Consultar');
        const minhas = linhas.filter(l => l.txt.indexOf(marca) >= 0);
        t.igual(minhas.length, 1, 'lancamentos gravados com a minha marca pelos dois toques');
        /* o aparelho comecou vazio nesta rodada: o total tem de ser o 1 que lancei */
        t.igual(linhas.length, 1, 'total de lancamentos no aparelho depois do toque duplo');
      }
    },

    /* ------------------------------------------------------------------ (2) */
    {
      id: 'nota-com-varios-itens-cada-um-com-sua-foto',
      titulo: 'nota de 3 itens: a foto de CADA carta fica com a carta dela',
      /* a cura: salvarNota anexa as fotos do item ao lancamento DAQUELE item.
         O negativo reproduz o defeito historico: so o 1o item recebia foto. */
      negativo: {
        de: 'aplicarFotosDoItem(it.fotos,_idIt)',
        para: 'aplicarFotosDoItem(i===0?it.fotos:[],_idIt)'
      },
      limiteMs: 45000,
      async rodar(t) {
        const p = t.p;
        await esperarApp(p);
        const marca = 'PV' + String(Date.now()).slice(-6);

        await irLancar(p);
        await clicar(p, 'Nota · vários', 'alternador 1 item / nota');

        for (let i = 1; i <= 3; i++) {
          await preencher(p, 'n_cat', 'Single/Carta');
          await preencher(p, 'n_cod', marca + '-' + i);
          await preencher(p, 'n_qtd', '1');
          await preencher(p, 'n_unit', String(10 * i));
          /* foto DESTA carta — pela porta: botao -> modal -> escolher arquivo */
          await clicar(p, '📷 foto DESTA carta');
          await p.waitForSelector('#fotoItemArq', { state: 'attached', timeout: 5000 });
          await p.setInputFiles('#fotoItemArq', { name: `carta${i}.png`, mimeType: 'image/png', buffer: PNG_1x1 });
          await p.waitForTimeout(500);
          await clicar(p, 'fechar');
          await clicar(p, '+ adicionar à nota');
          await p.waitForTimeout(250);
        }

        await clicar(p, 'Salvar nota');
        /* a miniatura nasce de forma assincrona: comprime -> grava na nuvem -> conta */
        await p.waitForTimeout(1500);

        await irConsultar(p, 'Compras');
        /* "por nota" mostra a nota fechada; e em "detalhado" que cada carta
           aparece com a foto DELA — que e o que esta em prova aqui */
        await clicar(p, '☰ detalhado', 'alternador por nota / detalhado');
        await p.waitForTimeout(600);

        const linhas = await linhasNaTela(p);
        const minhas = linhas.filter(l => l.txt.indexOf(marca) >= 0);
        t.aoMenos(3, minhas, `itens da nota ${marca} na tela`);
        const semFoto = minhas.filter(l => !l.temFoto);
        t.ok(semFoto.length === 0,
          `${semFoto.length} de ${minhas.length} itens da nota ficaram SEM a foto da carta na tela` +
          (semFoto.length ? ' — ex.: ' + semFoto[0].txt.slice(0, 80) : ''));
      }
    },

    /* ------------------------------------------------------------------ (3) */
    {
      id: 'exclusao-nao-ressuscita-no-outro-aparelho',
      titulo: 'apaguei num aparelho e nao voltou no outro — e o que o outro lancou sem rede entrou',
      aparelhos: 2,
      /* a cura: o registro de exclusao (tumulos). Sem ele a uniao de "ausente"
         com "presente" da PRESENTE, e o que foi apagado ressuscita. */
      /* [13/09] o trecho antigo ("!!(id&&excluidos[id])") deixou de existir no commit 8c6f5a5 de 25/08 (marca de exclusao com
         sinal) e este negativo ficou MORTO 19 dias sem ninguem ver, porque nenhuma porta rodava --negativo (revisor fiacao r2, M4).
         Achado na 1a vez que o publicar.sh passou a rodar o negativo. */
      negativo: { de: 'function estaExcluido(id){return !!(id&&+excluidos[id]>0);}', para: 'function estaExcluido(id){return false;}' },
      limiteMs: 45000,
      async rodar(t) {
        const [A, B] = t.paginas;
        await esperarApp(A);
        await esperarApp(B);

        const alfa = 'PROVA-ALFA-' + String(Date.now()).slice(-6);
        const beta = 'PROVA-BETA-' + String(Date.now()).slice(-6);
        const gama = 'PROVA-GAMA-' + String(Date.now()).slice(-6);

        /* A lanca dois; B recebe pela nuvem */
        await lancarCompra(A, alfa);
        await lancarCompra(A, beta);
        await B.waitForTimeout(900);
        await irConsultar(B, 'Tudo');
        const antes = await linhasNaTela(B);
        t.aoMenos(2, antes, 'lancamentos que chegaram no aparelho B');
        t.ok(antes.some(l => l.txt.indexOf(alfa) >= 0), 'B nao recebeu o lancamento ALFA — a nuvem simulada nao entregou');

        /* B fica sem rede e lanca o proprio (o caso "lancei sem internet") */
        await B.evaluate(() => { window.__semRede = true; });
        await lancarCompra(B, gama);

        /* A, com rede, APAGA o ALFA — pela porta: abre a linha, 🗑 excluir, confirma */
        await irConsultar(A, 'Tudo');
        const linhasA = await linhasNaTela(A);
        const alvo = linhasA.find(l => l.txt.indexOf(alfa) >= 0);
        t.ok(!!alvo, 'nao achei o ALFA na tela do aparelho A pra excluir');
        await A.evaluate(id => document.getElementById('mv-' + id).querySelector('div').click(), alvo.id);
        await A.waitForTimeout(300);
        await clicar(A, '🗑 excluir');
        await clicar(A, '🗑 Apagar', 'botao de confirmacao do modal de exclusao');
        await A.waitForTimeout(700);
        const depoisA = await linhasNaTela(A);
        t.ok(!depoisA.some(l => l.txt.indexOf(alfa) >= 0), 'o ALFA continuou na tela do proprio aparelho A depois de apagar');

        /* B volta a ter rede: recebe o estado de A ja tendo mudanca local */
        await B.evaluate(() => { window.__semRede = false; });
        await B.waitForTimeout(2500);
        await irConsultar(B, 'Tudo');
        const depoisB = await linhasNaTela(B);
        t.aoMenos(1, depoisB, 'linhas na tela do aparelho B depois de reconectar');
        t.ok(!depoisB.some(l => l.txt.indexOf(alfa) >= 0),
          'RESSUSCITOU: o lancamento apagado no aparelho A voltou na tela do aparelho B');
        /* falso-positivo: a trava nao pode engolir o que B lancou legitimamente */
        t.ok(depoisB.some(l => l.txt.indexOf(gama) >= 0),
          'o lancamento que B fez sem internet sumiu quando a rede voltou');
        t.ok(depoisB.some(l => l.txt.indexOf(beta) >= 0),
          'o lancamento BETA, que ninguem apagou, sumiu da tela de B');
      }
    },

    /* ------------------------------------------------------------------ (4) */
    {
      id: 'busca-com-espaco-no-campo-real',
      titulo: 'digitar "One Piece" no campo de busca filtra a lista na tela',
      /* a cura: o campo existe E esta ligado no motor de busca. O defeito
         historico era exatamente esse: o motor filtrava, mas nunca existiu campo. */
      negativo: { de: 'oninput="buscaCons(this)"', para: 'oninput=""' },
      limiteMs: 40000,
      async rodar(t) {
        const p = t.p;
        await esperarApp(p);
        const achavel = 'PROVA-ACHAR-' + String(Date.now()).slice(-6);
        const isca = 'PROVA-ISCA-' + String(Date.now()).slice(-6);

        await lancarCompra(p, achavel, { jogo: 'One Piece' });
        await lancarCompra(p, isca, { jogo: 'Pokémon' });

        await irConsultar(p, 'Tudo');
        const todas = await linhasNaTela(p);
        t.aoMenos(2, todas, 'lancamentos na lista antes de buscar');

        await preencher(p, 'consBusca', 'One Piece');
        await p.waitForTimeout(700);   /* o campo espera 200ms antes de refiltrar */

        const filtradas = await linhasNaTela(p);
        t.aoMenos(1, filtradas, 'linhas restantes depois da busca (busca que zera a lista nao prova nada)');
        t.ok(filtradas.some(l => l.txt.indexOf(achavel) >= 0),
          'o item de One Piece sumiu da lista ao buscar por "One Piece"');
        t.ok(!filtradas.some(l => l.txt.indexOf(isca) >= 0),
          'a busca com espaco NAO filtrou: o item de Pokemon continuou na lista');
      }
    },

    /* ------------------------------------------------------------------ (5) */
    {
      id: 'pendencias-agrupadas-por-tipo-na-tela',
      titulo: 'abrir Pendencias mostra os tipos separados, e as contas fecham',
      /* a cura: os grupos por tipo (Felype, 20/08: "preciso dos tipos de
         pendencias separados dentro desta lista"). O negativo funde tudo num so. */
      negativo: {
        de: ".concat(G.map(g=>chip(g.id,g.ic+' '+g.itens.length,_pendFiltro===g.id))).join('')",
        para: ".concat([]).join('')"
      },
      limiteMs: 40000,
      async rodar(t) {
        const p = t.p;
        await esperarApp(p);
        /* gera pendencia de verdade: compra sem codigo e sem conta */
        await lancarCompra(p, 'PROVA-PEND-' + String(Date.now()).slice(-6));
        await clicar(p, 'Painel');
        await p.waitForTimeout(500);
        await clicar(p, 'pendências', 'link de pendencias no Painel');
        await p.waitForTimeout(600);

        const modal = await p.evaluate(() => {
          const m = document.getElementById('modal');
          if (!m) return null;
          const visivel = e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
          const chips = [...m.querySelectorAll('span[onclick^="abrirPendencias("]')].filter(visivel)
            .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
          const grupos = [...m.querySelectorAll('.item')].filter(visivel)
            .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
          return { txt: (m.innerText || '').replace(/\s+/g, ' ').trim(), chips, grupos };
        });
        t.ok(!!modal, 'o painel de pendencias nao abriu na tela');
        t.contem(modal.txt.toLowerCase(), 'pendências', 'titulo do painel de pendencias');

        /* as pilulas por tipo tem de existir alem da pilula "todos" */
        const porTipo = modal.chips.filter(c => !/^todos/i.test(c));
        t.aoMenos(1, porTipo, 'pilula(s) de TIPO de pendencia (alem de "todos")');
        t.aoMenos(1, modal.grupos, 'grupo(s) de pendencia listado(s) no mapa');

        /* relacao, nunca numero do dia: a soma dos tipos = o total de "todos" */
        const total = (modal.chips.find(c => /^todos/i.test(c)) || '').match(/(\d+)/);
        t.ok(!!total, 'a pilula "todos (N)" nao apareceu com contagem');
        const soma = porTipo.reduce((s, c) => { const m = c.match(/(\d+)/); return s + (m ? +m[1] : 0); }, 0);
        t.igual(soma, +total[1], 'soma dos tipos de pendencia vs o total mostrado em "todos"');
      }
    },

    /* ----------------------------------------------------------------- (5b) */
    {
      id: 'planilha-pelo-botao-do-backup',
      titulo: 'as 3 portas "Planilha completa (Excel)" (Consulta, Relatório e Backup) baixam um .xlsx de verdade com o lancamento dentro',
      /* a cura (13/09): os botoes ligados ao gerador da planilha. O negativo faz o gerador sair sem gerar nada —
         o download nao vem e o caminho tem de reprovar. A planilha e ZIP sem compressao, entao a marca do
         lancamento aparece crua dentro do arquivo: da pra afirmar que ELE esta la sem abrir o Excel.
         As 3 portas, nao so a do Backup (revisor fiacao r2, L2: a da Consulta nao era vista por nada ligado).
         O Backup vai por ultimo: o modal dele cobre a tela inteira e ficaria na frente das outras portas. */
      negativo: { de: 'async function exportarPlanilha(){', para: 'async function exportarPlanilha(){return;' },
      limiteMs: 90000,
      async rodar(t) {
        const p = t.p;
        await esperarApp(p);
        const marca = 'PROVA-PLANILHA-' + String(Date.now()).slice(-6);
        await lancarCompra(p, marca, { valor: 25 });
        const portas = [
          ['Consulta', async () => { await irConsultar(p, 'Tudo'); }],
          ['Relatório', async () => { await clicar(p, 'Relatório', 'aba do rodape/cabecalho'); await p.waitForTimeout(400); }],
          ['Backup', async () => {
            await clicar(p, 'Painel'); await p.waitForTimeout(300);
            await clicar(p, 'backup · restaurar · exportar', 'acesso ao backup no Painel'); await p.waitForTimeout(400); }]
        ];
        for (const [porta, abrir] of portas) {
          await abrir();
          /* Promise.all e nao "espera solta": se o botao nao existir, o clicar reprova e a espera do download
             fica sem dono — rejeitada depois que a pagina fecha, derrubava o runner INTEIRO (visto no sandbox
             de 13/09: os caminhos seguintes nem rodaram). Com Promise.all a rejeicao tardia tem quem a receba. */
          let dl;
          try {
            [dl] = await Promise.all([
              p.waitForEvent('download', { timeout: 10000 }),
              clicar(p, 'Planilha completa (Excel)', 'botao da planilha na porta ' + porta)
            ]);
          } catch (e) {
            /* botao que nao existe ja reprova sozinho. Tempo esgotado e 'tocou e nao veio arquivo': ASSERCAO. Qualquer outro
               erro e da maquina e segue como erro — no modo negativo o runner nao pode contar pane do navegador como
               "reprovou sem a cura" (revisor fiacao r2, L1: antes todo erro virava reprova) */
            if (e && e.reprova) throw e;
            if (!e || e.name !== 'TimeoutError') throw e;
            t.reprova('porta ' + porta + ': tocar em "Planilha completa (Excel)" nao baixou nenhum arquivo em 10 s');
          }
          const buf = fs.readFileSync(await dl.path());
          t.ok(dl.suggestedFilename().slice(-5) === '.xlsx', 'porta ' + porta + ': o arquivo baixado nao termina em .xlsx: ' + dl.suggestedFilename());
          t.igual(buf.slice(0, 2).toString('latin1'), 'PK', 'porta ' + porta + ': o arquivo baixado nao e um .xlsx (zip)');
          t.ok(buf.length > 4000, 'porta ' + porta + ': o arquivo baixado tem so ' + buf.length + ' bytes');
          const txt = buf.toString('utf8');
          t.contem(txt, 'xl/worksheets/sheet2.xml', 'porta ' + porta + ': a planilha baixada nao tem a aba Compras');
          t.contem(txt, marca, 'porta ' + porta + ': o lancamento feito agora nao aparece dentro da planilha baixada');
        }
      }
    },

    /* ----------------------------------------------------------------- (5c) */
    {
      id: 'minhas-imagens-do-adicionar-ao-excluir',
      titulo: 'adicionei uma imagem MINHA pela testada: ela vira o topo, vira mascara de verdade, sobrevive a fechar e abrir o app, e inverter / renomear / trocar o arquivo / excluir funcionam',
      /* a cura: ao abrir o app, as imagens guardadas no aparelho sao lidas (aparCarregaMeus). O negativo tira essa leitura: depois de
         recarregar a testada volta para a imagem de fabrica e o caminho tem de reprovar. */
      negativo: { de: 'setTimeout(aparCarregaMeus,0);', para: '0;' },
      limiteMs: 90000,
      async rodar(t) {
        const p = t.p;
        await esperarApp(p);
        const f1 = { name: 'Meu_Desenho-1.png', mimeType: 'image/png', buffer: pngDesenho(200, 150) };

        /* 1) pela testada: o botao de enquadrar abre a folha e, nela, "+ Usar uma imagem minha" abre a janela de arquivos */
        await clicar(p, '✥', 'botao de enquadrar na testada');
        const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 8000 }), clicar(p, '+ Usar uma imagem minha', 'botao da folha do enquadramento')]);
        await chooser.setFiles(f1);
        await esperaOu(p, () => /blob:/.test((() => { const e = document.querySelector('.temaTopo .arte'); return e ? (getComputedStyle(e).webkitMaskImage || getComputedStyle(e).maskImage || '') : ''; })()), null,
          'depois de escolher o arquivo, a testada nao passou a usar a imagem escolhida (a mascara continua sendo a de fabrica)');
        const folha = await p.evaluate(() => (document.getElementById('modal') || {}).innerText || '');
        t.contem(folha.replace(/\s+/g, ' '), 'Imagem do topo: Meu Desenho 1', 'a folha do enquadramento mostra o nome da imagem em uso (o nome vem do arquivo, sem a extensao)');
        const e1 = await estatMascara(p);
        t.ok(!!e1, 'a imagem nao entrou na lista do aparelho');
        t.ok(e1.w === 200 && e1.h === 150, 'a imagem guardada perdeu as medidas (' + e1.w + 'x' + e1.h + ')');
        t.ok(e1.transparente > 0.5 && e1.opaco > 0.01 && e1.opaco < 0.5, 'a conversao nao virou mascara: opaco ' + e1.opaco.toFixed(3) + ' e transparente ' + e1.transparente.toFixed(3) + ' (o papel branco devia sumir e o traco ficar)');
        t.ok(e1.corMax <= 24, 'os pontos do traco nao ficaram pretos (cor mais clara entre os opacos: ' + e1.corMax + ')');
        let g = await guardadasNoAparelho(p);
        t.igual((g || []).length, 1, 'imagens guardadas no IndexedDB do aparelho depois de adicionar');
        await clicar(p, 'Pronto');

        /* 2) fechar e abrir o app: a imagem e a escolha continuam */
        await p.reload();
        await esperarApp(p);
        await esperaOu(p, () => /blob:/.test((() => { const e = document.querySelector('.temaTopo .arte'); return e ? (getComputedStyle(e).webkitMaskImage || getComputedStyle(e).maskImage || '') : ''; })()), null,
          'depois de fechar e abrir o app a testada voltou para a imagem de fabrica: a imagem minha nao foi lida do aparelho');
        g = await guardadasNoAparelho(p);
        t.igual((g || []).length, 1, 'imagens guardadas no aparelho depois de recarregar');

        /* 3) pela Aparencia (engrenagem da testada): a lista mostra a imagem e os controles de editar */
        await clicar(p, '⚙', 'engrenagem da testada');
        await p.waitForSelector('#aparFile', { state: 'attached', timeout: 5000 });
        const lista = await p.evaluate(() => ((document.getElementById('modal') || {}).innerText || '').replace(/\s+/g, ' ').toLowerCase());
        const nomes = await p.evaluate(() => [...document.querySelectorAll('[data-meu] input[type=text]')].map(i => i.value));
        t.contem(lista, 'minhas imagens', 'a tela de Aparencia tem a lista "Minhas imagens"');
        t.contem(lista, '1 de 12', 'o contador de imagens guardadas');
        t.igual(nomes.join('|'), 'Meu Desenho 1', 'a imagem aparece na lista com o nome do arquivo');

        /* inverter: o que era traco vira fundo (e de volta). O ponto de PAPEL e (100,0): a diagonal do desenho passa por (0,0), que e TRACO — e
           toda espera depois de um clique tem de estar FALSA antes dele (revisor 14/10: a espera pelo (0,0) ja era verdadeira antes do toque).
           A espera e um laco no runner (p.evaluate aguarda a promessa); predicado async no waitForFunction devolve uma Promise, que e sempre "verdadeira". */
        const PAPEL = [100, 0], TRACO = [0, 0];
        t.ok((await alfaDoPonto(p, PAPEL)) < 10 && (await alfaDoPonto(p, TRACO)) > 200, 'antes de inverter o ponto de papel devia ser transparente e o de traco opaco: ' + (await alfaDoPonto(p, PAPEL)) + '/' + (await alfaDoPonto(p, TRACO)));
        await clicar(p, '↔ Inverter', 'botao de inverter da imagem');
        await esperaAlfa(p, PAPEL, a => a > 200, 'depois de tocar em Inverter o papel nao ficou opaco (a imagem nao foi invertida)');
        t.ok((await alfaDoPonto(p, TRACO)) < 10, 'invertida, o ponto de traco devia ficar transparente');
        const e2 = await estatMascara(p);
        t.ok(e2.opaco > 0.5, 'invertida, a maior parte da imagem devia ser opaca; veio ' + e2.opaco.toFixed(3));
        t.igual(e2.id, e1.id, 'inverter nao pode trocar o id da imagem (as escolhas dos jogos apontam para ele)');
        await clicar(p, '↔ Inverter', 'botao de inverter da imagem');
        await esperaAlfa(p, PAPEL, a => a < 10, 'inverter duas vezes nao devolveu a imagem ao que era (o papel devia voltar a ser transparente)');
        t.ok((await alfaDoPonto(p, TRACO)) > 200, 'inverter duas vezes: o ponto de traco devia voltar a ser opaco');

        /* renomear: digitando no campo de nome da lista (o evento de mudanca vem quando o campo perde o foco) */
        await p.locator('[data-meu] input[type=text]').first().fill('Minha Mew');
        await p.keyboard.press('Tab');
        await esperaOu(p, () => Object.values(MEUS)[0] && Object.values(MEUS)[0].nome === 'Minha Mew', null, 'renomear nao atualizou o nome da imagem');
        g = await guardadasNoAparelho(p);
        t.igual((g || [])[0] && g[0].nome, 'Minha Mew', 'o novo nome tem de estar guardado no aparelho, nao so na tela');

        /* trocar o arquivo: mesma imagem (mesmo id e nome), outro arquivo (retrato 100x200) */
        const [chooser2] = await Promise.all([p.waitForEvent('filechooser', { timeout: 8000 }), clicar(p, '↺ Trocar arquivo', 'botao de trocar o arquivo')]);
        await chooser2.setFiles({ name: 'outro.png', mimeType: 'image/png', buffer: pngDesenho(100, 200) });
        await esperaOu(p, () => Object.values(MEUS)[0] && Object.values(MEUS)[0].w === 100, null, 'trocar o arquivo nao atualizou a imagem (as medidas continuam as do arquivo antigo)');
        const e3 = await estatMascara(p);
        t.igual(e3.id, e1.id, 'trocar o arquivo tem de manter o id da imagem');
        t.igual(e3.nome, 'Minha Mew', 'trocar o arquivo tem de manter o nome que a pessoa deu');
        t.ok(/blob:/.test(await mascaraDaTestada(p)), 'depois de trocar o arquivo a testada deixou de usar a imagem minha');

        /* 4) excluir: pergunta (aceita pelo runner), some da lista, da testada e do aparelho */
        await clicar(p, '🗑 Excluir', 'botao de excluir da imagem');
        await esperaOu(p, () => Object.keys(MEUS).length === 0, null, 'excluir nao tirou a imagem da lista');
        const aviso = (p.__dialogos || []).filter(d => d.tipo === 'confirm');
        t.aoMenos(1, aviso, 'pergunta de confirmacao antes de excluir');
        const depois = await mascaraDaTestada(p);
        t.ok(!/blob:/.test(depois) && /pokemon-mew-arejado/.test(depois), 'depois de excluir a testada tem de voltar para a imagem de fabrica; a mascara e: ' + depois.slice(0, 120));
        g = await guardadasNoAparelho(p);
        t.igual((g || []).length, 0, 'imagens guardadas no aparelho depois de excluir');
        await p.reload();
        await esperarApp(p);
        t.ok(!/blob:/.test(await mascaraDaTestada(p)), 'a imagem excluida voltou depois de fechar e abrir o app');
      }
    },

    /* ----------------------------------------------------------------- (5d) */
    {
      id: 'minhas-imagens-visiveis-no-celular',
      titulo: 'no celular (390x844) a intensidade e os botoes de imagem aparecem SEM rolar, na folha do enquadramento e na tela de Aparencia (e o de adicionar continua a vista com imagens na lista)',
      /* o Felype nao achou os controles ("nao vi onde ficou"): num celular a folha e baixa e o que fica abaixo da dobra nao existe para ele. O clique do
         runner rola ate o alvo e nao via isso. O negativo encolhe a folha do enquadramento para 14% da altura: nada cabe sem rolar e o caminho tem de reprovar. */
      negativo: { de: 'max-height:54vh;overflow:auto;box-shadow:0 -6px 18px rgba(0,0,0,.25)', para: 'max-height:14vh;overflow:auto;box-shadow:0 -6px 18px rgba(0,0,0,.25)' },
      limiteMs: 60000,
      async rodar(t) {
        const p = t.p;
        await p.setViewportSize({ width: 390, height: 844 });
        await p.reload();
        await esperarApp(p);
        const exige = async (f, oque) => { const r = await naVistaDaFolha(p, f); t.ok(r.achou, oque + ': ' + r.motivo); t.ok(r.dentro, oque + ' fica ESCONDIDO abaixo da dobra (topo ' + r.topo + ' / base ' + r.base + ' numa folha de ' + r.folha + ' px, conteudo de ' + r.conteudo + ' px)');  t.ok(r.livre !== false, oque + ' esta COBERTO por outro elemento no centro (' + r.cobertoPor + ') — o toque cairia nele (revisor 14/10: barra fixa por cima dos botoes)'); };

        /* 1) a folha do enquadramento (aberta pelo botao da testada) */
        await clicar(p, '✥', 'botao de enquadrar na testada');
        await exige({ id: 'apar_opTopo' }, 'a Intensidade na folha do enquadramento');
        await exige({ id: 'apar_trPainel' }, 'as Caixas translucidas na folha do enquadramento (revisor 14/10: ficavam abaixo da dobra)');
        await exige({ tag: 'label', texto: '+ Usar uma imagem minha' }, 'o botao "+ Usar uma imagem minha" na folha do enquadramento');
        await clicar(p, 'Pronto');

        /* 2) a tela de Aparencia (aberta pela engrenagem), sem imagens */
        await clicar(p, '⚙', 'engrenagem da testada');
        await exige({ id: 'apar_opTopo' }, 'a Intensidade do topo na tela de Aparencia');
        await exige({ tag: 'button', texto: '+ Novo jogo' }, 'o botao "+ Novo jogo" no alto da tela de Aparencia');
        await exige({ tag: 'label', texto: '+ Adicionar imagem' }, 'o botao "+ Adicionar imagem" na tela de Aparencia');

        /* 3) com uma imagem na lista o botao de adicionar continua a vista (fica ACIMA da lista) */
        const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 8000 }), clicar(p, '+ Adicionar imagem', 'botao de adicionar da tela de Aparencia')]);
        await chooser.setFiles({ name: 'Celular.png', mimeType: 'image/png', buffer: pngDesenho(200, 150) });
        await esperaOu(p, () => Object.keys(MEUS).length === 1, null, 'a imagem nao entrou na lista');
        await p.waitForSelector('[data-meu]', { timeout: 5000 });
        await exige({ tag: 'label', texto: '+ Adicionar imagem' }, 'o botao "+ Adicionar imagem" com uma imagem na lista');
        await exige({ id: 'apar_opTopo' }, 'a Intensidade do topo com uma imagem na lista');
      }
    },

    /* ----------------------------------------------------------------- (5e) */
    {
      id: 'minhas-imagens-duas-janelas',
      titulo: 'com DUAS janelas do app no mesmo aparelho: a outra e avisada quando eu adiciono/excluo, e editar numa janela que nao soube da exclusao NAO traz a imagem de volta',
      /* a cura: ler-e-mudar DENTRO da mesma transacao (aparDbAtualiza): imagem que sumiu devolve "sumiu" e nada e gravado. O negativo grava um registro
         vazio quando a imagem nao existe mais (o defeito do revisor de 14/10: renomear/inverter/trocar ressuscitava o excluido). */
      negativo: { de: 'if(!r)return;novo=fn(r)||r;st.put(novo);', para: 'novo=fn(r||{id:id})||r;st.put(novo);' },
      limiteMs: 90000,
      async rodar(t) {
        const a = t.p;
        await esperarApp(a);
        const ctx = a.context();
        const b = await ctx.newPage();
        b.on('dialog', d => d.accept().catch(() => {}));
        await b.goto(a.url(), { waitUntil: 'load' });
        await esperarApp(b);
        const noAr = (p, fn, msg, ms) => esperaOu(p, fn, null, msg, ms);
        const mascaraBlob = () => { const e = document.querySelector('.temaTopo .arte'); const cs = e ? getComputedStyle(e) : null; return !!cs && /blob:/.test(cs.webkitMaskImage || cs.maskImage || ''); };

        /* 1) adiciono na janela A; a B fica sabendo sem recarregar (lista e testada) */
        await clicar(a, '✥', 'botao de enquadrar na testada (janela A)');
        const [chooser] = await Promise.all([a.waitForEvent('filechooser', { timeout: 8000 }), clicar(a, '+ Usar uma imagem minha', 'botao da folha do enquadramento (janela A)')]);
        await chooser.setFiles({ name: 'Duas.png', mimeType: 'image/png', buffer: pngDesenho(200, 150) });
        await noAr(a, () => Object.keys(MEUS).length === 1, 'janela A: a imagem nao entrou');
        await noAr(b, () => Object.keys(MEUS).length === 1, 'janela B NAO foi avisada da imagem nova (a lista dela continua vazia)', 6000);
        await noAr(b, mascaraBlob, 'janela B nao passou a mostrar a imagem escolhida na janela A (a testada continua a de fabrica)', 6000);
        await clicar(a, 'Pronto');

        /* 2) a B para de ouvir (simula a mensagem perdida / janela dormindo) e a A exclui */
        await b.evaluate(() => { try { if (_aparCanal) { _aparCanal.close(); _aparCanal = null; } window.removeEventListener('storage', aparNoStorage); } catch (e) {} });
        await clicar(a, '⚙', 'engrenagem da testada (janela A)');
        await clicar(a, '🗑 Excluir', 'botao de excluir (janela A)');
        await noAr(a, () => Object.keys(MEUS).length === 0, 'janela A: a imagem nao foi excluida');
        let g = await guardadasNoAparelho(a);
        t.igual((g || []).length, 0, 'imagens guardadas no aparelho depois de a janela A excluir');
        t.igual(await b.evaluate(() => Object.keys(MEUS).length), 1, 'a janela B (que parou de ouvir) devia ainda achar que a imagem existe — o cenario da janela desatualizada');

        /* 3) a B, desatualizada, tenta RENOMEAR a imagem que nao existe mais: nao pode ressuscitar */
        await clicar(b, '⚙', 'engrenagem da testada (janela B)');
        await b.waitForSelector('[data-meu] input[type=text]', { timeout: 5000 });
        await b.locator('[data-meu] input[type=text]').first().fill('Fantasma');
        await b.keyboard.press('Tab');
        await noAr(b, () => /exclu/i.test((document.getElementById('toast') || {}).textContent || '') || Object.keys(MEUS).length === 0, 'a janela B nao avisou que a imagem foi excluida em outra janela', 6000);
        await noAr(b, () => Object.keys(MEUS).length === 0, 'a janela B nao releu a lista do aparelho depois do aviso (a imagem excluida continua nela)', 6000);
        g = await guardadasNoAparelho(a);
        t.igual((g || []).length, 0, 'a imagem excluida na janela A VOLTOU ao aparelho quando a janela B tentou renomea-la (ressuscitou)');
        await b.close();
      }
    },

    /* ----------------------------------------------------------------- (5f) */
    {
      id: 'minhas-imagens-recusa-foto-enorme',
      titulo: 'uma imagem de mais de 50 megapixels e RECUSADA com aviso, antes de decodificar (nao trava a aba e nao entra na lista)',
      /* a cura: teto de megapixels antes do desenho no canvas (o revisor mediu +1,5 GB de memoria num PNG de 400 MP com 416 KB). O negativo tira o teto: o
         navegador decodifica os 52 MP, a imagem entra na lista e o aviso nunca aparece. */
      negativo: { de: "if(w0*h0>APAR_MAX_PIXELS){cb(new Error('grande'));return;}", para: '' },
      limiteMs: 90000,
      async rodar(t) {
        const p = t.p;
        await esperarApp(p);
        await clicar(p, '✥', 'botao de enquadrar na testada');
        const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 8000 }), clicar(p, '+ Usar uma imagem minha', 'botao da folha do enquadramento')]);
        await chooser.setFiles({ name: 'Enorme.png', mimeType: 'image/png', buffer: pngBranco(7200, 7200) });
        await esperaOu(p, () => /megapixels/.test((document.getElementById('toast') || {}).textContent || ''), null,
          'a imagem de 51,8 megapixels nao foi recusada com o aviso de tamanho', 20000);
        t.igual(await p.evaluate(() => Object.keys(MEUS).length), 0, 'imagens na lista depois de recusar a enorme');
        const g = await guardadasNoAparelho(p);
        t.igual((g || []).length, 0, 'imagens guardadas no aparelho depois de recusar a enorme');
        /* e o app continua vivo: uma imagem normal entra logo depois */
        const [chooser2] = await Promise.all([p.waitForEvent('filechooser', { timeout: 8000 }), clicar(p, '+ Usar uma imagem minha', 'botao da folha do enquadramento')]);
        await chooser2.setFiles({ name: 'Normal.png', mimeType: 'image/png', buffer: pngDesenho(200, 150) });
        await esperaOu(p, () => Object.keys(MEUS).length === 1, null, 'depois de recusar a enorme, uma imagem normal nao entrou (o app travou?)', 10000);
      }
    },

    /* ----------------------------------------------------------------- (5g) */
    {
      id: 'jogos-criar-editar-excluir',
      titulo: 'a testada em 2 toques e jogos NOVOS: fechada so "A" e "✥"; desligando o padrao aparece a grade; criei "Lorcana" pelo "+", ele vira o tema, sobrevive a fechar e abrir o app, editei o nome e exclui',
      /* a cura de excluir: o jogo sai de APAR.jogos (e com ele as escolhas e o tema fixo). O negativo tira essa linha: depois de excluir o jogo continua na lista. */
      negativo: { de: 'delete jogos[id];', para: '' },
      limiteMs: 90000,
      async rodar(t) {
        const p = t.p;
        await p.setViewportSize({ width: 390, height: 844 });
        await p.reload();
        await esperarApp(p);
        const bolinhas = () => p.evaluate(() => [...document.querySelectorAll('.temaTopo .ttb')].map(b => b.innerText.trim()));
        const grade = () => p.evaluate(() => [...document.querySelectorAll('.ttGrade .ttb')].map(b => b.innerText.trim()));
        const legenda = () => p.evaluate(() => (document.querySelector('.ttModo') || {}).innerText || '');
        const nomeNaFaixa = () => p.evaluate(() => (document.querySelector('.temaTopo .tt b') || {}).innerText || '');
        const guardado = () => p.evaluate(() => JSON.parse(localStorage.getItem('tcg_aparencia') || '{}'));

        /* 1) fechada: so "A" (padrao) e "✥" (editar); a grade NAO aparece */
        t.igual((await bolinhas()).join('|'), 'A|✥', 'bolinhas da testada com o padrao ligado');
        t.igual((await grade()).length, 0, 'bolinhas na grade com o padrao ligado');
        t.contem(await legenda(), 'Padrão ligado', 'legenda da testada com o padrao ligado');

        /* 2) desligar o padrao: a grade com a inicial de cada jogo aparece */
        await clicar(p, 'A', 'bolinha do padrao na testada');
        await esperaOu(p, () => document.querySelectorAll('.ttGrade .ttb').length >= 8, null, 'a grade de jogos nao apareceu ao desligar o padrao');
        t.igual((await grade()).join('|'), 'P|O|D|Y|★|🔀|⏱|+', 'bolinhas da grade (jogos de fabrica, visao geral, modos e "+")');
        t.contem(await legenda(), 'Padrão desligado', 'legenda com o padrao desligado');
        await p.locator('.ttGrade button', { hasText: 'O' }).first().click();
        await esperaOu(p, () => (document.querySelector('.temaTopo .tt b') || {}).innerText === 'One Piece', null, 'um toque na bolinha O nao trocou o tema para One Piece');

        /* 3) criar um jogo pelo "+" da grade */
        await p.locator('.ttGrade button[aria-label^="Novo jogo"]').click();
        await p.waitForSelector('#aparJ_nome', { timeout: 5000 });
        await p.locator('#aparJ_nome').fill('Lorcana');
        await p.locator('#aparJ_cor').fill('#2e86c1');
        await clicar(p, 'Criar jogo');
        await esperaOu(p, () => (document.querySelector('.temaTopo .tt b') || {}).innerText === 'Lorcana', null, 'depois de criar o jogo a testada nao passou a ser a do Lorcana');
        t.contem((await grade()).join('|'), 'L', 'a bolinha L do jogo criado na grade');
        t.igual(await p.evaluate(() => (document.querySelector('.ttLetra') || {}).innerText), 'L', 'a inicial grande da faixa do jogo sem imagem');
        let g = await guardado();
        t.igual(Object.values(g.jogos || {}).map(j => j.nome).join('|'), 'Lorcana', 'jogos guardados no aparelho depois de criar');
        t.igual(Object.values(g.jogos)[0].cor, '#2e86c1', 'a cor escolhida foi guardada');
        t.ok(await p.evaluate(() => document.querySelector('.ttGrade').getBoundingClientRect().height < 50), 'com 1 jogo criado a grade tem de caber numa linha so no celular de 390 px (antes quebrava em 2 e a faixa crescia)');
        t.igual(await p.evaluate(() => temaChave('Lorcana Illumineers')), Object.keys(g.jogos)[0], 'o filtro "Lorcana Illumineers" casa com o jogo criado (leitura direta da regra de casamento)');

        /* 4) fechar e abrir o app: o jogo continua e o tema tambem */
        await p.reload();
        await esperarApp(p);
        t.igual(await nomeNaFaixa(), 'Lorcana', 'depois de recarregar a testada continua a do Lorcana');

        /* 5) a tela de Aparencia: atalho "+ Novo jogo" no alto, a fileira de jogos e o painel do jogo criado (so ver) */
        await clicar(p, '⚙', 'engrenagem da testada');
        await p.waitForSelector('.jogosChips', { timeout: 5000 });
        const chips = await p.evaluate(() => [...document.querySelectorAll('.jogosChips .ttb')].map(b => b.innerText.trim()));
        t.igual(chips.join('|'), 'P|O|D|Y|L|★|+', 'bolinhas de jogos na Aparencia (nenhuma aberta)');
        t.igual(await p.evaluate(() => document.querySelectorAll('#modal select').length), 6, 'listas na Aparencia com nenhum jogo aberto (as imagens de cada jogo ficam minimizadas)');
        t.contem(await p.evaluate(() => document.querySelector('#modal').innerText), '+ Novo jogo', 'atalho "+ Novo jogo" no alto da Aparencia');
        await p.locator('.jogosChips button', { hasText: 'L' }).first().click();
        await p.waitForSelector('#aparT_' + Object.keys(g.jogos)[0], { timeout: 5000 });
        t.contem(await p.evaluate(() => document.querySelector('#modal').innerText), 'jogo criado por você', 'o painel do jogo criado diz que ele e seu');
        await clicar(p, 'Fechar');
        await clicar(p, '⚙', 'engrenagem da testada');
        await p.waitForSelector('.jogosChips', { timeout: 5000 });
        t.igual(await p.evaluate(() => document.querySelectorAll('#modal select').length), 6, 'reabrir a Aparencia pelo engrenagem fecha o painel do jogo que estava aberto (6 listas)');
        await clicar(p, 'Fechar');

        /* 6) editar e excluir pela folha de EDITAR O TEMA (✥ da testada): onde o jogo se cria, tambem se edita e se exclui */
        await clicar(p, '✥', 'bolinha de editar a testada');
        await p.waitForSelector('#aparEnq', { timeout: 5000 });
        t.contem(await p.evaluate(() => document.querySelector('#modal').innerText), 'sem imagem', 'a folha do jogo criado sem imagem avisa que nao ha o que ajustar');
        const pronto = await p.evaluate(() => { const b = [...document.querySelectorAll('#modal button')].find(x => x.innerText.trim() === 'Pronto'); if (!b) return null; const r = b.getBoundingClientRect(); return { topo: Math.round(r.top), base: Math.round(r.bottom), alt: window.innerHeight }; });
        t.ok(pronto && pronto.topo >= 0 && pronto.base <= pronto.alt, 'o botao "Pronto" da folha do jogo criado tem de estar a vista, sem rolar a folha, no celular de 390x844 (revisor 14/10: ficava abaixo da tela): ' + JSON.stringify(pronto));
        await clicar(p, '✎ Editar nome e cor');
        await p.waitForSelector('#aparJ_nome', { timeout: 5000 });
        t.igual(await p.locator('#aparJ_nome').inputValue(), 'Lorcana', 'a janela de editar traz o nome guardado');
        await p.locator('#aparJ_nome').fill('Lorcana TCG');
        await clicar(p, 'Salvar');
        await esperaOu(p, () => (document.querySelector('.temaTopo .tt b') || {}).innerText === 'Lorcana TCG', null, 'o nome novo nao apareceu na testada');
        g = await guardado();
        t.igual(Object.values(g.jogos)[0].nome, 'Lorcana TCG', 'o nome editado foi guardado');
        await clicar(p, '✥', 'bolinha de editar a testada');
        await p.waitForSelector('#aparEnq', { timeout: 5000 });
        await clicar(p, '🗑 Excluir jogo');
        await esperaOu(p, () => (document.querySelector('.temaTopo .tt b') || {}).innerText === 'Pokémon', null, 'depois de excluir o jogo em uso o tema nao voltou ao Pokemon');
        t.aoMenos(1, (p.__dialogos || []).filter(d => d.tipo === 'confirm'), 'pergunta de confirmacao antes de excluir o jogo');
        g = await guardado();
        t.igual(Object.keys(g.jogos || {}).length, 0, 'jogos guardados no aparelho depois de excluir');
        await p.reload();
        await esperarApp(p);
        t.igual(await p.evaluate(() => document.querySelectorAll('.ttGrade .ttb').length > 0 ? [...document.querySelectorAll('.ttGrade .ttb')].map(b => b.innerText.trim()).join('') : ''), 'PODY★🔀⏱+', 'a grade depois de recarregar nao tem mais o L');

        /* 7) ligar o padrao de novo: a grade some */
        await clicar(p, 'A', 'bolinha do padrao na testada');
        await esperaOu(p, () => document.querySelectorAll('.ttGrade').length === 0, null, 'a grade nao sumiu ao ligar o padrao');
        t.contem(await legenda(), 'Padrão ligado', 'legenda com o padrao ligado de novo');
      }
    },

    /* ----------------------------------------------------------------- (5g2) */
    {
      id: 'padrao-religado-devolve-o-tema-sem-filtro',
      titulo: 'com o padrao ligado criei "Magic" pelo "+ Novo jogo" da Aparencia (ele vira o tema); apertei o "A" para religar o padrao e a testada VOLTOU ao Pokemon (o tema de quando nao ha filtro), nao ficou no Magic',
      /* a cura: sair do automatico GUARDA o tema "sem filtro" (padraoSem) em qualquer porta, nao so no botao A. O negativo tira essa guarda: religar fica no jogo recem-criado. */
      negativo: { de: 'if(sai){p.padraoSem=A.temaFixo;p.temaFixo=fixo||temaAtual();}', para: 'if(sai){p.temaFixo=fixo||temaAtual();}' },
      limiteMs: 60000,
      async rodar(t) {
        const p = t.p;
        await esperarApp(p);
        const nomeNaFaixa = () => p.evaluate(() => (document.querySelector('.temaTopo .tt b') || {}).innerText || '');
        const legenda = () => p.evaluate(() => (document.querySelector('.ttModo') || {}).innerText || '');
        t.igual(await nomeNaFaixa(), 'Pokémon', 'no comeco, sem filtro de jogo, a testada e a do Pokemon');
        await clicar(p, '⚙', 'engrenagem da testada');
        await p.waitForSelector('.jogosChips', { timeout: 5000 });
        await p.locator('#modal button', { hasText: '+ Novo jogo' }).first().click();
        await p.waitForSelector('#aparJ_nome', { timeout: 5000 });
        await p.locator('#aparJ_nome').fill('Magic');
        await clicar(p, 'Criar jogo');
        await esperaOu(p, () => (document.querySelector('.temaTopo .tt b') || {}).innerText === 'Magic', null, 'depois de criar o jogo a testada nao passou a ser a do Magic');
        await p.waitForSelector('.jogosChips', { timeout: 5000 });
        await clicar(p, 'Fechar');
        t.contem(await legenda(), 'Padrão desligado', 'criar um jogo com o padrao ligado desliga o padrao (o jogo vira o tema fixo)');
        await clicar(p, 'A', 'bolinha do padrao na testada');
        await esperaOu(p, () => document.querySelectorAll('.ttGrade').length === 0, null, 'a grade nao sumiu ao religar o padrao');
        await esperaOu(p, () => (document.querySelector('.temaTopo .tt b') || {}).innerText === 'Pokémon', null, 'ao religar o padrao a testada nao voltou ao Pokemon (ficou no jogo recem-criado)');
        t.contem(await legenda(), 'Padrão ligado', 'legenda com o padrao ligado de novo');
      }
    },

    /* ----------------------------------------------------------------- (5h) */
    {
      id: 'caixas-translucidas-por-tela',
      titulo: 'as CAIXAS ficam mais ou menos translucidas (so o fundo da caixa, nao as letras), com um nivel para o Painel e OUTRO para as demais telas, e o ajuste sobrevive a fechar e abrir o app',
      /* a cura: --caixa vem do nivel DA TELA em que a pessoa esta. O negativo fixa 90% sempre: o ajuste nao muda nada e o caminho tem de reprovar. */
      negativo: { de: "root.style.setProperty('--caixa',(100-(tela==='painel'?APAR.trPainel:APAR.trOutras))+'%');", para: "root.style.setProperty('--caixa','90%');" },
      limiteMs: 60000,
      async rodar(t) {
        const p = t.p;
        await esperarApp(p);
        await lancarCompra(p, 'PROVA-CAIXAS', { valor: 40 });
        const alfaCaixa = (sel) => p.evaluate((sel) => {
          const c = [...document.querySelectorAll(sel)].find(e => e.getBoundingClientRect().height > 20); if (!c) return { semCaixa: true, alfa: -1, opacidade: '', corLetra: '' };
          const cs = getComputedStyle(c), m = /\/\s*([0-9.]+)\s*\)/.exec(cs.backgroundColor);
          const filho = [...c.querySelectorAll('*')].find(e => (e.innerText || '').trim().length > 2 && e.children.length === 0);
          return { alfa: m ? +m[1] : 1, opacidade: cs.opacity, corLetra: filho ? getComputedStyle(filho).color : '', fundoNoCorpo: document.body.classList.contains('comFundoTema') };
        }, sel || '#view .card, #view .mini:not([style*="sticky"])');
        const ajusta = (campo, v) => p.evaluate(([c, x]) => { const i = document.getElementById('apar_' + c); i.value = x; i.dispatchEvent(new Event('input', { bubbles: true })); }, [campo, v]);
        const perto = (a, b) => Math.abs(a - b) < 0.03;

        /* 1) Painel: padrao (10% transparente = 90% de cor) */
        await clicar(p, 'Painel', 'aba do rodape/cabecalho'); await p.waitForTimeout(350);
        const p0 = await alfaCaixa();
        t.ok(p0 && p0.fundoNoCorpo, 'o fundo do tema precisa estar ligado para a caixa ser translucida (padrao)');
        t.ok(perto(p0.alfa, 0.9), 'a caixa do Painel por padrao devia ter 90% de cor; veio ' + p0.alfa);

        /* 2) pela folha de editar o tema, no Painel: 50% */
        await clicar(p, '✥', 'bolinha de editar a testada');
        await p.waitForSelector('#apar_trPainel', { timeout: 5000 });
        await ajusta('trPainel', 50);
        await p.waitForTimeout(200);
        const p1 = await alfaCaixa();
        t.ok(perto(p1.alfa, 0.5), 'com 50% de transparencia a caixa do Painel devia ficar com 50% de cor; veio ' + p1.alfa);
        t.igual(p1.opacidade, '1', 'a opacidade do elemento nao pode mudar (so o fundo da caixa fica translucido, nao as letras)');
        t.igual(p1.corLetra, p0.corLetra, 'a cor das letras da caixa nao pode mudar');
        await clicar(p, 'Pronto');

        /* 3) outra tela tem o nivel dela, separado */
        await irConsultar(p, 'Tudo'); await p.waitForTimeout(350);
        const c0 = await alfaCaixa('#view .item');
        t.ok(c0 && !c0.semCaixa, 'a lista da Consulta precisa ter pelo menos um item (a lista de lancamentos e feita de .item, que tambem e caixa)');
        t.ok(c0 && perto(c0.alfa, 0.9), 'na Consulta o item da lista devia continuar com 90% de cor (o nivel do Painel nao vale ali); veio ' + (c0 && c0.alfa));
        await clicar(p, '✥', 'bolinha de editar a testada');
        await p.waitForSelector('#apar_trOutras', { timeout: 5000 });
        t.igual(await p.evaluate(() => !!document.getElementById('apar_trPainel')), false, 'na Consulta a folha nao pode mostrar o controle do Painel');
        await ajusta('trOutras', 20);
        await p.waitForTimeout(200);
        const c1 = await alfaCaixa('#view .item');
        t.ok(perto(c1.alfa, 0.8), 'com 20% de transparencia o item da lista da Consulta devia ficar com 80% de cor (a lista tambem e caixa); veio ' + c1.alfa);
        await clicar(p, 'Pronto');

        /* 4) voltar ao Painel: o nivel do Painel (50%) continua, e sobrevive a recarregar */
        await clicar(p, 'Painel', 'aba do rodape/cabecalho'); await p.waitForTimeout(350);
        t.ok(perto((await alfaCaixa()).alfa, 0.5), 'ao voltar ao Painel a caixa devia estar com 50% de cor');
        await p.reload();
        await esperarApp(p);
        await clicar(p, 'Painel', 'aba do rodape/cabecalho'); await p.waitForTimeout(350);
        t.ok(perto((await alfaCaixa()).alfa, 0.5), 'depois de recarregar a caixa do Painel devia continuar com 50% de cor');
      }
    },

    /* ------------------------------------------------------------------ (6) */
    {
      id: 'nenhum-controle-sumiu-da-tela',
      titulo: 'os controles visiveis de cada tela batem com a versao anterior',
      /* a cura aqui e a propria memoria: a lista do que existia. O negativo
         esconde um controle real e o inventario tem de acusar. */
      /* o negativo apaga um controle REAL do Painel (o acesso a backup /
         restaurar / exportar) — o tipo de sumico que ninguem percebe ate
         precisar dele. Se o inventario nao acusar, ele nao serve pra nada. */
      negativo: { de: 'onclick="abrirBackup()">💾 backup · restaurar · exportar', para: 'onclick="abrirBackup()" style="display:none">💾 backup · restaurar · exportar' },
      limiteMs: 45000,
      async rodar(t) {
        const p = t.p;
        await esperarApp(p);
        /* app vazio esconde metade dos controles (as telas viram "nada lancado
           ainda"). Um lancamento sintetico abre o Painel, a Consultar e o Fluxo
           de verdade — e o inventario passa a cobrir o que o dono usa. */
        await lancarCompra(p, 'PROVA-CONTROLES', { valor: 25 });
        const agora = await varrerControles(p);

        for (const tela of TELAS_VARRIDAS) {
          t.aoMenos(3, agora[tela], `controles visiveis na tela "${tela}" (tela em branco nao prova nada)`);
        }

        if (!fs.existsSync(BASE_CONTROLES)) {
          fs.writeFileSync(BASE_CONTROLES, JSON.stringify(agora, null, 1), 'utf8');
          t.reprova('nao existia inventario anterior — acabei de gravar caminhos-controles.json. ' +
            'Confira e commite: a partir da proxima rodada, controle que sumir e barrado.');
        }
        /* o inventario gravado passa pela MESMA normalizacao da tela antes de comparar (revisor fiacao r2, M2) */
        const antesCru = JSON.parse(fs.readFileSync(BASE_CONTROLES, 'utf8')), antes = {};
        for (const tela of Object.keys(antesCru)) antes[tela] = [...new Set((antesCru[tela] || []).map(normControle))];
        const sumidos = [], novos = [];
        for (const tela of TELAS_VARRIDAS) {
          const a = new Set(antes[tela] || []), b = new Set(agora[tela] || []);
          (antes[tela] || []).forEach(c => { if (!b.has(c)) sumidos.push(tela + ' » ' + c); });
          (agora[tela] || []).forEach(c => { if (!a.has(c)) novos.push(tela + ' » ' + c); });
        }
        if (novos.length) console.log('            (controles NOVOS, so aviso: ' + novos.slice(0, 6).join(' · ') + (novos.length > 6 ? ' …' : '') + ')');
        t.ok(sumidos.length === 0,
          `${sumidos.length} controle(s) sumiram da tela sem ninguem pedir: ${sumidos.slice(0, 6).join(' · ')}` +
          '\n            Se a remocao foi de proposito, apague caminhos-controles.json, rode de novo e commite o inventario novo.');
      }
    }

  ]
};
