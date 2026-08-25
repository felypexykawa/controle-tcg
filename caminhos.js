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
     provar as travas (mensal, ou ao mexer num caminho):
              ...\provar-caminhos.js ...\caminhos.js --negativo
              (roda cada caminho COM A CURA REMOVIDA e exige que ele reprove)

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
  const el = await achar(p, texto, dica);
  await centralizar(el, p);
  await el.click({ force: true });
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

/* ------------------------------------------------------------------ caminhos */
const BASE_CONTROLES = path.join(__dirname, 'caminhos-controles.json');
const TELAS_VARRIDAS = ['Painel', 'Consultar', 'Fluxo de caixa', 'Relatório', 'Simular', 'Lançar'];

async function varrerControles(p) {
  const mapa = {};
  for (const tela of TELAS_VARRIDAS) {
    await clicar(p, tela, 'aba do rodape/cabecalho');
    await p.waitForTimeout(350);
    mapa[tela] = await p.evaluate(() => {
      const visivel = e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
      const set = new Set();
      document.querySelectorAll('button,select,input,[onclick]').forEach(e => {
        if (!visivel(e)) return;
        const tag = e.tagName.toLowerCase();
        let rot = (tag === 'input' || tag === 'select')
          ? (e.id || e.getAttribute('placeholder') || '')
          : (e.innerText || '').replace(/\s+/g, ' ').trim();
        rot = rot.replace(/\d+/g, '#').trim().slice(0, 60);
        if (rot) set.add(tag + ':' + rot);
      });
      return [...set].sort();
    });
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
      negativo: { de: 'function estaExcluido(id){return !!(id&&excluidos[id]);}', para: 'function estaExcluido(id){return false;}' },
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
        const antes = JSON.parse(fs.readFileSync(BASE_CONTROLES, 'utf8'));
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
