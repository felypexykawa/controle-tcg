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
 *    [DUAS rodadas adversariais moldaram isto, ambas em 2026-08-20. A 1a furou a versao
 *     inicial: 3 das 5 capacidades so eram conferidas por texto, e um comentario mencionando
 *     o nome da funcao apagada fazia o check passar VERDE. A 2a furou a correcao: as funcoes
 *     passaram a ser exercitadas, mas em TUBO DE ENSAIO — quebrar `precoLigaDe` (o funil real
 *     cadastro->preco) reproduzia o dano exato do incidente, 17 cartas -> 0, e passava verde,
 *     porque o dublê substituia justamente a peca quebrada. Dai nasceu a 1a capacidade da
 *     lista: caminho INTEIRO contra o precos.json e o codigos.txt REAIS, sem dublê.]
 *  - RESIDUAL DECLARADO (o que esta pagina NAO cobre, para ninguem confundir com garantia):
 *    (a) "esta ligado na tela" e conferido por ATRIBUTO no HTML (`onclick="abrirPendencias()"`),
 *        que ainda e texto — mais dificil de forjar sem querer que uma mencao ao nome, porem
 *        nao e execucao. Provar de verdade exigiria renderizar as telas, que e outra ordem de
 *        trabalho. (b) Onde ha dublê, o que o dublê fornece nao esta sendo testado — as
 *        fixtures tem caso NEGATIVO justamente pra reduzir isso, mas nao elimina.
 *        (c) Capacidades fora das 6 listadas nao sao cobertas por ninguem.
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
const path = require('path');
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
  /* aceita as MESMAS formas que `definida()` aceita — declaracao, `const f = function`,
     `const f = (a)=>{...}`. A versao anterior so entendia `function nome(`, entao trocar uma
     declaracao por arrow (refatoracao que nao muda comportamento nenhum) fazia a trava
     BARRAR o commit dizendo que nao conseguiu exercitar. Trava que barra formatacao ensina
     a usar --no-verify, e ai ela nao protege mais nada. */
  let ini = src.indexOf('function ' + nome + '(');
  let prefixo = '';
  if (ini < 0) {
    const m = new RegExp('\\b(?:const|let|var)\\s+' + nome + '\\s*=\\s*(?:async\\s*)?(?:function\\s*\\*?\\s*\\(|\\(|[A-Za-z_$][\\w$]*\\s*=>)').exec(src);
    if (!m) return null;
    ini = m.index;
    prefixo = '';                           // `const nome = ...` ja e declaracao valida; prefixar gerava "var const"
  }
  let i = src.indexOf('{', ini), nivel = 0, anterior = '';
  if (i < 0) return null;
  const corpoArrowSemChaves = () => {
    /* `const f = x => expr;` — sem chaves: pega ate o ; ou fim de linha */
    const seta = src.indexOf('=>', ini);
    if (seta < 0 || (i >= 0 && i < seta)) return null;
    let k = seta + 2;
    while (k < src.length && /\s/.test(src[k])) k++;
    if (src[k] === '{') return null;
    const fim = src.indexOf(';', k);
    return fim < 0 ? null : prefixo + src.slice(ini, fim + 1);
  };
  const semChaves = corpoArrowSemChaves();
  if (semChaves) return semChaves;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = fimLiteral(src, i, c); anterior = 'x'; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return null; continue; }
    if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); if (f < 0) return null; i = f + 1; continue; }
    if (c === '/' && podeIniciarRegex(anterior)) { i = fimRegex(src, i); anterior = 'x'; continue; }
    if (c === '{') nivel++;
    else if (c === '}') { nivel--; if (nivel === 0) { const corpo = src.slice(ini, i + 1); return prefixo + corpo + (prefixo ? ';' : ''); } }
    if (!/\s/.test(c)) anterior = c;
  }
  return null;
}
function fimLiteral(src, i, aspa) {
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === aspa) return j;
    /* dentro de `${ ... }` de template: contar chaves PULANDO strings — senao um '}' escrito
       dentro de aspas fecha a expressao cedo, o fim do template se perde e o scanner copia
       verbatim ate a proxima crase, arrastando comentarios junto (furo achado na revisao
       adversarial de 2026-08-20: 8 sobras de comentario no arquivo de producao) */
    if (aspa === '`' && src[j] === '$' && src[j + 1] === '{') {
      let n = 1; j += 2; let ant = '(';
      for (; j < src.length && n > 0; j++) {
        const c = src[j];
        if (c === '\\') { j++; continue; }
        if (c === '"' || c === "'" || c === '`') { j = fimLiteral(src, j, c); ant = 'x'; continue; }
        /* regex DENTRO da expressao: `${s.replace(/'/g,"x")}` tem uma aspa dentro da regex —
           sem tratar isso, o scanner a le como abertura de string e sai de sincronia pro resto
           do arquivo. MEDIDO no index.html real: pular strings sem pular regex levou as sobras
           de comentario de 8 para 148, ou seja, "corrigir" pela metade e pior que nao mexer. */
        if (c === '/' && src[j + 1] === '/') { const f = src.indexOf('\n', j); j = f < 0 ? src.length : f; continue; }
        if (c === '/' && src[j + 1] === '*') { const f = src.indexOf('*/', j + 2); j = f < 0 ? src.length : f + 1; continue; }
        if (c === '/' && podeIniciarRegex(ant)) { j = fimRegex(src, j); ant = 'x'; continue; }
        if (c === '{') n++; else if (c === '}') n--;
        if (!/\s/.test(c)) ant = c;
      }
      j--;
    }
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
    /* A capacidade MAIS IMPORTANTE: o caminho INTEIRO cadastro -> preco na tela, contra os
       arquivos REAIS do repo (precos.json + robo/codigos.txt), sem dublê nenhum no meio.
       Nasceu do 2o reataque adversarial (2026-08-20): quebrar `precoLigaDe` reproduzia o dano
       exato do incidente fundador (17 cartas -> 0) e a vacina passava VERDE, porque as outras
       capacidades testavam `codLimpo` em tubo de ensaio e substituiam `precoLigaDe` por dublê.
       Testar o ingrediente nao prova a receita. */
    nome: 'cadastro chega no preco (caminho inteiro, arquivos reais)',
    perde: 'o funil que liga o codigo do cadastro a ficha de preco — e o dano e invisivel: o preco existe no arquivo, coletado, e simplesmente nao aparece na tela. Foi assim em 19/08 com 17 cartas',
    precisa: ['normCod', 'codLimpo', 'idxLigaNorm', 'precoLigaDe'],
    contexto: () => {
      /* procura os arquivos de dados ao lado do alvo E na pasta atual. O pre-commit confere
         uma COPIA do index.html numa pasta temporaria (pra ver a versao do indice, nao a do
         disco) — ali nao ha precos.json nenhum, e sem esta segunda tentativa o fail-closed
         barraria TODO commit. Pego ao testar o transporte real, antes de publicar. */
      const perto = f => {
        for (const base of [path.dirname(alvo) || '.', '.']) {
          const p = path.join(base, ...f);
          try { return fs.readFileSync(p, 'utf8'); } catch (e) {}
        }
        return null;
      };
      let precos = null, cadastros = [];
      try { precos = JSON.parse(perto(['precos.json'])); } catch (e) {}
      const txt = perto(['robo', 'codigos.txt']);
      if (txt) cadastros = txt.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
      return { _precosLiga: precos, _idxLigaNorm: null, _idxLigaFonte: null, _cadastros: cadastros };
    },
    exercicio: (F, ctx) => {
      /* dado que falta nao e codigo quebrado: o robo/codigos.txt e regerado do estoque e o
         precos.json a cada coleta. Uma coleta vazia NAO pode barrar commit de codigo com a
         manchete "o app perdeu capacidade" — vira aviso. (Prefixo DADOS: e o combinado com
         o motor la embaixo.) */
      if (!ctx._precosLiga || !ctx._precosLiga.cartas || !ctx._cadastros.length)
        throw new Error('DADOS: sem precos.json/codigos.txt utilizaveis — nao deu pra conferir o caminho do preco com os dados de hoje');
      const cartas = ctx._precosLiga.cartas;
      /* REGUA INDEPENDENTE: o codigo esperado sai daqui, NAO do codLimpo do app. Usar o
         codLimpo do proprio arquivo como verdade-chao era circular — apertar a regex dele
         (ex.: passar a exigir barra dentro dos parenteses) fazia o cadastro sumir da conta
         em vez de virar orfao, e 3 cartas reais deixavam de achar preco com a vacina verde
         (furo Q1 do 3o reataque adversarial, 2026-08-20). */
      const codRef = linha => {
        const t = String(linha).replace(/♾️?/g, '∞').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
        const p1 = t.match(/\(([^()]+)\)\s*$/);
        if (p1) return p1[1].trim();
        /* so conta como codigo solto o ultimo token que PARECE codigo (tem barra). Sem esta
           guarda a regua "corrigia" cadastro truncado ou sem codigo — `Mew (052`, `ST 14`,
           `Mega greninja ex` — e acusava o app de divergir onde ele esta certo. */
        const p2 = t.match(/\s([^\s]+\/[^\s]+)$/);
        return p2 ? p2[1] : t;
      };
      let soltos = 0, soltosResolvidos = 0, orfaos = [], divergiu = [];
      for (const linha of ctx._cadastros) {
        const ehSolto = !/\([^()]+\)\s*$/.test(linha) && /\s[^\s]+\/[^\s]+$/.test(linha);
        const esperado = codRef(linha);
        const ficha = cartas[esperado];
        if (F.codLimpo(linha) !== esperado) divergiu.push(linha + ' -> app diz "' + F.codLimpo(linha) + '", esperado "' + esperado + '"');
        if (!ficha) continue;                       // cadastro sem ficha coletada: nao e defeito do app
        const achou = F.precoLigaDe(linha);
        if (ehSolto) { soltos++; if (achou === ficha) soltosResolvidos++; }
        if (achou !== ficha) orfaos.push(linha);
      }
      if (soltos < 5)
        throw new Error('DADOS: so ' + soltos + ' cadastro(s) em formato solto com ficha no precos.json — amostra pequena demais pra provar o caminho (o estoque mudou? a coleta falhou?)');
      return [
        ['o codigo que o app extrai bate com a especificacao, cadastro a cadastro' +
          (divergiu.length ? ' (' + divergiu.slice(0, 3).join(' · ') + ')' : ''), divergiu.length, 0],
        ['TODO cadastro com ficha no precos.json e alcancado por precoLigaDe', orfaos.length, 0],
        ['nenhum cadastro de codigo solto fica orfao (' + soltosResolvidos + ' de ' + soltos + ')', soltosResolvidos, soltos],
        ['e o formato com parenteses continua funcionando', !!F.precoLigaDe("Cynthia's spiritomb (244/217)"), !!cartas['244/217']]
      ];
    }
  },
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
    atributos: [[/on\s*change\s*=\s*(["'])(?:(?!\1)[\s\S])*?\bfixaParenteses\s*\(\s*this\.value\s*\)/g, 3, 'o handler real nos 3 campos de codigo']],
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
    recorta: ['normCod', 'codLimpo', 'ligaVersoes', 'pendenciasCodigo', 'ambiguasPendentes', 'pendenciasResumo', 'abrirPendencias'],
    chamadas: [['abrirPendencias', 1, 'o link do Painel que abre a lista']],
    atributos: [[/on\s*click\s*=\s*(["'])(?:(?!\1)[\s\S])*?\babrirPendencias\s*\(\s*\)/g, 1, 'o link do Painel']],
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
        /* a fixture PRECISA ter caso negativo: com so casos positivos, apagar os filtros de
           dentro da funcao passa verde (furo achado no reataque adversarial de 2026-08-20) */
        movs: [
          { id: 'a', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: 'Frosmoth 192/184', obs: 'Frosmoth' },
          { id: 'b', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: '188/172', obs: 'Sem opcoes' },
          { id: 'c', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: '211/172', obs: 'Com preco' },
          { id: 'd', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: '188/172', obs: 'JA VENDIDA', _vendida: true },
          { id: 'e', tipo: 'VENDA', cat: 'Single/Carta', qtd: 1, codigo: '188/172', obs: 'movimento de VENDA' },
          { id: 'f', tipo: 'COMPRA', cat: 'Booster Box', qtd: 1, codigo: '188/172', obs: 'CAIXA, nao e carta' },
          { id: 'h', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: '188/172', obs: 'ja tem link proprio', codigoUrl: 'https://x' },
          { id: 'i', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: '777/777', obs: 'codigo que a Liga nao tem' },
          /* as 3 situacoes que contam PRECISAM estar na fixture: com so 'Em estoque', podar o
             filtro pra aceitar unicamente esse valor passava verde e sumia com as cartas em
             Pedido e na Colecao (furo Q2b do 3o reataque) */
          { id: 'j', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: '188/172', obs: 'PEDIDO a caminho', _sit: 'Pedido' },
          { id: 'k', tipo: 'COMPRA', cat: 'Single/Carta', qtd: 1, codigo: '188/172', obs: 'NA COLECAO', _sit: 'Coleção' }
        ],
        _precosLiga: { cartas: FICHAS },
        codigosResolvidos: {},
        sitDe: m => (m && m._vendida ? 'Vendido' : (m && m._sit) || 'Em estoque'),
        precoLigaDe: c => FICHAS[('' + c).trim()] || null,
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
        /* qtd 0 NAO entra nesta lista de propósito: `(+m.qtd||1)` faz zero valer 1 no app,
           que e comportamento real (tolera cadastro antigo sem qtd), nao defeito. A 1a versao
           desta fixture esperava exclusao e acusou o app — a regua e que estava errada. */
        ['inclui carta em PEDIDO e na COLECAO, nao so a que esta em estoque',
          /PEDIDO/.test(amb.map(x => x.rots.join('|')).join(' ')) && /COLECAO/.test(amb.map(x => x.rots.join('|')).join(' ')), true],
        ['e IGNORA vendida, movimento de VENDA, caixa e item com link proprio',
          amb.map(x => x.rots.join('|')).join(' ').match(/VENDIDA|VENDA|CAIXA|link proprio/) || 'nenhum', 'nenhum'],
        ['e agrupa pelo codigo LIMPO (nao pelo texto do cadastro)', amb[0] && amb[0].codC, '192/184'],
        ['contando as opcoes que o robo capturou', amb[0] && amb[0].nOpc, 2],
        ['poe quem resolve em 1 toque na frente', amb[1] && amb[1].codC, '188/172'],
        ['carta ja resolvida sai da lista', depoisDeResolver, 1],
        ['pendenciasCodigo() acha a carta com codigo que a Liga nao precificou', resumo.cad.length, 1],
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
    precisa: ['abrirEscolhaAmbigua', 'setCodigoUrlGlobal'],
    recorta: ['normCod', 'codLimpo', 'abrirEscolhaAmbigua', 'setCodigoUrlGlobal', 'salvarCodRes'],
    chamadas: [['abrirEscolhaAmbigua', 1, 'a lista de pendencias e/ou a carta aberta']],
    contexto: () => {
      const tela = telaFalsa();
      const FICHAS = {
        '192/184': { status: 'AMBIGUO', opcoes: [{ titulo: 'Frosmoth A', url: 'u1', img: 'i1' }, { titulo: 'Frosmoth B', url: 'u2', img: 'i2' }] },
        '188/172': { status: 'AMBIGUO', opcoes: [] }
      };
      /* `setCodigoUrlGlobal` deixou de ser dublê e passou a ser exercitada: esvazia-la matava
         o caminho "colar link manual" com a vacina verde (furo Q5 do 3o reataque). O que se
         dubla agora e o AMBIENTE (a caixa de texto do navegador, o armazenamento). */
      const store = {}; const alertas = [];
      let respostaDoPrompt = 'https://www.ligapokemon.com.br/?view=cards/card&card=x';
      const ch = { save: 0, fechou: 0, render: 0, toasts: [] };
      return { _tela: tela, _store: store, _alertas: alertas, _ch: ch,
               _prompt: v => { respostaDoPrompt = v; },
               document: tela.doc, codigosResolvidos: {},
               localStorage: { setItem: (k, v) => { store[k] = v; }, getItem: k => store[k] },
               precoLigaDe: c => FICHAS[('' + c).trim()] || null,
               prompt: () => respostaDoPrompt, confirm: () => true,
               alert: m => alertas.push(m), toast: t => ch.toasts.push(t),
               save: () => ch.save++, fecharModal: () => ch.fechou++, render: () => ch.render++ };
    },
    exercicio: (F, ctx) => {
      F.abrirEscolhaAmbigua('Frosmoth 192/184');
      const html = ctx._tela.escrito.join('');
      F.abrirEscolhaAmbigua('188/172');                       // sem opcoes -> cai no manual
      const salvouManual = ctx.codigosResolvidos['188/172'];
      ctx._prompt('http://sitequalquer.com/x');               // link que nao e da Liga
      F.abrirEscolhaAmbigua('188/172');
      return [
        ['abre o picker achando a ficha pelo codigo limpo', /Frosmoth A/.test(html) && /Frosmoth B/.test(html), true],
        ['cada opcao leva a escolha pro app', (html.match(/escolherOpcaoAmbigua\(/g) || []).length, 2],
        ['sem opcoes capturadas, o colar-link manual GRAVA de verdade',
          salvouManual, 'https://www.ligapokemon.com.br/?view=cards/card&card=x'],
        ['e recusa link que nao e da Liga, avisando', ctx._alertas.length >= 1, true]
      ];
    }
  },
  {
    /* achado do reataque: `escolherOpcaoAmbigua` e quem de fato GRAVA a escolha do Felype.
       Apagar a funcao inteira deixava o picker abrindo e o botao apontando pro vazio — e a
       vacina passava, porque ela nao estava no inventario. */
    nome: 'gravar a escolha da carta',
    perde: 'o picker abre, o Felype escolhe e nada acontece — o codigo continua ambiguo e o preco travado, que e exatamente o que a escolha existe pra destravar',
    precisa: ['escolherOpcaoAmbigua', 'salvarCodRes'],
    recorta: ['escolherOpcaoAmbigua', 'salvarCodRes'],
    atributos: [[/\bescolherOpcaoAmbigua\s*\(/g, 2, 'os botoes de cada opcao no picker']],
    contexto: () => {
      /* o dublê agora e o ARMAZENAMENTO, nao a funcao que grava nele. A versao anterior
         dublava `salvarCodRes` e depois afirmava "e persistida" contando o proprio dublê —
         esvaziar a funcao real passava verde (furo Q4 do 3o reataque). Medir o dublê nao
         prova nada sobre o app. */
      const ch = { save: 0, fechou: 0, render: 0, toasts: [] };
      const store = {};
      return { _ch: ch, _store: store, codigosResolvidos: {},
               localStorage: { setItem: (k, v) => { store[k] = v; }, getItem: k => store[k] },
               save: () => ch.save++, fecharModal: () => ch.fechou++,
               render: () => ch.render++, toast: t => ch.toasts.push(t) };
    },
    exercicio: (F, ctx) => {
      F.escolherOpcaoAmbigua('192/184', 'https://ligapokemon/x');
      const gravou = ctx.codigosResolvidos['192/184'];
      const persistido = ctx._store['tcg_codres'];
      const antes = persistido;
      F.escolherOpcaoAmbigua('999/999', '');
      return [
        ['a escolha e gravada no catalogo global do codigo', gravou, 'https://ligapokemon/x'],
        ['e PERSISTIDA de verdade no armazenamento do navegador',
          !!(persistido && JSON.parse(persistido)['192/184'] === 'https://ligapokemon/x'), true],
        ['a tela fecha e redesenha com o preco novo', ctx._ch.fechou >= 1 && ctx._ch.render >= 1, true],
        ['opcao sem link avisa em vez de gravar lixo', ctx.codigosResolvidos['999/999'] === undefined && ctx._store['tcg_codres'] === antes, true]
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
      ctx._nav.userAgent = 'Mozilla/5.0 (Linux; Android 14; SM-S911B)'; ctx._nav.maxTouchPoints = 5;
      const android = F.ehCelular();
      ctx._nav.userAgent = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'; ctx._nav.maxTouchPoints = 5;
      const ipad = F.ehCelular();
      ctx._nav.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'; ctx._nav.maxTouchPoints = 5;
      const ipadDesktopMode = F.ehCelular();
      ctx._nav.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; ctx._nav.maxTouchPoints = 0;
      const desktop = F.ehCelular();
      const semMarca = F.voltouDeRedirect();
      ctx._ss.setItem('tcg_redir', String(Date.now()));
      const comMarca = F.voltouDeRedirect();
      /* a janela testada e PROPRIEDADE (existe uma janela finita), nao o VALOR dela: cravar
         "10 min" fazia o Decisor mudar de 10 pra 15 e a trava acusar perda de capacidade. */
      ctx._ss.setItem('tcg_redir', String(Date.now() - 60000));
      const dentroDaJanela = F.voltouDeRedirect();
      ctx._ss.setItem('tcg_redir', String(Date.now() - 24 * 3600000));
      const foraDaJanela = F.voltouDeRedirect();
      ctx._ss.setItem('tcg_redir', String(Date.now() - 3600000));
      const marcaVelha = F.voltouDeRedirect();
      F.telaCarregando();
      const carregando = ctx._tela.escrito.join('');
      ctx._tela.escrito.length = 0;
      F.telaFalhaApp('ao aplicar seus dados: teste');
      const falha = ctx._tela.escrito.join('');
      return [
        ['iPhone e tratado como celular (usa redirecionamento)', celular, true],
        ['Android tambem', android, true],
        ['iPad tambem', ipad, true],
        ['iPad em "modo computador" (se diz Macintosh mas tem toque) tambem', ipadDesktopMode, true],
        ['computador nao (mantem o popup, que funciona)', desktop, false],
        ['sem ter saido pro Google, nao ha volta pendente', semMarca, false],
        ['tendo saido agora, a volta e detectada', comMarca, true],
        ['1 min atras ainda conta como volta de agora', dentroDaJanela, true],
        ['24 h atras nao conta mais — existe janela, e ela fecha', foraDaJanela, false],
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
const avisos = [];

/* ---------- REDE GROSSA: o arquivo PERDEU funcao em relacao a versao anterior? ----------
 * Esta e a unica checagem que NAO depende de alguem ter lembrado de enumerar a capacidade —
 * e por isso e a que de fato cobre a classe do incidente: "commit escrito sobre uma copia
 * antiga do arquivo". As capacidades enumeradas abaixo sao a rede fina; esta e a grossa.
 * Nasceu do 3o reataque adversarial (2026-08-20), que mostrou o teto do desenho anterior:
 * a cada rodada o atacante quebrava a peca VIZINHA da que eu tinha lembrado de listar
 * (escolherOpcaoAmbigua, depois salvarCodRes, depois setCodigoUrlGlobal). Enumerar nunca
 * alcanca; comparar com a versao anterior alcanca tudo de uma vez.
 * Remocao DELIBERADA e legitima: declare com PODE_REMOVER="nome1,nome2" (ou =tudo). */
function nomesDeFuncao(fonte) {
  const nomes = new Set();
  const re1 = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  const re2 = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^()]{0,200}\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
  let m;
  while ((m = re1.exec(fonte))) nomes.add(m[1]);
  while ((m = re2.exec(fonte))) nomes.add(m[1]);
  return nomes;
}
const iContra = process.argv.indexOf('--contra');
if (iContra > 0 && process.argv[iContra + 1]) {
  try {
    const base = fs.readFileSync(process.argv[iContra + 1], 'utf8');
    const jsBase = [...base.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x => x[1]).join('\n;\n');
    const antes = nomesDeFuncao(semComentarios(jsBase));
    const agora = nomesDeFuncao(jsLimpo);
    const liberado = (process.env.PODE_REMOVER || '').split(',').map(s => s.trim()).filter(Boolean);
    const tudoLiberado = liberado.includes('tudo');
    const sumiram = [...antes].filter(n => !agora.has(n) && !liberado.includes(n));
    if (sumiram.length && !tudoLiberado) {
      falhas.push(['funcao que existia na versao anterior sumiu',
        sumiram.length + ' sumiram: ' + sumiram.slice(0, 12).join(', ') + (sumiram.length > 12 ? ' (+' + (sumiram.length - 12) + ')' : ''),
        'em 19/08 um commit escrito sobre copia antiga apagou 3 blocos inteiros e ninguem viu por um dia. Se a remocao e proposital, declare TODOS (funcao de dentro de outra conta tambem):\n      PODE_REMOVER="' + sumiram.join(',') + '" git commit ...']);
    }
  } catch (e) {
    console.error('[checks] sem comparar com a versao anterior (' + e.message + ') — rede grossa nao rodou');
  }
}
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

  /* LIGACAO por ATRIBUTO: exige o handler real (`onclick="abrirPendencias()"`), nao uma
     chamada solta em qualquer lugar. Mata o truque de deixar funcao-lixo ou string de ajuda
     chamando o nome enquanto o handler de verdade sumiu do campo (furos A/B/C do reataque). */
  /* LIGACAO por HANDLER REAL, com regex TOLERANTE a formatacao: espaco a mais, aspas simples
     no lugar das duplas e ordem das chamadas dentro do mesmo atributo nao podem barrar — sao
     mudancas que nao alteram comportamento (3 falsos positivos medidos no reataque de
     2026-08-20). O que ela exige e a ligacao existir no atributo, nao o texto exato. */
  for (const [padrao, minimo, onde] of (cap.atributos || [])) {
    const n = (jsLimpo.match(padrao) || []).length;
    if (n < minimo) falhas.push([cap.nome, 'o handler real aparece ' + n + 'x (esperado no minimo ' + minimo + ': ' + onde + ')', 'a funcao pode ate existir, mas nao esta mais ligada na tela — ' + cap.perde]);
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
    if (/^DADOS:/.test(e.message || '')) { avisos.push(cap.nome + ': ' + e.message.replace(/^DADOS:\s*/, '')); continue; }
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
if (avisos.length) {
  console.log('');
  avisos.forEach(a => console.log('  aviso: ' + a));
  console.log('  (aviso e sobre os DADOS do repo, nao sobre o codigo — nao barra publicacao)');
  console.log('');
}
console.log('checks do app OK — ' + CAPACIDADES.length + ' capacidades, ' + exercicios + ' comportamentos exercitados, sintaxe valida');
