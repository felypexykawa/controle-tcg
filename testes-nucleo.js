/* TESTES DO NUCLEO — EXECUTAM o codigo do app em node, sem browser.
 *
 * Diferenca pro checks-app.js: la as CAPACIDADES sao exercitadas uma a uma com dublês; aqui o
 * <script> INTEIRO e carregado num contexto isolado e as regras de negocio sao rodadas de
 * ponta a ponta (exclusao com lastro, devolucao, merge entre aparelhos, despesa em serie).
 *
 * POR QUE ESTA AQUI E NAO NUM SCRATCHPAD (2026-08-21): este arquivo nasceu numa pasta
 * temporaria e ficou 1 dia sendo a prova mais forte da entrega sem viajar no repo, sem rodar
 * em porta nenhuma e podendo sumir sozinho. Numa entrega cujo tema e "peca construida e nao
 * ligada", era a peca construida e nao ligada. Consumidores: publicar.sh e o CI.
 *
 * Uso:  node testes-nucleo.js [caminho/do/index.html]     (padrao: ./index.html)
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
/* fuso fixo de Sao Paulo (o da Laura e do Felype): o "hoje" do app em UTC muda de dia as 21h daqui, e os testes com relogio fixo
   (31c/31e) tem de dar o mesmo resultado no PC e no CI, que roda em UTC (v2.5, revisor numero r4 L3) */
process.env.TZ = 'America/Sao_Paulo';
const ALVO = process.argv[2] || path.join(__dirname, 'index.html');
const html = fs.readFileSync(ALVO, 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

/* --- stubs --- */
const store = {};
const elStub = () => ({
  value:'', checked:false, textContent:'', innerHTML:'', style:{}, classList:{add(){},remove(){},toggle(){}},
  dataset:{}, children:[], appendChild(){}, remove(){}, addEventListener(){}, querySelector(){return null;},
  querySelectorAll(){return [];}, scrollIntoView(){}, focus(){}, insertAdjacentHTML(){}, getAttribute(){return null;},
  setAttribute(){}, removeAttribute(){}, closest(){return null;}, cloneNode(){return elStub();}
});
const ctx = {
  console,
  localStorage:{ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);},
                 removeItem:k=>{delete store[k];}, clear:()=>{for(const k in store)delete store[k];} },
  sessionStorage:{ getItem:()=>null, setItem(){}, removeItem(){} },
  document:{ getElementById:()=>elStub(), querySelector:()=>null, querySelectorAll:()=>[],
             createElement:()=>elStub(), addEventListener(){}, body:elStub(), documentElement:elStub(),
             head:elStub(), readyState:'complete' },
  navigator:{ userAgent:'node', maxTouchPoints:0, onLine:true, clipboard:{writeText(){}} },
  location:{ href:'http://local/', search:'', hash:'', reload(){} },
  setTimeout:(f)=>{ return 0; }, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
  requestAnimationFrame:(f)=>0,
  alert:()=>{}, confirm:()=>true, prompt:(q,d)=>d,
  fetch:()=>Promise.reject(new Error('sem rede no teste')),
  Image:function(){ return elStub(); },
  FileReader:function(){ return {readAsDataURL(){}}; },
  matchMedia:()=>({matches:false, addEventListener(){}, addListener(){}}),
  performance:{now:()=>0}, crypto:{getRandomValues:a=>a},
  /* o arquivo PUBLICADO tem firebaseConfig real e liga a nuvem; o de dev nao. Dublê pra que o
     mesmo teste rode nos dois sem mudar nada. */
  /* dube RECURSIVO: as fotos moram em controle/dados/fotos/<id> — dois niveis de colecao. O
     dube antigo so aguentava um, entao o teste da foto por item explodia contra o arquivo de
     DEPLOY (onde USAR_NUVEM e true) e passava contra o de dev. Dube raso e instrumento que
     mente por omissao: ele nao reprovava, ele nem chegava a testar. */
  firebase:{ initializeApp(){}, auth(){return {onAuthStateChanged(){}, signOut(){return Promise.resolve();}};},
             firestore(){const no={set(){return Promise.resolve();}, update(){return Promise.resolve();},
                 delete(){return Promise.resolve();},
                 get(){return Promise.resolve({exists:false,data:()=>({}),docs:[],forEach(){}});},
                 doc(){return no;}, collection(){return no;}, where(){return no;},
                 onSnapshot(){return ()=>{};}, orderBy(){return no;}, limit(){return no;}};
               return {collection(){return no;}, doc(){return no;}, runTransaction(){return Promise.resolve();},
                       batch(){return {set(){}, update(){}, delete(){}, commit(){return Promise.resolve();}};}};} },
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){return true;},
  open:()=>null, scrollTo(){}, scrollY:0, innerWidth:1200, innerHeight:800,
  /* URL PRECISA ser a classe real: ehLinkDeLiga faz `new URL(url)` e cai no catch se o dube
     nao construir — o teste passaria por sempre-false, sem testar nada (o verde do
     instrumento nao e o fato). Os dois estaticos ficam pendurados na subclasse. */
  URL:(()=>{const C=class extends URL{};C.createObjectURL=()=>'blob:x';C.revokeObjectURL=()=>{};return C;})(),
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
try { vm.runInContext(src, ctx, {filename:'app.js'}); }
catch(e){ console.log('ERRO ao carregar o app:', e.message); process.exit(1); }

/* as vars do app sao 'let' no escopo do script - nao viram propriedade do contexto.
   Ler e escrever tem de passar pelo vm, e reler DEPOIS de cada operacao (execExcl
   rebinda movs com filter, entao referencia guardada fica velha). */
function g(nome){ return vm.runInContext(nome, ctx); }
function setg(nome, val){ ctx.__tmp = val; vm.runInContext(nome+' = __tmp;', ctx); }
function A(nome){ const v = (nome in ctx) ? ctx[nome] : g(nome);
  if(typeof v !== 'function') throw new Error('nao achei a funcao '+nome+' no app');
  return v; }
const M = () => g('movs');
const EXC = () => g('excluidos');

/* --- utilidades do teste --- */
let ok=0, fail=0;
function t(nome, cond, detalhe){
  if(cond){ ok++; console.log('  PASSOU  ' + nome); }
  else { fail++; console.log('  FALHOU  ' + nome + (detalhe?'  ->  '+detalhe:'')); }
}
function reset(){ setg('movs',[]); setg('excluidos',{}); setg('pess',[]); }
/* RELOGIO CONGELADO (19/09/2026). O app le "hoje" pelo relogio LOCAL (hojeISO) e, pela regra da parcela sem marca, parcela vencida conta como
   paga: teste que precisa de parcela "a vencer" ou de um instante exato (20h59, 21h01...) congela o "agora" em vez de confiar em data fixa
   no passado (que envelhecia: em 19/09 as compras de fevereiro deixaram de ser "a pagar"). Fuso: America/Sao_Paulo (definido no topo).
   descongela() roda no finally de todo bloco das secoes 32 a 35. */
function congela(ano, mes, dia, hora, min) {
  vm.runInContext('(function(){const R=globalThis.__DataRealT||Date;globalThis.__DataRealT=R;const T=new R(' + [ano, mes - 1, dia, hora, min || 0, 0].join(',') + ').getTime();function F(...a){if(!new.target)return new R(T).toString();return a.length?new R(...a):new R(T);}F.prototype=R.prototype;F.now=()=>T;F.UTC=R.UTC;F.parse=R.parse;globalThis.Date=F;})()', ctx);
}
function descongela() { vm.runInContext('if(globalThis.__DataRealT){globalThis.Date=globalThis.__DataRealT;}', ctx); }
const id = n => 'id'+n;

/* cenario real: comprou 10 boosters por 100; vendeu 2 por 40 */
function cenario(){
  reset();
  const lote = {id:id(1), tipo:'COMPRA', data:'2026-08-01', cat:'Booster', colecao:'Surging Sparks',
                qtd:10, valor:100, situacao:'Em estoque', destino:'Vender', contraparte:'Fornecedor X'};
  M().push(lote);
  const peca = A('baixarLote')(id(1), 2, 'Vendido', {dataVenda:'2026-08-10'});
  const venda = {id:id(9), tipo:'VENDA', data:'2026-08-10', cat:'Booster', colecao:'Surging Sparks',
                 qtd:2, valor:40, origemId:id(1), custoOrigem:peca.valor, contraparte:'Cliente Y'};
  peca.vendaRef = venda.id;
  M().push(venda);
  return {lote, peca, venda};
}

console.log('\n=== 1. lastro: achar o pedaco que saiu na venda ===');
let c = cenario();
t('pecaDaVenda acha pelo vendaRef', A('pecaDaVenda')(c.venda) === c.peca);
delete c.peca.vendaRef;
t('pecaDaVenda acha pela heuristica (legado sem vendaRef)', A('pecaDaVenda')(c.venda) === c.peca);
t('pecaDaVenda devolve null em venda sem origem', A('pecaDaVenda')({tipo:'VENDA', id:'z'}) === null);

console.log('\n=== 2. excluir venda DEVOLVENDO o produto ===');
c = cenario();
A('execExcl')(id(9), 'vendaVolta');
t('a venda sumiu', !M().some(m=>m.id===id(9)));
t('o pedaco voltou pro estoque', A('sitDe')(M().find(m=>m.id===c.peca.id)) === 'Em estoque');
t('o pedaco perdeu a marca de venda', !M().find(m=>m.id===c.peca.id).vendaRef);
t('a quantidade total continua 10', M().filter(m=>m.tipo==='COMPRA').reduce((s,m)=>s+(+m.qtd||0),0) === 10);
t('o custo total continua 100', Math.abs(M().filter(m=>m.tipo==='COMPRA').reduce((s,m)=>s+(+m.valor||0),0) - 100) < 0.01);
t('a exclusao ficou registrada', A('estaExcluido')(id(9)));

console.log('\n=== 3. excluir venda APAGANDO tudo (venda + produto) ===');
c = cenario();
A('execExcl')(id(9), 'vendaTudo');
t('a venda sumiu', !M().some(m=>m.id===id(9)));
t('o pedaco vendido sumiu tambem', !M().some(m=>m.id===c.peca.id));
t('sobrou so o que nao foi vendido (8 un.)', M().filter(m=>m.tipo==='COMPRA').reduce((s,m)=>s+(+m.qtd||0),0) === 8);
t('as duas exclusoes ficaram registradas', A('estaExcluido')(id(9)) && A('estaExcluido')(c.peca.id));

console.log('\n=== 4. excluir a COMPRA inteira (leva estoque, pedido e vendas) ===');
c = cenario();
A('baixarLote')(id(1), 3, 'Pedido');   /* 3 un. ainda a caminho, mesmo produto */
t('cenario montado com pedido', M().some(m=>A('sitDe')(m)==='Pedido'));
A('execExcl')(id(1), 'compraTudo');
t('nao sobrou NADA da familia', M().length === 0, 'sobrou: '+JSON.stringify(M().map(m=>m.id)));
t('todos os ids ficaram registrados como excluidos', [id(1), c.peca.id, id(9)].every(x=>A('estaExcluido')(x)));

console.log('\n=== 5. excluir a compra MANTENDO as vendas ===');
c = cenario();
A('execExcl')(id(1), 'compraSobra');
t('a venda continua existindo', M().some(m=>m.id===id(9)));
t('o pedaco vendido continua (custo da venda preservado)', M().some(m=>m.id===c.peca.id));
t('o estoque que nao vendeu sumiu', !M().some(m=>m.tipo==='COMPRA'&&A('sitDe')(m)==='Em estoque'),
  'sobrou: '+JSON.stringify(M().filter(m=>m.tipo==='COMPRA').map(m=>m.id+':'+A('sitDe')(m))));
const vAgora = M().find(m=>m.id===id(9));
t('a venda foi religada no pedaco que ficou', vAgora.origemId === c.peca.id);
t('pecaDaVenda ainda acha a origem depois da poda', A('pecaDaVenda')(vAgora) && A('pecaDaVenda')(vAgora).id === c.peca.id);
const pAgora = M().find(m=>m.id===c.peca.id);
t('o pedaco virou raiz propria (sem pai morto)', !pAgora.loteOrigem);
t('conservacao: valorOrig do pedaco = valor dele', Math.abs((+pAgora.valorOrig||0) - (+pAgora.valor||0)) < 0.01);
t('raizDe do pedaco e ele mesmo', A('raizDe')(pAgora) === pAgora);

console.log('\n=== 6. devolucao ===');
c = cenario();
A('execDev')(id(9));
t('a venda saiu dos numeros', !M().some(m=>m.id===id(9)));
const pd = M().find(m=>m.id===c.peca.id);
t('o produto voltou pro estoque', A('sitDe')(pd) === 'Em estoque');
t('o motivo ficou gravado no item', /devolvido em/.test(pd.devObs||''), pd.devObs);
t('o motivo cita o cliente', /Cliente Y/.test(pd.devObs||''));

console.log('\n=== 7. A CURA: exclusao sobrevive ao merge do outro aparelho ===');
c = cenario();
const remotoAntes = JSON.parse(JSON.stringify(M()));  /* como o iPhone ainda ve */
A('execExcl')(id(9), 'vendaVolta');
const fundido = A('mergePorId')(M(), remotoAntes);
t('a venda apagada NAO ressuscita no merge', !fundido.some(m=>m.id===id(9)),
  'ids apos merge: '+fundido.map(m=>m.id).join(','));
t('o resto dos lancamentos sobrevive ao merge', fundido.some(m=>m.id===id(1)));

console.log('\n=== 8. falso-positivo: merge normal continua unindo ===');
reset();
const lisA = [{id:'a1', tipo:'COMPRA', valor:10}, {id:'a2', tipo:'COMPRA', valor:20}];
const lisB = [{id:'a1', tipo:'COMPRA', valor:10}, {id:'b3', tipo:'COMPRA', valor:30}];
const u = A('mergePorId')(lisA, lisB);
t('lancamento novo do outro aparelho entra (nada foi excluido)', u.length === 3, 'veio '+u.length);
t('nenhum item legitimo foi barrado', ['a1','a2','b3'].every(x=>u.some(m=>m.id===x)));

console.log('\n=== 9. catalogo: fornecedor apagado nao volta ===');
reset();
setg('pess', ['Fornecedor X', 'Cliente Y']);
A('marcaExcluido')('pess:Fornecedor X');
const pm = A('mergeArrUniao')(['Cliente Y'], ['Fornecedor X', 'Cliente Y'], 'pess:');
t('o fornecedor apagado nao ressuscita', pm.indexOf('Fornecedor X') < 0, JSON.stringify(pm));
t('quem nao foi apagado continua', pm.indexOf('Cliente Y') >= 0);
const pm2 = A('mergeArrUniao')(['Booster'], ['Booster','Deck'], 'cats:');
t('falso-positivo: outro catalogo nao e afetado', pm2.length === 2, JSON.stringify(pm2));

console.log('\n=== 10. poda: registro nao cresce pra sempre ===');
reset();
A('marcaExcluido')('velho');
EXC()['velho'] = Date.now() - 200*864e5;   /* 200 dias atras */
A('marcaExcluido')('novo');
t('registro de 200 dias foi podado', !A('estaExcluido')('velho'));
t('registro recente continua', A('estaExcluido')('novo'));

console.log('\n=== 11. familia: excluir pedaco mostra a compra INTEIRA ===');
c = cenario();
const pedido = A('baixarLote')(id(1), 3, 'Pedido');
const f = A('famDe')(pedido.id);   /* clicou no pedaco em PEDIDO */
t('famDe subiu ate a raiz', f.raiz.id === id(1));
t('a familia inclui o estoque', f.estoque.length > 0);
t('a familia inclui o pedido', f.pedido.length > 0);
t('a familia inclui o que ja saiu', f.saiu.length > 0);
t('a familia enxerga a venda pendurada', f.vendas.length === 1);

console.log('\n=== 12. despesa fixa em serie ===');
reset();
for(let i=0;i<4;i++) M().push({id:'d'+i, tipo:'DESPESA', serieId:'s1', status:'apagar',
  data:'2026-'+String(8+i).padStart(2,'0')+'-05', valor:50, cat:'Aluguel'});
M().push({id:'dp', tipo:'DESPESA', serieId:'s1', status:'pago', data:'2026-07-05', valor:50, cat:'Aluguel'});
A('execExcl')('d1','serie');
t('apagou desta em diante (2 restantes: a paga e a anterior)', M().length === 2, 'sobrou '+M().map(m=>m.id).join(','));
t('a despesa JA PAGA nao foi tocada', M().some(m=>m.id==='dp'));
t('a previsao anterior nao foi tocada', M().some(m=>m.id==='d0'));

console.log('\n=== 13. foto POR ITEM: o balde nao pode vazar de uma carta pra outra ===');
/* [21/08] A revisao achou 3 portas abertas depois de eu curar UMA (go/trocar de aba): o
   "< voltar", trocar o tipo de lancamento e alternar 1 item<->Nota. A cura virou regra unica
   (a identidade do formulario), entao porta nova nasce coberta.
   O teste dirige render() e voltar() DE VERDADE — chamar a guarda direto provaria que ela
   funciona, nao que ela esta LIGADA (foi o furo do meu primeiro teste: mutei a fonte tirando
   a guarda do render e este teste passou verde). */
reset();
setg('tela', 'lancar'); setg('tipoSel', 'COMPRA'); setg('compraModo', 'item'); setg('editId', null);
A('render')();                                            /* fixa a linha de base */
setg('_fotosItem', ['FOTO_A']);
A('render')();
t('mesmo formulario: a foto continua no balde', g('_fotosItem').length === 1);
setg('tipoSel', 'TROCA'); A('render')();                  /* e o que o botao de tipo faz */
t('trocou o TIPO de lancamento: o balde esvazia', g('_fotosItem').length === 0);
setg('_fotosItem', ['FOTO_B']); setg('compraModo', 'nota'); A('render')();
t('alternou 1 item <-> Nota: o balde esvazia', g('_fotosItem').length === 0);
/* a porta que a revisao achou: o "< voltar" nao passa por go(), entao a cura de la nao valia */
setg('tipoSel', 'COMPRA'); setg('compraModo', 'item'); A('render')();
setg('_fotosItem', ['FOTO_C']);
setg('navHist', [{tela:'consultar', consF:'tudo', consQ:'', consMenu:false, perDe:'', perAte:'',
                  perSel:'d30', editId:null, tipoSel:'COMPRA'}]);
A('voltar')();
t('o "< voltar" (que nao passa por go) nao leva a foto pra frente', g('_fotosItem').length === 0);
/* falso-positivo: repintar a MESMA tela (eco da nuvem, toast, qualquer render) nao pode comer
   a foto. Entrar na tela PRIMEIRO e so entao fotografar — que e a ordem do mundo real. */
setg('tela', 'lancar'); setg('tipoSel', 'COMPRA'); A('render')();
setg('_fotosItem', ['FOTO_D']); A('render')(); A('render')();
t('falso-positivo: repintar a MESMA tela nao come a foto', g('_fotosItem').length === 1);

console.log('\n=== 14. corrigir item devolve as fotos dele (e avisa antes de descartar) ===');
reset();
setg('_fotosItem', []);
setg('notaItens', [{jogo:'Pokemon', cat:'Single/Carta', qtd:1, valor:10, fotos:['F1','F2']}]);
A('editItemNota')(0);
t('editItemNota devolve as 2 fotos do item ao balde', g('_fotosItem').length === 2,
  'balde ficou com ' + g('_fotosItem').length);
reset();
setg('_fotosItem', []);
setg('trocaRecebi', [{desc:'x', valorMercado:1, fotos:['F9']}]);
A('editRecebi')(0);
t('editRecebi devolve a foto do item ao balde', g('_fotosItem').length === 1);
/* o aviso: com foto em digitacao, corrigir OUTRO item pergunta antes — e "nao" cancela mesmo */
setg('_fotosItem', ['EM_DIGITACAO']);
setg('trocaRecebi', [{desc:'y', valorMercado:2, fotos:['F8']}]);
let _perguntou = false;
ctx.confirm = () => { _perguntou = true; return false; };
A('editRecebi')(0);
t('com foto em digitacao, corrigir outro item PERGUNTA antes', _perguntou);
t('respondeu "nao": o item NAO foi tirado da lista', g('trocaRecebi').length === 1);
t('respondeu "nao": a foto em digitacao continua no balde', g('_fotosItem')[0] === 'EM_DIGITACAO');
ctx.confirm = () => true;
A('editRecebi')(0);
t('respondeu "sim": a foto do item corrigido substitui o balde', g('_fotosItem').length === 1 && g('_fotosItem')[0] === 'F8');

/* [21/08] as duas mutacoes que ainda escapavam depois da secao 17: sem `editId` na identidade,
   a foto tirada num lancamento NOVO viajava pra dentro da EDICAO de outro; e sem o
   `baldeItemLivre` no editItemNota, corrigir item da nota descartava calado. */
setg('tela','lancar'); setg('tipoSel','COMPRA'); setg('compraModo','item'); setg('editId',null);
A('render')();
setg('_fotosItem',['FOTO_DO_NOVO']);
setg('editId','m1'); A('render')();
t('entrar na EDICAO de um lancamento nao leva a foto do novo junto', g('_fotosItem').length === 0);
setg('editId',null); A('render')();
setg('_fotosItem',['EM_DIGITACAO_2']);
setg('notaItens',[{jogo:'Pokemon',cat:'Single/Carta',qtd:1,valor:9,fotos:['FX']}]);
let _perg2 = false;
ctx.confirm = () => { _perg2 = true; return false; };
A('editItemNota')(0);
t('corrigir item da NOTA com foto em digitacao tambem pergunta antes', _perg2);
t('respondeu "nao": o item da nota continua na lista', g('notaItens').length === 1);
ctx.confirm = () => true;

/* [fotos F1, P0-2] a foto passou a CONTAR so no callback de sucesso do fotoAdd. Nestas secoes o armazenamento
   vira um dube que confirma NA HORA e registra para QUEM cada foto foi — e essa e a prova de verdade do destino
   (o revisor do desenho pediu: "capturar o movId passado ao fotoAdd", nao so o contador). */
const _fotoAddOrig=g('fotoAdd'); const fotoLog=[];
setg('fotoAdd',(movId,b64,cb)=>{fotoLog.push({movId,b64});cb(true);});
console.log('\n=== 15. cada carta leva a SUA foto (nao todas pro primeiro item) ===');
reset(); fotoLog.length=0;
M().push({id:'a1', tipo:'COMPRA', data:'2026-08-01', valor:10, qtd:1});
M().push({id:'a2', tipo:'COMPRA', data:'2026-08-01', valor:20, qtd:1});
setg('_fotosPend', []);
A('aplicarFotosDoItem')(['P1','P2'], 'a1');
A('aplicarFotosDoItem')(['P3'], 'a2');
t('a carta 1 ficou com 2 fotos', (M().find(m=>m.id==='a1').nFotos|0) === 2);
t('a carta 2 ficou com 1 foto', (M().find(m=>m.id==='a2').nFotos|0) === 1);
t('o armazenamento recebeu 2 fotos PARA a1 e 1 PARA a2 (destino real, nao so contador)', fotoLog.filter(f=>f.movId==='a1').length===2 && fotoLog.filter(f=>f.movId==='a2').length===1 && fotoLog.length===3, JSON.stringify(fotoLog));
t('o balde da NOTA nao foi consumido pelo item', g('_fotosPend').length === 0);
setg('_fotosPend', ['NOTA']);
A('aplicarFotosDoItem')(['P4'], 'a1');
t('aplicar foto de item NAO rouba a foto da nota do balde', g('_fotosPend').length === 1 && g('_fotosPend')[0] === 'NOTA');

console.log('\n=== 16. "ver na Liga" abre a Liga do JOGO, e o link colado aceita subdominio ===');
t('Pokemon -> ligapokemon',   A('ligaDoJogo')('Pokemon') === 'www.ligapokemon.com.br');
t('acento nao atrapalha (Pokemon com e agudo)', A('ligaDoJogo')('Pok\u00e9mon') === 'www.ligapokemon.com.br');
t('One Piece -> ligaonepiece', A('ligaDoJogo')('One Piece') === 'www.ligaonepiece.com.br');
t('Yu-Gi-Oh (hifen) -> ligayugioh', A('ligaDoJogo')('Yu-Gi-Oh') === 'www.ligayugioh.com.br');
t('Dragon Ball vai pro host que RESPONDE a busca, nao pro www. que pergunta o jogo',
  A('ligaDoJogo')('Dragon Ball') === 'fusion.ligadragonball.com.br');
t('jogo desconhecido devolve null (avisa, nao manda pro site errado)', A('ligaDoJogo')('Lorcana') === null);
t('link de One Piece e aceito',  A('ehLinkDeLiga')('https://www.ligaonepiece.com.br/?view=cards/card&card=x'));
t('link com subdominio (fusion.) e aceito', A('ehLinkDeLiga')('https://fusion.ligadragonball.com.br/?view=cards/card&card=x'));
t('link de outro site e recusado', !A('ehLinkDeLiga')('https://mercadolivre.com.br/x'));
t('dominio que so TERMINA parecido e recusado', !A('ehLinkDeLiga')('https://naoligapokemon.com.br/x'));
t('texto que nem e URL e recusado', !A('ehLinkDeLiga')('ligapokemon'));

console.log('\n=== 17. a fiacao da foto por item, dirigida pela PORTA do usuario ===');
/* [21/08] A secao 15 chama `aplicarFotosDoItem` direto — funcao que botao nenhum chama. A
   revisao adversarial provou que 6 mutacoes na fiacao passavam VERDE por causa disso, entre
   elas cortar a chamada de dentro do `salvarNota` (o recurso inteiro morria calado). Aqui a
   cadeia e dirigida inteira: preencher -> adicionar -> salvar -> conferir no lancamento. */
const _campos = {};
function _elCampo(id){
  return { get value(){ return (id in _campos) ? _campos[id] : ''; },
           set value(v){ _campos[id] = v; },
           checked:false, textContent:'', innerHTML:'', style:{},
           classList:{add(){},remove(){},toggle(){}}, dataset:{}, children:[],
           appendChild(){}, remove(){}, addEventListener(){}, querySelector(){return null;},
           querySelectorAll(){return [];}, scrollIntoView(){}, focus(){},
           insertAdjacentHTML(){}, getAttribute(){return null;}, setAttribute(){},
           removeAttribute(){}, closest(){return null;}, cloneNode(){return _elCampo(id);} };
}
ctx.document.getElementById = _elCampo;

reset();
setg('tela','lancar'); setg('tipoSel','COMPRA'); setg('compraModo','nota');
setg('notaItens',[]); setg('_fotosItem',[]);
Object.assign(_campos, {n_jogo:'Pokemon', n_cat:'Single/Carta', n_col:'', n_idi:'Ingles',
                        n_qtd:'1', n_unit:'', n_val:'10', n_cod:'CARTA-A', n_boo:'0', n_cond:''});

setg('_fotosItem',['FOTO_DA_CARTA_A']);
A('addItemNota')();
t('a foto entra na lista JUNTO com o item (nao fica pra tras)',
  ((g('notaItens')[0]||{}).fotos||[]).length === 1);
t('e o balde fica limpo pra proxima carta', g('_fotosItem').length === 0);

_campos.n_cod = 'CARTA-B'; _campos.n_val = '20';
setg('_fotosItem',['FOTO_DA_CARTA_B1','FOTO_DA_CARTA_B2']);
A('addItemNota')();
t('a segunda carta leva as SUAS duas fotos', ((g('notaItens')[1]||{}).fotos||[]).length === 2);

/* [21/08] salvar com foto de uma carta que nunca foi adicionada perdia carta e fotos calado.
   Agora pergunta — e "nao" tem de cancelar o salvamento de verdade. */
setg('_fotosItem',['FOTO_DE_CARTA_NUNCA_ADICIONADA']);
/* o teste tem de olhar a PERGUNTA, nao so o fato de perguntar: o `avisaSemConta` logo abaixo
   tambem usa confirm e tambem cancela o salvamento, entao "perguntou + nao gravou" nao
   distingue os dois. Sem isto, tirar o aviso da foto passava verde. */
let _msgSalvar = '';
ctx.confirm = (m) => { _msgSalvar = String(m||''); return false; };
setg('notaHead', {frete:0, taxa:0, cp:'F', conta:'', sit:'Em estoque', data:'2026-08-21',
                  num:'1', pg:'A vista', nParc:3, venc1:'', obs:''});
A('salvarNota')();
t('salvar com foto de carta nao adicionada PERGUNTA antes, falando de FOTO',
  /foto/i.test(_msgSalvar), 'perguntou: ' + _msgSalvar.slice(0, 60));
t('respondeu "nao": nada foi gravado', M().filter(m=>m.tipo==='COMPRA').length === 0);
t('respondeu "nao": os itens continuam na lista', g('notaItens').length === 2);
ctx.confirm = () => true;
setg('_fotosItem',[]);
setg('notaHead', {frete:0, taxa:0, cp:'Fornecedor', conta:'', sit:'Em estoque',
                  data:'2026-08-21', num:'1', pg:'A vista', nParc:3, venc1:'', obs:''});
setg('_fotosPend', []);
A('salvarNota')();
const _lan = M().filter(m => m.tipo === 'COMPRA');
const _A = _lan.find(m => m.codigo === 'CARTA-A') || {};
const _B = _lan.find(m => m.codigo === 'CARTA-B') || {};
t('salvar a nota criou os 2 lancamentos', _lan.length === 2, 'criou ' + _lan.length);
t('a carta A saiu do salvamento com 1 foto', (_A.nFotos|0) === 1, 'nFotos=' + _A.nFotos);
t('a carta B saiu do salvamento com 2 fotos', (_B.nFotos|0) === 2, 'nFotos=' + _B.nFotos);
t('nenhuma foto foi parar na carta errada', (_A.nFotos|0) + (_B.nFotos|0) === 3);

/* a mesma cadeia do lado da TROCA: addRecebi -> trocaRecebi[].fotos -> salvarTroca */
reset();
setg('tela','lancar'); setg('tipoSel','TROCA');
setg('trocaDei',[]); setg('trocaRecebi',[]); setg('trocaDin',0); setg('_fotosItem',[]); setg('_fotosPend',[]);
Object.assign(_campos, {r_desc:'Recebida 1', r_val:'50', r_col:'', r_sit:'Em estoque',
                        r_jogo:'One Piece', r_idi:'Ingles', r_cat:'Single/Carta',
                        r_cod:'OP-1', r_boo:'0', r_cond:'', d_desc:'Dei isso', d_custo:'30'});
setg('deiModo','avulso');
A('addDei')();
setg('_fotosItem',['FOTO_RECEBIDA_1']);
A('addRecebi')();
t('o item recebido entra com a foto dele', ((g('trocaRecebi')[0]||{}).fotos||[]).length === 1);
_campos.r_desc = 'Recebida 2'; _campos.r_cod = 'OP-2';
setg('_fotosItem',[]);
A('addRecebi')();
A('salvarTroca')();
const _tr = M().filter(m => m.codigo === 'OP-1');
t('salvar a troca levou a foto pro lancamento certo',
  _tr.length === 1 && (_tr[0].nFotos|0) === 1, 'achei ' + _tr.length + ' com nFotos=' + (_tr[0]||{}).nFotos);
const _tr2 = M().filter(m => m.codigo === 'OP-2');
t('a carta recebida sem foto continua sem foto', _tr2.length === 1 && !(_tr2[0].nFotos|0));

/* [21/08] as duas ultimas mutacoes que escapavam: tirar o aviso de foto orfa do salvarTroca,
   e fazer a guarda descartar CALADA. As duas sao perda silenciosa — a classe que o Felype
   nomeia como "o app fez e nao disse". */
setg('trocaDei',[{desc:'x',custo:10}]); setg('trocaRecebi',[{desc:'y',valorMercado:20,fotos:[]}]);
setg('_fotosItem',['FOTO_ORFA_NA_TROCA']);
let _msgTroca = '';
ctx.confirm = (m) => { _msgTroca = String(m||''); return false; };
A('salvarTroca')();
t('registrar troca com foto de carta nao adicionada avisa, falando de FOTO',
  /foto/i.test(_msgTroca), 'perguntou: ' + _msgTroca.slice(0, 60));
t('respondeu "nao": a troca NAO foi gravada', !M().some(m => m.tipo === 'TROCA'));
ctx.confirm = () => true;

/* o descarte tem de FALAR. O aviso sai por setTimeout pra nao brigar com a repintura, entao o
   teste roda o timer na hora e escuta o toast. */
const _toasts = [];
const _toastOrig = g('toast'), _stOrig = ctx.setTimeout;
setg('toast', (m) => { _toasts.push(String(m)); });
ctx.setTimeout = (f) => { try { f(); } catch (e) {} return 0; };
setg('tela','lancar'); setg('tipoSel','COMPRA'); setg('compraModo','item'); setg('editId',null);
A('render')();
setg('_fotosItem',['UMA','DUAS']);
setg('tipoSel','TROCA'); A('render')();
t('quando descarta, a guarda DIZ quantas fotos foram embora',
  _toasts.some(m => /2 fotos descartadas/.test(m)), 'toasts: ' + JSON.stringify(_toasts));
_toasts.length = 0;
/* [21/08, 2a revisao] as portas do MENU (go) calavam: o proprio go() zerava o balde antes do
   render, e a guarda encontrava tudo vazio. Sao as saidas mais usadas do Lancar. */
setg('tela','lancar'); setg('tipoSel','COMPRA'); setg('compraModo','item'); setg('editId',null);
A('render')();
setg('_fotosItem',['UMA_SO']);
A('go')('consultar');
t('sair pelo MENU (Consultar) tambem avisa que descartou',
  _toasts.some(m => /1 foto descartada/.test(m)), 'toasts: ' + JSON.stringify(_toasts));
t('e a foto foi mesmo embora', g('_fotosItem').length === 0);
_toasts.length = 0;
setg('tela','lancar'); A('render')(); setg('_fotosItem',['X']);
A('go')('painel');
t('sair pelo MENU (Painel) tambem avisa', _toasts.some(m => /foto descartada/.test(m)));
setg('toast', _toastOrig); ctx.setTimeout = _stOrig;

ctx.document.getElementById = () => elStub();   /* devolve o dube padrao pras secoes seguintes */

setg('fotoAdd',_fotoAddOrig);   /* devolve o fotoAdd real (secao 21 testa a recusa e o sucesso de verdade) */
console.log('\n=== 20. Consultar sem confusao (Felype 22/08 23h: aba visivel, chip de tipo, Todos nao soma, lote = 1 card, voltar no lugar, book = lote) ===');
reset(); setg('tela','consultar'); setg('consMenu',false); setg('consQ',''); setg('perSel','tudo'); setg('perDe',''); setg('perAte','');
setg('consJogo','todos'); setg('consCol',''); setg('consPess',''); setg('consConta',''); setg('consCat',''); setg('consOrd','emissao'); setg('consGrupoFech',{}); setg('expandId',null); setg('selMode',false); setg('editId',null);
const movsC0=[{id:'L1',tipo:'COMPRA',data:'2026-07-04',cat:'Box da Coleção',colecao:'Caos',qtd:2,valor:210,situacao:'Em estoque',destino:'Vender',contraparte:'ASMODEE',pgTipo:'Parcelado',nParc:3},
  {id:'L1p',tipo:'COMPRA',data:'2026-07-04',cat:'Box da Coleção',colecao:'Caos',qtd:1,valor:105,situacao:'Vendido',destino:'Vender',contraparte:'ASMODEE',loteOrigem:'L1',dataVenda:'2026-08-10'},
  {id:'V1',tipo:'VENDA',data:'2026-08-10',cat:'Box da Coleção',colecao:'Caos',qtd:1,valor:180,origemId:'L1p',custoOrigem:105,contraparte:'compradores',canal:'Pix'},
  {id:'D1',tipo:'DESPESA',data:'2026-08-11',valor:37,status:'pago',natureza:'ordinaria',cat:'Luz'}];
setg('movs',JSON.parse(JSON.stringify(movsC0)));
setg('consF','tudo'); setg('consVer','itens');
let hC=A('vConsultar')();
t('C2: toda linha diz o tipo (chip compra / venda / despesa)', /🛒 compra<\/span>/.test(hC) && /💰 venda<\/span>/.test(hC) && /🧾 despesa<\/span>/.test(hC));
t('C3: em "Todos" o mes separa comprado de vendido e NAO soma os dois (217 = 180+37 nao aparece)', /💰 R\$\s?180/.test(hC) && /🧾 R\$\s?37/.test(hC) && !/R\$\s?217/.test(hC));
t('C3: a barra do total em "Todos" diz comprado X · vendido Y', /comprado <b>/.test(hC) && /vendido <b>/.test(hC));
t('C2: pedaco de lote se declara na linha', /🧩 parte de lote/.test(hC));
t('C6: a compra vendida com venda ligada diz 🔗 vinculada, como a venda', (hC.match(/🔗 vinculada/g)||[]).length>=2, 'ocorrencias='+(hC.match(/🔗 vinculada/g)||[]).length);
t('C1: a barra de Filtros (a que sobrevive a rolagem) comeca pelo nome da aba', /🗂 Tudo · /.test(hC));
setg('consF','COMPRA'); setg('consVer','notas'); hC=A('vConsultar')();
t('C4: na vista por nota a compra fracionada e UM card de R$315 (nao dois avulsos)', /R\$\s?315/.test(hC) && /compra de 3 Box da Coleção · 2 partes/.test(hC) && !/avulso, sem nota/.test(hC), hC.slice(hC.indexOf('partes')-120, hC.indexOf('partes')+20));
t('C4: o card diz o resumo miudo (1 vendido · 2 em estoque · 1 venda por R$180)', /1 vendido/.test(hC) && /2 em estoque/.test(hC) && /1 venda por R\$\s?180/.test(hC));
t('C4: o toque abre o lote completo (verLote)', /verLote\('L1'\)/.test(hC));
t('N1: o contador diz 1 compra avulsa (o lote conta como UMA), nao 2 itens', /1 compra\(s\) avulsa\(s\)/.test(hC) && !/2 compra\(s\) avulsa/.test(hC));
/* revisao C 23/08 — A1: em Pedidos NAO ha card de lote (vista por situacao, cada parte separada) */
setg('consF','PEDIDO'); setg('consVer','notas');
setg('movs',[{id:'P1',tipo:'COMPRA',data:'2026-08-01',cat:'ETB',colecao:'Caos',qtd:2,valor:200,situacao:'Pedido',destino:'Vender',contraparte:'ASMODEE'},
  {id:'P1p',tipo:'COMPRA',data:'2026-08-01',cat:'ETB',colecao:'Caos',qtd:1,valor:100,situacao:'Em estoque',destino:'Vender',contraparte:'ASMODEE',loteOrigem:'P1'}]);
hC=A('vConsultar')();
t('A1: em Pedidos o lote nao vira card (nada de "partes"; so o que e pedido aparece, R$200)', !/partes/.test(hC) && /R\$\s?200/.test(hC) && !/R\$\s?300/.test(hC));
/* A2: caixa aberta em boosters nao vira "41 un" */
setg('consF','COMPRA'); setg('consVer','notas');
const boosters=Array.from({length:36},(_,i)=>({id:'bst'+i,tipo:'COMPRA',data:'2026-08-01',cat:'Booster',colecao:'Caos',qtd:1,valor:10,situacao:'Em estoque',destino:'Vender',contraparte:'ASMODEE',loteOrigem:'BX'}));
setg('movs',[{id:'BX',tipo:'COMPRA',data:'2026-08-01',cat:'Booster Box',colecao:'Caos',qtd:5,valor:500,situacao:'Em estoque',destino:'Vender',contraparte:'ASMODEE',boosters:36},
  {id:'BXa',tipo:'COMPRA',data:'2026-08-01',cat:'Booster Box',colecao:'Caos',qtd:1,valor:100,situacao:'Aberto',destino:'Vender',contraparte:'ASMODEE',loteOrigem:'BX'}].concat(boosters));
hC=A('vConsultar')();
t('A2: 6 caixas compradas = "compra de 6 Booster Box" (nao 41 un), boosters abertos a parte', /compra de 6 Booster Box/.test(hC) && /🔓 1 aberto · saíram 36 Booster/.test(hC) && !/\(aberto\)/.test(hC) && !/compra de 41/.test(hC), hC.slice(hC.indexOf('compra de')-10, hC.indexOf('compra de')+60));
/* M4: raiz dentro de uma NOTA + pedaco solto: o pedaco e card avulso, sem somar o dinheiro da nota de novo */
setg('movs',[{id:'R1',tipo:'COMPRA',data:'2026-08-01',cat:'ETB',colecao:'Caos',qtd:2,valor:200,situacao:'Em estoque',destino:'Vender',contraparte:'ASMODEE',notaId:'N1',notaNum:'77'},
  {id:'R1p',tipo:'COMPRA',data:'2026-08-01',cat:'ETB',colecao:'Caos',qtd:1,valor:100,situacao:'Em estoque',destino:'Vender',contraparte:'ASMODEE',loteOrigem:'R1'}]);
hC=A('vConsultar')();
t('M4: pedaco fora da nota e card avulso (sem "partes"), e a nota continua no card dela — o dinheiro nao sai duas vezes', !/partes/.test(hC) && /avulso, sem nota/.test(hC) && (hC.match(/R\$\s?200,00/g)||[]).length===1 && (hC.match(/R\$\s?100,00/g)||[]).length===1, 'R$200 x'+(hC.match(/R\$\s?200,00/g)||[]).length+' R$100 x'+(hC.match(/R\$\s?100,00/g)||[]).length);
/* M5: filtro de periodo deixa a raiz de fora -> o card avisa "o filtro atual mostra 1 de 2 partes" */
setg('movs',[{id:'L1',tipo:'COMPRA',data:'2026-07-04',cat:'ETB',colecao:'Caos',qtd:2,valor:200,situacao:'Em estoque',destino:'Vender',contraparte:'ASMODEE'},
  {id:'L1p',tipo:'COMPRA',data:'2026-08-15',cat:'ETB',colecao:'Caos',qtd:1,valor:100,situacao:'Vendido',destino:'Vender',contraparte:'ASMODEE',loteOrigem:'L1'}]);
setg('perSel','custom'); setg('perDe','2026-08-01'); setg('perAte','2026-08-31');
hC=A('vConsultar')();
t('M5: com filtro de periodo, o card de lote AVISA que mostra 1 de 2 partes', /o filtro atual mostra 1 de 2 partes/.test(hC), hC.slice(hC.indexOf('partes')-40, hC.indexOf('partes')+120));
setg('perSel','tudo'); setg('perDe',''); setg('perAte','');
/* M3: so a venda que aponta para ESTE pedaco da a etiqueta 🔗 vinculada; irmao vendido sem venda nao ganha */
setg('consF','tudo'); setg('consVer','itens');
setg('movs',[{id:'L1',tipo:'COMPRA',data:'2026-07-04',cat:'ETB',colecao:'Caos',qtd:1,valor:100,situacao:'Em estoque',destino:'Vender',contraparte:'ASMODEE'},
  {id:'L1a',tipo:'COMPRA',data:'2026-07-04',cat:'ETB',colecao:'Caos',qtd:1,valor:100,situacao:'Vendido',destino:'Vender',contraparte:'ASMODEE',loteOrigem:'L1'},
  {id:'L1b',tipo:'COMPRA',data:'2026-07-04',cat:'ETB',colecao:'Caos',qtd:1,valor:100,situacao:'Vendido',destino:'Vender',contraparte:'ASMODEE',loteOrigem:'L1'},
  {id:'V1',tipo:'VENDA',data:'2026-08-10',cat:'ETB',colecao:'Caos',qtd:1,valor:180,origemId:'L1',custoOrigem:100,contraparte:'x',canal:'Pix'}]);
hC=A('vConsultar')();
/* a venda aponta pro PAI (formato "venda criada ja vinculada"): a etiqueta da linha segue a MESMA regra do
   bloco expandido (v.origemId===m.id) — so a venda leva 🔗; os dois irmaos Vendido sem venda propria nao
   ganham selo (o velho "pelo pai" etiquetava os dois e prometia um vinculo que o expandido nao mostrava) */
t('M3: 🔗 vinculada so onde a venda aponta para o proprio registro (1 ocorrencia: a da venda)', (hC.match(/🔗 vinculada/g)||[]).length===1, 'ocorrencias='+(hC.match(/🔗 vinculada/g)||[]).length);
setg('movs',[{id:'L1',tipo:'COMPRA',data:'2026-07-04',cat:'ETB',colecao:'Caos',qtd:1,valor:100,situacao:'Vendido',destino:'Vender',contraparte:'ASMODEE'},
  {id:'V1',tipo:'VENDA',data:'2026-08-10',cat:'ETB',colecao:'Caos',qtd:1,valor:180,origemId:'L1',custoOrigem:100,contraparte:'x',canal:'Pix'}]);
hC=A('vConsultar')();
t('M3: quando a venda aponta para o item vendido, os DOIS lados dizem 🔗 vinculada', (hC.match(/🔗 vinculada/g)||[]).length===2, 'ocorrencias='+(hC.match(/🔗 vinculada/g)||[]).length);
/* A-1 (re-checagem C): a venda que o PROPRIO app cria aponta pro PAI e deixa vendaRef no pedaco vendido — o pedaco
   tem de dizer vinculada (e mostrar a venda ao abrir); o irmao vendido SEM vendaRef nao ganha selo */
setg('movs',[{id:'L1',tipo:'COMPRA',data:'2026-07-04',cat:'ETB',colecao:'Caos',qtd:1,valor:100,situacao:'Em estoque',destino:'Vender',contraparte:'ASMODEE'},
  {id:'L1a',tipo:'COMPRA',data:'2026-07-04',cat:'ETB',colecao:'Caos',qtd:1,valor:100,situacao:'Vendido',destino:'Vender',contraparte:'ASMODEE',loteOrigem:'L1',vendaRef:'V1'},
  {id:'L1b',tipo:'COMPRA',data:'2026-07-04',cat:'ETB',colecao:'Caos',qtd:1,valor:100,situacao:'Vendido',destino:'Vender',contraparte:'ASMODEE',loteOrigem:'L1'},
  {id:'V1',tipo:'VENDA',data:'2026-08-10',cat:'ETB',colecao:'Caos',qtd:1,valor:180,origemId:'L1',custoOrigem:100,contraparte:'x',canal:'Pix'}]);
hC=A('vConsultar')();
t('A-1: venda criada pelo app (aponta pro pai + vendaRef no pedaco): a venda E o pedaco dizem 🔗 vinculada; o irmao sem vendaRef nao (2 ocorrencias)', (hC.match(/🔗 vinculada/g)||[]).length===2, 'ocorrencias='+(hC.match(/🔗 vinculada/g)||[]).length);
setg('expandId','L1a'); hC=A('vConsultar')();
t('A-1: o pedaco vendido expandido MOSTRA a venda (vendido em 10/08 por R$180)', /vendido em <b>10\/08\/2026<\/b> por <b>R\$\s?180/.test(hC), hC.slice(hC.indexOf('vendido em'), hC.indexOf('vendido em')+80));
setg('expandId',null);
/* A3: "Todos" so com despesas/transferencias nao afirma "comprado R$0 · vendido R$0" */
setg('movs',[{id:'D1',tipo:'DESPESA',data:'2026-08-11',valor:37,status:'pago',natureza:'ordinaria',cat:'Luz'},{id:'D2',tipo:'DESPESA',data:'2026-08-12',valor:120,status:'pago',natureza:'ordinaria',cat:'Net'},{id:'T1',tipo:'TRANSF',data:'2026-08-13',valor:500,contaDe:'Nubank',contaPara:'Itau'}]);
hC=A('vConsultar')();
t('A3: em Todos so com despesa/transferencia, nada de "comprado R$ 0"; diz despesas e transferido', !/comprado/.test(hC) && !/vendido/.test(hC) && /🧾 despesas <b>R\$\s?157/.test(hC) && /↔ transferido <b>R\$\s?500/.test(hC), hC.slice(hC.indexOf('lançamentos'), hC.indexOf('lançamentos')+160));
t('A3: o cabecalho do mes tambem nomeia despesa e transferencia', /🧾 R\$\s?157/.test(hC) && /↔ R\$\s?500/.test(hC));
setg('movs',JSON.parse(JSON.stringify(movsC0)));   /* de volta ao cenario-base (os blocos acima trocaram os movs) */
A('irDetalhe')('L1'); t('premissa: irDetalhe poe a vista em itens', g('consVer')==='itens');
A('verFiltro')('COMPRA'); t('C5: entrar pela aba volta a vista por nota', g('consVer')==='notas' && g('consF')==='COMPRA');
/* C7: voltar devolve aba, vista, filtro, item aberto e rolagem */
setg('tela','consultar'); setg('consF','COMPRA'); setg('consVer','itens'); setg('expandId','L1p'); setg('consCol','Caos'); ctx.scrollY=777; setg('navHist',[]);
const snapC=A('snap')();
t('C7: o snapshot guarda item aberto, vista, filtro e rolagem', snapC.expandId==='L1p' && snapC.consVer==='itens' && snapC.consCol==='Caos' && snapC.scrollY===777, JSON.stringify(snapC));
A('abrir')('L1p');
t('C7: abrir a edicao foi pro Lancar com o item', g('tela')==='lancar' && g('editId')==='L1p');
setg('expandId',null); setg('consCol',''); setg('consVer','notas'); setg('editId',null);
A('voltarDaEdicao')();
t('C7: voltar depois de salvar devolve aba, vista, filtro e item aberto', g('tela')==='consultar' && g('consF')==='COMPRA' && g('consVer')==='itens' && g('consCol')==='Caos' && g('expandId')==='L1p',
  JSON.stringify({tela:g('tela'),consF:g('consF'),consVer:g('consVer'),consCol:g('consCol'),expandId:g('expandId')}));
ctx.scrollY=0; setg('consCol',''); setg('expandId',null);
/* C9: book = lote de cartas avulsas, nao carta sem codigo */
setg('movs',[{id:'B1',tipo:'COMPRA',cat:'Single/Carta',qtd:200,valor:100,situacao:'Em estoque',obs:'book 200 cartas'}]);
t('C9: sem codigo, o book aparece nas pendencias de codigo', A('pendenciasCodigo')().some(x=>x.m.id==='B1'));
A('marcarLoteSemCodigo')('B1');
t('C9: marcado como lote, sai das pendencias e ganha a marca', !A('pendenciasCodigo')().some(x=>x.m.id==='B1') && M()[0].codigoNA==='lote');
A('desmarcarLoteSemCodigo')('B1');
t('C9: desfazer volta a contar', A('pendenciasCodigo')().some(x=>x.m.id==='B1') && !M()[0].codigoNA);
/* M1 (revisao C 23/08): o atalho das Pendencias desarma ao navegar; editar algo sem relacao NAO reabre o modal */
setg('movs',[{id:'B1',tipo:'COMPRA',cat:'Single/Carta',qtd:200,valor:100,situacao:'Em estoque',obs:'book'},{id:'D9',tipo:'DESPESA',data:'2026-08-11',valor:5,status:'pago',natureza:'ordinaria',cat:'Luz'}]);
let _abriuPend=[]; const _abrirPendOrig=g('abrirPendencias'); setg('abrirPendencias',(f)=>{_abriuPend.push(f);});
setg('navHist',[]); setg('tela','painel'); setg('_pendVolta',null);
A('abrirCorrigirCodigo')('B1');
t('M1 premissa: abrir pelas Pendencias arma o atalho', g('_pendVolta')!==null, 'pendVolta='+g('_pendVolta'));
A('go')('painel'); A('go')('consultar');
t('M1: navegar para outra tela DESARMA o atalho', g('_pendVolta')===null, 'pendVolta='+g('_pendVolta'));
A('abrir')('D9'); A('voltarDaEdicao')();
t('M1: salvar uma edicao sem relacao NAO reabre as Pendencias', _abriuPend.length===0, JSON.stringify(_abriuPend));
/* e o caminho certo continua: veio das Pendencias -> editou -> voltou -> reabre o grupo */
setg('tela','painel'); A('abrirCorrigirCodigo')('B1'); A('abrir')('B1'); A('voltarDaEdicao')();
t('M1: vindo das Pendencias, salvar reabre o mesmo grupo (uma vez)', _abriuPend.length===1, JSON.stringify(_abriuPend));
setg('abrirPendencias',_abrirPendOrig); setg('_pendVolta',null);
/* C8: numero de pendencias so depois de os precos chegarem */
setg('_precosTentado',false); setg('tela','painel'); let hP=A('vPainel')();
t('C8: antes de os precos chegarem o Painel diz "conferindo…" SEM numero', /conferindo…/.test(hP) && !/achado/.test(hP));
setg('_precosTentado',true); hP=A('vPainel')();
t('C8: depois, mostra o numero (ou "tudo certo")', /achado|tudo certo/.test(hP));
reset(); setg('tela','painel'); setg('consMenu',true);

console.log('\n=== 22. fotos F2: foto de cima = do GRUPO (nota/venda/troca), foto por carta na venda, visor de grupo, tumulo de grupo, avisos ===');
/* dube SINCRONO de fotoAdd que registra o DESTINO (como nas secoes 15-17) */
const fotoLog22=[]; const _fotoAddOrig22=g('fotoAdd');
setg('fotoAdd',(movId,b64,cb)=>{fotoLog22.push({movId,b64});cb(true);});
ctx.document.getElementById = _elCampo;
/* D1 — NOTA: a foto de cima vai para o nid; as das cartas, para as cartas */
reset(); setg('tela','lancar'); setg('tipoSel','COMPRA'); setg('compraModo','nota'); setg('editId',null);
setg('notaItens',[{jogo:'Pokemon',cat:'Single/Carta',colecao:'',idioma:'Ingles',qtd:1,valor:10,vUnit:10,codigo:'A-1',boosters:0,condicao:'',fotos:['CARTA_A']},{jogo:'Pokemon',cat:'Single/Carta',colecao:'',idioma:'Ingles',qtd:1,valor:20,vUnit:20,codigo:'B-2',boosters:0,condicao:'',fotos:[]}]);
setg('_fotosItem',[]); setg('_fotosPend',['COMPROVANTE']);
setg('notaHead',{frete:0,taxa:0,cp:'F',conta:'',sit:'Em estoque',data:'2026-08-23',num:'77',pg:'A vista',nParc:3,venc1:'',obs:''});
ctx.confirm=()=>true; fotoLog22.length=0;
A('salvarNota')();
const itsN=M().filter(m=>m.tipo==='COMPRA'&&m.notaId); const nid22=itsN.length?itsN[0].notaId:null;
t('D1 nota: salvou 2 itens com notaId', itsN.length===2 && !!nid22, 'itens='+itsN.length);
t('D1 nota: o COMPROVANTE foi para a NOTA (id do grupo), nao para o 1o item', fotoLog22.some(f=>f.b64==='COMPROVANTE'&&f.movId===nid22) && !fotoLog22.some(f=>f.b64==='COMPROVANTE'&&itsN.some(i=>i.id===f.movId)), JSON.stringify(fotoLog22));
t('D1 nota: a foto da carta A foi para a carta A', fotoLog22.some(f=>f.b64==='CARTA_A'&&f.movId===(itsN.find(i=>i.codigo==='A-1')||{}).id), JSON.stringify(fotoLog22));
t('D1 nota: nenhum item ganhou contador pela foto do comprovante', itsN.every(i=>(i.codigo==='A-1'?(+i.nFotos===1):!(+i.nFotos))), JSON.stringify(itsN.map(i=>[i.codigo,i.nFotos])));
/* D2 — VENDA de varios: cada carta leva a sua; o comprovante vai para o vid */
reset(); fotoLog22.length=0; setg('tela','lancar'); setg('tipoSel','VENDA'); setg('vendaModo','varios'); setg('editId',null);
setg('vendaItens',[{jogo:'Pokemon',cat:'Single/Carta',colecao:'',idioma:'Ingles',qtd:1,valor:100,codigo:'V-1',fotos:['CARTA_V1']},{jogo:'Pokemon',cat:'Single/Carta',colecao:'',idioma:'Ingles',qtd:1,valor:50,codigo:'V-2',fotos:[]}]);
setg('vendaHead',{cp:'Cliente',canal:'Pix',taxa:0,recDias:0,conta:'',data:'2026-08-23'}); setg('_fotosPend',['COMPROVANTE_V']); setg('_fotosItem',[]);
A('salvarVendaVarios')();
const itsV=M().filter(m=>m.tipo==='VENDA'&&m.vendaId); const vid22=itsV.length?itsV[0].vendaId:null;
t('D2 venda: salvou 2 itens com vendaId', itsV.length===2 && !!vid22, 'itens='+itsV.length);
t('D2 venda: a foto da carta V-1 foi para o item V-1', fotoLog22.some(f=>f.b64==='CARTA_V1'&&f.movId===(itsV.find(i=>i.codigo==='V-1')||{}).id), JSON.stringify(fotoLog22));
t('D1 venda: o comprovante foi para a VENDA (grupo), nao para o 1o item', fotoLog22.some(f=>f.b64==='COMPROVANTE_V'&&f.movId===vid22), JSON.stringify(fotoLog22));
/* D1 — TROCA: o comprovante vai para o tid (grupo); a foto da carta recebida vai para a carta */
reset(); fotoLog22.length=0; setg('tela','lancar'); setg('tipoSel','TROCA'); setg('editId',null); setg('_fotosItem',[]);
setg('trocaDei',[{desc:'carta X',custo:10}]); setg('trocaDin',0); setg('trocaRecebi',[{desc:'carta Y',valorMercado:30,sit:'Em estoque',cat:'Single/Carta',colecao:'',jogo:'Pokemon',idioma:'Ingles',fotos:['CARTA_T']}]);
setg('_fotosPend',['COMPROVANTE_T']); Object.assign(_campos,{t_cp:'',t_dinconta:''});
A('salvarTroca')();
const itsT=M().filter(m=>m.trocaId); const tid22=itsT.length?itsT[0].trocaId:null;
t('D1 troca: o comprovante foi para a TROCA (grupo tid), nao para o recebido', !!tid22 && fotoLog22.some(f=>f.b64==='COMPROVANTE_T'&&f.movId===tid22) && !fotoLog22.some(f=>f.b64==='COMPROVANTE_T'&&f.movId===itsT[0].id), 'tid='+tid22+' '+JSON.stringify(fotoLog22));
t('D2 troca: a foto da carta recebida foi para a carta', !!tid22 && fotoLog22.some(f=>f.b64==='CARTA_T'&&f.movId===itsT[0].id), JSON.stringify(fotoLog22));
/* D2 — addItemVenda carrega a foto da carta em digitacao */
reset(); setg('vendaItens',[]); setg('_fotosItem',['F_AVULSA']); setg('vvOrig','avulso'); setg('tipoSel','VENDA'); setg('vendaModo','varios');
Object.assign(_campos,{v_val:'30',v_col:'',v_cat:'Single/Carta',v_jogo:'Pokemon',v_idi:'Ingles',v_qtd:'1',v_cod:'X-1'});
A('addItemVenda')();
t('D2: adicionar item avulso a venda leva a foto da carta e esvazia o balde', !!(g('vendaItens')[0]||{}).fotos && g('vendaItens')[0].fotos[0]==='F_AVULSA' && g('_fotosItem').length===0, JSON.stringify(g('vendaItens')));
setg('_fotosPend',[]); setg('vendaHead',{cp:'C',canal:'Pix',taxa:0,recDias:0,conta:'',data:'2026-08-23'}); let perguntou22=false; ctx.confirm=(m)=>{if(/SEM foto/.test(String(m)))perguntou22=true;return true;};
A('salvarVendaVarios')(); ctx.confirm=()=>true;
t('D2: venda cujas cartas tem foto NAO pergunta "vai ficar sem foto"', perguntou22===false);
/* rotulos por modo */
setg('tela','lancar'); setg('editId',null); setg('tipoSel','COMPRA'); setg('compraModo','nota'); let hL=A('vLancar')();
t('D1 rotulo: na nota o botao de cima diz "fotos da nota (comprovante)"', /📷 fotos da nota \(comprovante\)/.test(hL));
setg('tipoSel','VENDA'); setg('vendaModo','varios'); hL=A('vLancar')();
t('D1/D2 rotulo: na venda de varios diz "fotos da venda (comprovante)" e tem "foto DESTA carta"', /📷 fotos da venda \(comprovante\)/.test(hL) && /📷 foto DESTA carta/.test(hL));
setg('tipoSel','TROCA'); hL=A('vLancar')();
t('D1 rotulo: na troca diz "fotos da troca (comprovante)"', /📷 fotos da troca \(comprovante\)/.test(hL));
setg('tipoSel','COMPRA'); setg('compraModo','item'); hL=A('vLancar')();
t('D1 rotulo: em 1 item continua "fotos do lançamento"', /📷 fotos do lançamento/.test(hL) && !/comprovante\)/.test(hL));
/* [revisao F2, M1] o balde de cima muda de significado com o modo: trocar nota <-> 1 item dentro do Lancar descarta (e diz) */
setg('tela','lancar'); setg('editId',null); setg('tipoSel','COMPRA'); setg('compraModo','nota'); setg('_fotosPend',['NF']); setg('_gpAnt',null); A('guardaBaldePend')();
setg('compraModo','item'); A('guardaBaldePend')();
t('revisao F2 M1: trocar nota -> 1 item dentro do Lançar descarta o balde do comprovante', g('_fotosPend').length===0);
setg('_fotosPend',['NF2']); A('guardaBaldePend')(); A('guardaBaldePend')();
t('revisao F2 M1: sem trocar o modo, o balde fica', g('_fotosPend').length===1);
setg('tipoSel','VENDA'); setg('vendaModo','varios'); A('guardaBaldePend')();
t('revisao F2 M1: trocar 1 item de compra -> venda de varios tambem descarta', g('_fotosPend').length===0);
/* [revisao F2, menor 7] remover item com foto da carta pergunta; sem foto sai direto */
setg('notaItens',[{codigo:'Q',fotos:['x']},{codigo:'R',fotos:[]}]); let perg22=0; ctx.confirm=(m)=>{perg22++;return false;}; A('removeItemNota')(0);
t('revisao F2: remover item da nota que TEM foto pergunta e, recusando, mantem', perg22===1 && g('notaItens').length===2);
ctx.confirm=()=>true; A('removeItemNota')(1); t('revisao F2: item SEM foto sai sem perguntar', perg22===1 && g('notaItens').length===1 && g('notaItens')[0].codigo==='Q');
setg('vendaItens',[{codigo:'W',fotos:['y']}]); perg22=0; ctx.confirm=(m)=>{perg22++;return true;}; A('removeItemVenda')(0);
t('revisao F2: remover item da venda com foto pergunta e, aceitando, remove', perg22===1 && g('vendaItens').length===0);
setg('trocaRecebi',[{desc:'Z',fotos:['z']}]); perg22=0; A('removeRecebi')(0);
t('revisao F2: remover recebido da troca com foto pergunta', perg22===1 && g('trocaRecebi').length===0); ctx.confirm=()=>true;
/* visor de grupo */
let htmlG=''; const _ins22=ctx.document.body.insertAdjacentHTML; ctx.document.body.insertAdjacentHTML=(p,h)=>{htmlG=h;};
A('abrirFotosGrupo')('nid-x','📷 Fotos da nota (comprovante)');
t('D1 visor de grupo abre sem exigir lancamento, com o titulo e perfil documento', /📷 Fotos da nota \(comprovante\)/.test(htmlG) && /fotoEscolhida\('nid-x',this,'doc'\)/.test(htmlG));
/* [revisao F2, M1] fechar o visor do comprovante reabre o dono; as aspas do retorno vao escapadas para o atributo */
htmlG=''; A('abrirFotosGrupo')('nid-y','📷 Fotos da nota (comprovante)','abrirNota("nid-y")');
t('revisao F2 M1: o botao fechar (e o fundo) do visor do comprovante reabrem o dono, com aspas escapadas', /onclick="fecharModal\(\);abrirNota\(&quot;nid-y&quot;\)">fechar</.test(htmlG) && /\{fecharModal\(\);abrirNota\(&quot;nid-y&quot;\)\}/.test(htmlG) && g('_gradeDe')==='nid-y', htmlG.slice(0,200));
htmlG=''; A('abrirFotosGrupo')('nid-z','📷 Fotos da nota (comprovante)');
t('revisao F2 M1: sem retorno declarado, fechar so fecha (nao quebra o atributo)', /onclick="fecharModal\(\);">fechar</.test(htmlG));
/* entradas: abrirNota, verVenda, card expandido */
reset(); setg('movs',[{id:'i1',tipo:'COMPRA',data:'2026-08-01',cat:'ETB',qtd:1,valor:10,situacao:'Em estoque',notaId:'n9',notaNum:'9'},{id:'i2',tipo:'COMPRA',data:'2026-08-01',cat:'ETB',qtd:1,valor:10,situacao:'Em estoque',notaId:'n9',notaNum:'9'},{id:'s1',tipo:'VENDA',data:'2026-08-02',cat:'ETB',qtd:1,valor:30,vendaId:'v9',contraparte:'X'},{id:'s2',tipo:'VENDA',data:'2026-08-02',cat:'ETB',qtd:1,valor:30,vendaId:'v9',contraparte:'X'}]);
htmlG=''; A('abrirNota')('n9'); t('D1 entrada: a nota aberta tem o botao "fotos da nota (comprovante)"', /abrirFotosGrupo\('n9'/.test(htmlG));
htmlG=''; A('verVenda')('v9'); t('D1 entrada: a venda aberta tem o botao "fotos da venda (comprovante)"', /abrirFotosGrupo\('v9'/.test(htmlG));
ctx.document.body.insertAdjacentHTML=_ins22;
setg('tela','consultar'); setg('consMenu',false); setg('consF','tudo'); setg('consVer','itens'); setg('expandId','i1'); setg('perSel','tudo'); setg('perDe',''); setg('perAte',''); setg('consJogo','todos'); setg('consCol',''); setg('consPess',''); setg('consConta',''); setg('consCat','');
const hC22=A('vConsultar')(); t('D1 entrada: o card expandido de item de nota tem "fotos da nota"', /abrirFotosGrupo\('n9'/.test(hC22));
setg('expandId',null);
/* tumulos de grupo */
reset(); setg('excluidos',{}); setg('movs',[{id:'i1',tipo:'COMPRA',valor:10,notaId:'n1',notaNum:'1'},{id:'i2',tipo:'COMPRA',valor:10,notaId:'n1',notaNum:'1'}]);
A('desfazerNotaFaz')('n1'); t('D1 tumulo: desfazer a nota marca nota:n1', A('estaExcluido')('nota:n1') && !M().some(m=>m.notaId));
setg('excluidos',{}); setg('movs',[{id:'i1',tipo:'COMPRA',valor:10,notaId:'n2'},{id:'i2',tipo:'COMPRA',valor:10,notaId:'n2'}]);
A('separarDaNota')('i1'); t('D1 tumulo: separar o penultimo NAO marca', !A('estaExcluido')('nota:n2'));
A('separarDaNotaFaz')('i2'); t('D1 tumulo: separar o ultimo marca nota:n2', A('estaExcluido')('nota:n2'));
/* [revisao F2] grupo que ficou sem nenhum item ganha tumulo; grupo que ainda tem item NAO (venda/nota/troca) */
setg('excluidos',{}); setg('movs',[{id:'k2',tipo:'COMPRA',valor:10,notaId:'nK'},{id:'k3',tipo:'COMPRA',valor:10,notaId:'nK'},{id:'k4',tipo:'COMPRA',valor:10,trocaId:'tK'}]);
A('enterraGruposVazios')([{vendaId:'vK'},{notaId:'nK'},{trocaId:'tK'},null]);
t('revisao F2: enterraGruposVazios marca venda que ficou vazia e poupa nota/troca que ainda tem item', A('estaExcluido')('venda:vK') && !A('estaExcluido')('nota:nK') && !A('estaExcluido')('troca:tK'));
/* caminho do dono: excluir (so este) o UNICO item de uma venda -> a venda ganha tumulo */
setg('excluidos',{}); setg('movs',[{id:'s7',tipo:'VENDA',valor:10,vendaId:'v7'},{id:'c7',tipo:'COMPRA',valor:10}]);
A('execExcl')('s7','so'); t('revisao F2: excluir o unico item de uma venda enterra a venda (venda:v7)', A('estaExcluido')('s7') && A('estaExcluido')('venda:v7') && !M().some(m=>m.id==='s7'), JSON.stringify(Object.keys(g('excluidos'))));
setg('excluidos',{}); setg('movs',[{id:'i1',tipo:'COMPRA',valor:10,notaId:'n3'},{id:'i2',tipo:'COMPRA',valor:10,notaId:'n3'}]);
A('excluirNotaInteira')('n3'); t('D1 tumulo: excluir a nota inteira marca itens E nota:n3', A('estaExcluido')('nota:n3') && A('estaExcluido')('i1'));
setg('excluidos',{}); setg('movs',[{id:'i1',tipo:'COMPRA',valor:10,notaId:'n4'},{id:'s1',tipo:'VENDA',valor:10,vendaId:'v4'},{id:'r1',tipo:'COMPRA',valor:10,trocaId:'t4'}]);
A('limparTudo')(); t('D1 tumulo: limpar tudo marca nota/venda/troca', A('estaExcluido')('nota:n4') && A('estaExcluido')('venda:v4') && A('estaExcluido')('troca:t4'));
A('esqueceExclusaoDe')({movs:[{id:'i1',notaId:'n4'},{id:'s1',vendaId:'v4'}]});
t('D1 tumulo: restaurar desmarca os grupos dos lancamentos que voltam', !A('estaExcluido')('nota:n4') && !A('estaExcluido')('venda:v4') && A('estaExcluido')('troca:t4'));
/* desfazer nota COM fotos: 3 saidas; sem fotos: confirm; leitura falhou: 2 saidas */
/* app "reaberto" com um disco dado (mesma receita do novoContexto da secao 19, que vive dentro do bloco async) */
function novoContexto22(storeInit){const st2=Object.assign({},storeInit||{});const c2=Object.assign({},ctx);
  c2.localStorage={getItem:k=>(k in st2?st2[k]:null),setItem:(k,v)=>{st2[k]=String(v);},removeItem:k=>{delete st2[k];},clear:()=>{for(const k in st2)delete st2[k];}};
  c2.window=c2;c2.globalThis=c2;c2.self=c2;vm.createContext(c2);vm.runInContext(src,c2,{filename:'app-reaberto-22.js'});
  return {ctx:c2,store:st2,g:n=>vm.runInContext(n,c2)};}
let avisos22=[]; const _modalOrig=g('modalAviso'); setg('modalAviso',(t1,c,b)=>{avisos22.push({t1,n:b.length,rots:b.map(x=>x.rot),acoes:b.map(x=>x.acao)});});
/* roda so a parte moverFotosDe(...) da acao do botao (sem fecharModal/toast, que dependem do DOM) */
const rodaMover=(acao)=>{acao=String(acao||'');if(!/moverFotosDe\(/.test(acao))return;vm.runInContext(acao.replace(/^[\s\S]*?moverFotosDe\(/,'moverFotosDe('), ctx);};
const _fotoListOrig22=g('fotoList'); let fotosGrupo=[{id:'f1',b64:'a'},{id:'f2',b64:'b'}]; let fotosDest={};
/* dube por DONO: ids de grupo (n…) devolvem fotosGrupo (null = leitura falhou); destinos devolvem o que fotosDest disser (ou vazio) */
setg('fotoList',(id,cb)=>{cb(fotosGrupo===null?null:(/^n/.test(String(id))?fotosGrupo:(fotosDest[id]||[])));});
setg('excluidos',{}); setg('movs',[{id:'i1',tipo:'COMPRA',valor:10,notaId:'n5',cat:'ETB'},{id:'i2',tipo:'COMPRA',valor:10,notaId:'n5',cat:'ETB'}]);
A('desfazerNota')('n5');
t('D1 aviso: nota COM fotos -> pergunta com 3 saidas (mover pro 1o, deixar guardadas, cancelar) e NAO desfaz sozinha', avisos22.length===1 && avisos22[0].n===3 && /Mover as fotos/.test(avisos22[0].rots[0]) && M().every(m=>m.notaId==='n5'), JSON.stringify(avisos22));
avisos22=[]; fotosGrupo=null; A('desfazerNota')('n5');
t('D1 aviso: leitura das fotos falhou -> pergunta com 2 saidas (deixar guardadas / cancelar)', avisos22.length===1 && avisos22[0].n===2, JSON.stringify(avisos22));
avisos22=[]; fotosGrupo=[]; let confirmou22=false; ctx.confirm=(m)=>{confirmou22=/Desfazer a nota/.test(String(m));return true;}; A('desfazerNota')('n5'); ctx.confirm=()=>true;
t('D1 aviso: nota SEM fotos -> confirm simples e desfaz', confirmou22 && avisos22.length===0 && !M().some(m=>m.notaId));
/* [revisao F2, G2] desfazer nota com comprovante: mover PARCIAL (1 de 2) avisa e NAO desfaz; completo desfaz */
const _moverOrigP=g('moverFotosDe'); const _alertOrig22=ctx.alert; let alertou22=''; ctx.alert=(m)=>{alertou22=String(m);};
avisos22=[]; fotosGrupo=[{id:'f1',b64:'a'},{id:'f2',b64:'b'}]; setg('excluidos',{}); setg('movs',[{id:'p1',tipo:'COMPRA',valor:10,notaId:'n7',cat:'ETB'},{id:'p2',tipo:'COMPRA',valor:10,notaId:'n7',cat:'ETB'}]);
setg('moverFotosDe',(o,d,cb)=>{cb&&cb(1,2);}); A('desfazerNota')('n7'); rodaMover(avisos22[0]&&avisos22[0].acoes[0]);
t('revisao F2 G2: mover PARCIAL (1 de 2) -> avisa "NAO foi desfeita" e a nota continua inteira', /NÃO foi desfeita/.test(alertou22) && M().every(m=>m.notaId==='n7') && !A('estaExcluido')('nota:n7'), alertou22||'(sem alerta)');
setg('moverFotosDe',(o,d,cb)=>{cb&&cb(2,2);}); alertou22=''; avisos22=[]; A('desfazerNota')('n7'); rodaMover(avisos22[0]&&avisos22[0].acoes[0]);
t('revisao F2 G2: mover COMPLETO (2 de 2) -> desfaz a nota e marca o tumulo', !alertou22 && !M().some(m=>m.notaId) && A('estaExcluido')('nota:n7'));
/* [revisao F2, M3] tirar o ULTIMO produto de nota com comprovante pergunta (3 saidas) e nao separa sozinho */
avisos22=[]; fotosGrupo=[{id:'f1',b64:'a'}]; setg('excluidos',{}); setg('movs',[{id:'u1',tipo:'COMPRA',valor:10,notaId:'n6',cat:'ETB'}]);
A('separarDaNota')('u1');
t('revisao F2 M3: tirar o ultimo produto de nota COM fotos -> pergunta com 3 saidas e o produto continua na nota', avisos22.length===1 && avisos22[0].n===3 && /Mover as fotos/.test(avisos22[0].rots[0]) && M()[0].notaId==='n6' && !A('estaExcluido')('nota:n6'), JSON.stringify(avisos22.map(a=>[a.n,a.rots])));
avisos22=[]; fotosGrupo=null; A('separarDaNota')('u1');
t('revisao F2 M3: leitura das fotos falhou -> 2 saidas e o produto continua na nota', avisos22.length===1 && avisos22[0].n===2 && M()[0].notaId==='n6', JSON.stringify(avisos22.map(a=>[a.n,a.rots])));
avisos22=[]; fotosGrupo=[]; A('separarDaNota')('u1');
t('revisao F2 M3: nota SEM fotos -> separa direto e a nota ganha tumulo', avisos22.length===0 && !M()[0].notaId && A('estaExcluido')('nota:n6'));
avisos22=[]; fotosGrupo=[{id:'f1',b64:'a'}]; setg('excluidos',{}); setg('movs',[{id:'u2',tipo:'COMPRA',valor:10,notaId:'n8',cat:'ETB'}]); setg('moverFotosDe',(o,d,cb)=>{cb&&cb(1,1);});
A('separarDaNota')('u2'); rodaMover(avisos22[0]&&avisos22[0].acoes[0]);
t('revisao F2 M3: "mover as fotos para este produto" -> ele sai da nota e a nota ganha tumulo', !M()[0].notaId && A('estaExcluido')('nota:n8'));
setg('moverFotosDe',(o,d,cb)=>{cb&&cb(0,1);}); avisos22=[]; alertou22=''; setg('excluidos',{}); setg('movs',[{id:'u3',tipo:'COMPRA',valor:10,notaId:'n8b',cat:'ETB'}]);
A('separarDaNota')('u3'); rodaMover(avisos22[0]&&avisos22[0].acoes[0]);
t('revisao F2 M3: mover falhou -> avisa e o produto NAO sai da nota', /NÃO foi tirado da nota/.test(alertou22) && M()[0].notaId==='n8b' && !A('estaExcluido')('nota:n8b'), alertou22||'(sem alerta)');
ctx.alert=_alertOrig22; setg('moverFotosDe',_moverOrigP);
setg('modalAviso',_modalOrig);
/* moverFotosDe: grava no destino, apaga da origem, conta no item destino */
const fDel22=[]; const _fotoDelOrig22=g('fotoDel'); setg('fotoDel',(fid,cb)=>{fDel22.push(fid);cb(true);});
fotosGrupo=[{id:'f1',b64:'a'},{id:'f2',b64:'b'}]; fotoLog22.length=0;
setg('movs',[{id:'d1',tipo:'COMPRA',valor:10}]); let movidas=null; A('moverFotosDe')('n5','d1',n=>{movidas=n;});
t('D3-nucleo: moverFotosDe grava as 2 no destino, apaga as 2 da origem e conta no item', movidas===2 && fotoLog22.filter(f=>f.movId==='d1').length===2 && fDel22.length===2 && +(M().find(m=>m.id==='d1').nFotos)===2, 'movidas='+movidas+' adds='+JSON.stringify(fotoLog22)+' dels='+JSON.stringify(fDel22));
/* [revisao F2, G1] ordem do mover: se gravar no destino FALHA, a foto NAO e apagada da origem */
fDel22.length=0; const _faSync=g('fotoAdd'); setg('fotoAdd',(mid,b,cb)=>{cb(false);}); let okMove=null; A('fotoMove')({id:'fz',b64:'z'},'d1',ok=>{okMove=ok;});
t('revisao F2 G1: gravar no destino falhou -> devolve falso e NAO apaga da origem', okMove===false && fDel22.length===0);
let movidas2=null; fotosGrupo=[{id:'f3',b64:'c'}]; A('moverFotosDe')('n5','d1',(n,tot)=>{movidas2=[n,tot];});
t('revisao F2 G1: moverFotosDe devolve (0 de 1) quando nada moveu — quem chama nao conclui o gesto', movidas2 && movidas2[0]===0 && movidas2[1]===1 && +(M().find(m=>m.id==='d1').nFotos)===2, JSON.stringify(movidas2));
setg('fotoAdd',_faSync);
/* [revisao F2, M5] reenvio so redesenha a grade de fotos se ela e a DO dono da foto */
const _frOrig=g('fotoRefresh'); let refreshes=[]; setg('fotoRefresh',(id)=>{refreshes.push(id);}); const _geOrig=ctx.document.getElementById; ctx.document.getElementById=()=>elStub();
setg('movs',[{id:'zz',tipo:'COMPRA',valor:1}]); setg('_fotosFalhadas',[{movId:'zz',b64:'q'}]); setg('_gradeDe','outro'); A('reenviarFotosFalhadas')('zz');
t('revisao F2 M5: reenvio com a grade de OUTRO dono aberta -> grava, mas NAO redesenha a grade alheia', refreshes.length===0 && g('_fotosFalhadas').length===0, JSON.stringify(refreshes));
setg('_fotosFalhadas',[{movId:'zz',b64:'q'}]); setg('_gradeDe','zz'); A('reenviarFotosFalhadas')('zz');
t('revisao F2 M5: reenvio com a grade DO dono aberta -> redesenha', refreshes.length===1 && refreshes[0]==='zz', JSON.stringify(refreshes));
setg('fotoRefresh',_frOrig); ctx.document.getElementById=_geOrig; setg('_gradeDe',null);
/* [re-checagem F2, menor 1] repetir o gesto depois de falha parcial NAO duplica: o que ja esta no destino so sai da origem */
fotosGrupo=[{id:'f1',b64:'P1'},{id:'f2',b64:'P2'}]; fotosDest={d2:[{id:'x9',b64:'P2'}]}; fDel22.length=0; fotoLog22.length=0;
setg('movs',[{id:'d2',tipo:'COMPRA',valor:1}]); let rDup=null; A('moverFotosDe')('n5','d2',(n,t)=>{rDup=[n,t];});
t('re-checagem F2 menor 1: foto que JA esta no destino nao e gravada de novo — so sai da origem; as duas contam como movidas', rDup&&rDup[0]===2&&rDup[1]===2 && fotoLog22.filter(f=>f.movId==='d2').length===1 && fotoLog22[0].b64==='P1' && fDel22.length===2 && +(M().find(m=>m.id==='d2').nFotos)===2, 'r='+JSON.stringify(rDup)+' adds='+JSON.stringify(fotoLog22)+' dels='+JSON.stringify(fDel22));
fotosDest={};
/* [re-checagem F2, medio 2] as duas pecas que curam o G2: prazo de 8 s e filtro _moveEmVoo */
const _stOrig22=ctx.setTimeout; const timers22=[]; ctx.setTimeout=(fn,ms)=>{timers22.push({fn,ms});return 0;};
let nAdd22=0; setg('fotoAdd',(mid,b,cb)=>{nAdd22++;});   /* destino que NUNCA responde */
fotosGrupo=[{id:'f1',b64:'a'},{id:'f2',b64:'b'}]; setg('movs',[{id:'d3',tipo:'COMPRA',valor:1}]); vm.runInContext('_moveEmVoo=new Set();',ctx);
let r8=null; A('moverFotosDe')('n5','d3',(n,t)=>{r8=[n,t];});
t('re-checagem F2: com o destino mudo o gesto fica pendurado e arma o prazo de 8 s', r8===null && nAdd22===2 && timers22.some(x=>x.ms===8000), 'r='+JSON.stringify(r8)+' timers='+JSON.stringify(timers22.map(x=>x.ms)));
let r8b=null; A('moverFotosDe')('n5','d3',(n,t)=>{r8b=[n,t];});
t('re-checagem F2: repetir o gesto com as fotos em voo NAO enfileira de novo (_moveEmVoo) e responde na hora (0 de 2)', r8b&&r8b[0]===0&&r8b[1]===2 && nAdd22===2, 'r='+JSON.stringify(r8b)+' adds='+nAdd22);
timers22.filter(x=>x.ms===8000).forEach(x=>x.fn());
t('re-checagem F2: passados os 8 s, o gesto responde com o parcial (0 de 2) em vez de travar para sempre', r8&&r8[0]===0&&r8[1]===2, 'r='+JSON.stringify(r8));
ctx.setTimeout=_stOrig22; setg('fotoAdd',_faSync); vm.runInContext('_moveEmVoo=new Set();',ctx); timers22.length=0;
/* [re-checagem F2, medio 1] devolucao (execDev) era a 4a porta sem tumulo de grupo */
setg('excluidos',{}); ctx.prompt=()=>'errada'; ctx.confirm=()=>true;
setg('movs',[{id:'og',tipo:'COMPRA',data:'2026-08-01',cat:'ETB',qtd:1,valor:100,situacao:'Vendido',destino:'Vender',destIni:'Em estoque',vendaRef:'s1'},{id:'s1',tipo:'VENDA',data:'2026-08-02',cat:'ETB',qtd:1,valor:200,origemId:'og',vendaId:'vX',contraparte:'C'}]);
A('execDev')('s1');
t('re-checagem F2 medio 1: devolver a unica venda do grupo enterra venda:vX', !M().some(m=>m.id==='s1') && A('estaExcluido')('venda:vX'), 'exc='+JSON.stringify(Object.keys(g('excluidos')))+' ids='+JSON.stringify(M().map(m=>m.id)));
/* [re-checagem F2, menor 2] item que e de nota E de troca: excluir a nota inteira enterra a troca vazia */
setg('excluidos',{}); setg('movs',[{id:'r1',tipo:'COMPRA',origem:'TROCA',valor:10,trocaId:'tQ',notaId:'nQ',cat:'Single/Carta'}]);
A('excluirNotaInteira')('nQ');
t('re-checagem F2 menor 2: excluir a nota inteira enterra tambem a troca que ficou vazia', A('estaExcluido')('nota:nQ') && A('estaExcluido')('troca:tQ'), 'exc='+JSON.stringify(Object.keys(g('excluidos'))));
/* [re-checagem F2, menor 3] trocar o TIPO (compra 1 item -> venda) tambem descarta o balde do comprovante */
setg('tela','lancar'); setg('editId',null); setg('tipoSel','COMPRA'); setg('compraModo','item'); setg('_fotosPend',['X']); setg('_gpAnt',null); A('guardaBaldePend')();
setg('tipoSel','VENDA'); setg('vendaModo','um'); A('guardaBaldePend')();
t('re-checagem F2 menor 3: compra de 1 item -> venda descarta o balde (mesma regua do balde da carta)', g('_fotosPend').length===0);
/* [re-checagem F2, medio 2] addItemVenda no ramo ESTOQUE leva a foto da carta (so o avulso era dirigido) */
ctx.document.getElementById=_elCampo; reset(); setg('tela','lancar'); setg('tipoSel','VENDA'); setg('vendaModo','varios'); setg('vvOrig','estoque'); setg('vendaItens',[]); setg('_fotosItem',['F_EST']);
setg('movs',[{id:'e1',tipo:'COMPRA',qtd:3,valor:30,cat:'ETB',boosters:0,situacao:'Em estoque',destino:'Vender',jogo:'Pokemon'}]);
Object.assign(_campos,{v_orig:'e1',v_un:'un',v_qtd2:'1',v_val2:'50'}); ctx.confirm=()=>true;
A('addItemVenda')();
t('re-checagem F2 medio 2: item do ESTOQUE entra na venda com a foto da carta e o balde esvazia', (g('vendaItens')[0]||{}).origemId==='e1' && !!(g('vendaItens')[0]||{}).fotos && g('vendaItens')[0].fotos[0]==='F_EST' && g('_fotosItem').length===0, JSON.stringify(g('vendaItens')));
/* fusao de notas move o comprovante das perdedoras para a vencedora e marca tumulo */
let movCalls=[]; const _moverOrig=g('moverFotosDe'); setg('moverFotosDe',(o,d,cb)=>{movCalls.push([o,d]);cb&&cb(1,1);});
setg('excluidos',{}); setg('selIds',{}); ctx.confirm=()=>true; ctx.prompt=()=>''; setg('_movesPendentes',[]);
setg('movs',[{id:'a1',tipo:'COMPRA',valor:100,notaId:'nA',notaNum:'A'},{id:'b1',tipo:'COMPRA',valor:10,notaId:'nB',notaNum:'B'}]);
A('juntarNotaCore')(['a1','b1']);
t('D1 fusao: as fotos da nota perdedora (menor) vao para a vencedora e a perdedora ganha tumulo', movCalls.length===1 && movCalls[0][0]==='nB' && movCalls[0][1]==='nA' && A('estaExcluido')('nota:nB') && M().every(m=>m.notaId==='nA') && g('_movesPendentes').length===0, JSON.stringify(movCalls)+' notas='+JSON.stringify(M().map(m=>m.notaId)));
/* [revisao F2, G3] mover que FALHOU na fusao: a perdedora NAO ganha tumulo, o gesto entra na fila e e retomado no commit seguinte */
movCalls=[]; setg('moverFotosDe',(o,d,cb)=>{movCalls.push([o,d]);cb&&cb(0,1);}); setg('excluidos',{}); setg('selIds',{});
setg('movs',[{id:'c1',tipo:'COMPRA',valor:100,notaId:'nC',notaNum:'C'},{id:'d1',tipo:'COMPRA',valor:10,notaId:'nD',notaNum:'D'}]);
A('juntarNotaCore')(['c1','d1']);
t('revisao F2 G3: fusao com mover que falhou -> itens fundidos, perdedora SEM tumulo, gesto na fila de retomada', M().every(m=>m.notaId==='nC') && !A('estaExcluido')('nota:nD') && g('_movesPendentes').length===1 && g('_movesPendentes')[0].origem==='nD' && g('_movesPendentes')[0].destino==='nC' && g('_movesPendentes')[0].tumulo==='nota:nD', JSON.stringify(g('_movesPendentes')));
t('re-checagem F2 medio 3: a fila de retomada foi para o disco (fechar o app nao cancela a promessa)', JSON.parse(store['tcg_moves_pend']||'[]').length===1 && JSON.parse(store['tcg_moves_pend'])[0].origem==='nD', String(store['tcg_moves_pend']));
const Rmp=novoContexto22({'tcg_moves_pend':store['tcg_moves_pend'],'tcg_seed_v1':'1','tcg_movs_v2':'[]','tcg_excluidos':'{}'});
t('re-checagem F2 medio 3: app reaberto carrega a fila do disco', Rmp.g('_movesPendentes').length===1 && Rmp.g('_movesPendentes')[0].destino==='nC', JSON.stringify(Rmp.g('_movesPendentes')));
setg('moverFotosDe',(o,d,cb)=>{cb&&cb(1,1);}); A('retomarMovesPendentes')();
t('revisao F2 G3: no commit seguinte da nuvem o gesto e retomado -> tumulo marcado e fila vazia (memoria E disco)', A('estaExcluido')('nota:nD') && g('_movesPendentes').length===0 && store['tcg_moves_pend']==='[]', String(store['tcg_moves_pend']));
setg('moverFotosDe',(o,d,cb)=>{cb&&cb(null,0);}); setg('_movesPendentes',[{origem:'nX',destino:'nY',tumulo:'nota:nX'}]); A('retomarMovesPendentes')();
t('revisao F2 G3: retomada que falha de novo devolve o gesto a fila (nao perde)', g('_movesPendentes').length===1 && !A('estaExcluido')('nota:nX')); setg('_movesPendentes',[]);
setg('moverFotosDe',_moverOrig); setg('fotoDel',_fotoDelOrig22); setg('fotoList',_fotoListOrig22); setg('fotoAdd',_fotoAddOrig22);
ctx.document.getElementById = () => elStub(); ctx.prompt=(q,d)=>d; ctx.confirm=()=>true; reset(); setg('tela','painel'); setg('consMenu',true); setg('excluidos',{});

console.log('\n=== 23. fotos F3: gesto "mover foto" — candidatos na ordem, grava->apaga sem duplicar, recusa sem internet, prazo de socorro, contador relido, reabre a grade ===');
const fotoLog23=[]; const fDel23=[]; const _fotoAddOrig23=g('fotoAdd'), _fotoDelOrig23=g('fotoDel'), _fotoListOrig23=g('fotoList');
/* "nuvem" VIVA do teste: fotosPorDono[id] = o que cada dono tem; fotoAdd grava nela, fotoDel apaga dela, fotoList le dela
   (o gesto le o destino ANTES de mover e RELE origem/destino DEPOIS — por isso o dube precisa ser vivo, nao fixo) */
let fotosPorDono={};
const addVivo=(movId,b64,cb)=>{fotoLog23.push({movId,b64});(fotosPorDono[movId]=fotosPorDono[movId]||[]).push({id:'novo'+fotoLog23.length,b64});cb(true);};
const delVivo=(fid,cb)=>{fDel23.push(fid);Object.keys(fotosPorDono).forEach(k=>{if(Array.isArray(fotosPorDono[k]))fotosPorDono[k]=fotosPorDono[k].filter(x=>x.id!==fid);});cb(true);};
const delFalha=(fid,cb)=>{fDel23.push(fid);cb(false);};
setg('fotoAdd',addVivo); setg('fotoDel',delVivo);
setg('fotoList',(id,cb)=>{cb(fotosPorDono[id]===null?null:(fotosPorDono[id]||[]).slice());});   /* copia: a leitura real devolve lista nova, nao a viva */
const d23=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10); const hoje23=d23(0);
reset(); setg('excluidos',{});
setg('movs',[{id:'i1',tipo:'COMPRA',data:hoje23,cat:'ETB',qtd:1,valor:10,notaId:'n1',notaNum:'77',nFotos:2,fotoThumb:'T'},{id:'i2',tipo:'COMPRA',data:hoje23,cat:'Box',qtd:1,valor:20,notaId:'n1',notaNum:'77'},{id:'s1',tipo:'VENDA',data:hoje23,cat:'ETB',qtd:1,valor:30,contraparte:'C'},{id:'v60',tipo:'COMPRA',data:d23(60),cat:'Meio',qtd:1,valor:6},{id:'v0',tipo:'COMPRA',data:'2020-01-01',cat:'Antigo',qtd:1,valor:5},{id:'d1',tipo:'DESPESA',data:hoje23,valor:9},{id:'r1',tipo:'COMPRA',data:hoje23,cat:'R1',valor:1},{id:'r2',tipo:'COMPRA',data:hoje23,cat:'R2',valor:1},{id:'r3',tipo:'COMPRA',data:hoje23,cat:'R3',valor:1}]);
/* candidatos: irmao do grupo, depois o comprovante da nota, depois os lancamentos de 90 dias; origem, despesa e o velho de fora; NADA truncado */
const c1=A('candidatosMoverFoto')('i1'); const ids1=c1.map(x=>x.id);
t('F3 candidatos (item de nota): irmao primeiro, comprovante da nota depois, lancamentos recentes em seguida; origem, despesa e velho de fora', ids1[0]==='i2' && ids1[1]==='n1' && ids1.includes('s1') && ids1.includes('v60') && !ids1.includes('i1') && !ids1.includes('v0') && !ids1.includes('d1'), JSON.stringify(ids1));
t('F3 candidatos: a lista nao e truncada (todos os 7 recentes aparecem) e o de 60 dias entra', ['i2','n1','s1','v60','r1','r2','r3'].every(x=>ids1.includes(x)), JSON.stringify(ids1));
t('F3 candidatos: rotulos dizem o que sao', /mesma nota/.test(c1[0].rot) && /comprovante da nota 77/.test(c1[1].rot), JSON.stringify(c1.slice(0,2)));
t('F3 candidatos: "incluir antigos" traz o de 2020', A('candidatosMoverFoto')('i1',true).map(x=>x.id).includes('v0'));
const c2=A('candidatosMoverFoto')('n1'); const ids2=c2.map(x=>x.id);
t('F3 candidatos (origem = a NOTA): os itens dela primeiro', ids2[0]==='i1' && ids2[1]==='i2' && /item deste grupo/.test(c2[0].rot) && !ids2.includes('n1'), JSON.stringify(c2));
/* abrir o painel: precisa de foto na lista e do visor aberto; o fundo do visor DEIXA de fechar com qualquer toque */
let htmlFv='';
const fv23={ get value(){return '';}, set value(v){}, remove(){fv23.removido=(fv23.removido||0)+1;}, set innerHTML(h){htmlFv=h;}, get innerHTML(){return htmlFv;}, removido:0, style:{}, disabled:false, textContent:'', onclick:function(){} };
ctx.document.getElementById=(id)=>id==='fotoview'?fv23:_elCampo(id);
setg('_fotosCache',[{id:'fA',b64:'A',movId:'i1'},{id:'fB',b64:'B',movId:'i1'}]);
A('abrirMoverFoto')('fB','i1');
t('F3 painel: abre dentro do visor com busca de destino, botao "mover pra ca", "cancelar" e o atalho "incluir antigos"', /Mover esta foto para/.test(htmlFv) && /mvf_dest/.test(htmlFv) && /moverFotoPara\('fB','i1'\)/.test(htmlFv) && /cancelar/.test(htmlFv) && /incluir lançamentos com mais de 90 dias/.test(htmlFv), htmlFv.slice(0,160));
t('F3 painel (G2): enquanto o painel esta aberto o fundo do visor NAO fecha ao toque', fv23.onclick===null);
t('F3 painel: o botao "mover" do visor e o painel seguram o toque (stopPropagation) — senao o fundo fechava antes', /onclick="event\.stopPropagation\(\);abrirMoverFoto\(/.test(src) && /<div onclick="event\.stopPropagation\(\)" style="background:var\(--card\);width:94%/.test(src));
/* mover: sem destino recusa; destino = origem recusa; nada gravado/apagado */
let alertas23=[]; const _alOrig23=ctx.alert; ctx.alert=(m)=>{alertas23.push(String(m));};
_campos.mvf_dest=''; A('moverFotoPara')('fB','i1');
t('F3 mover: sem destino escolhido -> avisa e nao encosta em nada', alertas23.length===1 && /Escolha o destino/.test(alertas23[0]) && fotoLog23.length===0 && fDel23.length===0, JSON.stringify(alertas23));
alertas23=[]; _campos.mvf_dest='i1'; A('moverFotoPara')('fB','i1');
t('F3 mover: destino = origem -> "ja esta ai"', alertas23.length===1 && /já está aí/.test(alertas23[0]) && fotoLog23.length===0, JSON.stringify(alertas23));
/* fotos na nuvem (_db ligado, o mesmo sinal do fotoAdd/fotoDel) + sem internet = recusa antes de encostar; idem com salvamento pendente */
const _dbOrig23=g('_db'); setg('_db',{}); alertas23=[]; _campos.mvf_dest='i2'; ctx.navigator.onLine=false; A('moverFotoPara')('fB','i1'); ctx.navigator.onLine=true;
t('F3 mover (G1): fotos na nuvem e modo aviao -> recusa antes de gravar ou apagar', alertas23.length===1 && /Sem internet/.test(alertas23[0]) && fotoLog23.length===0 && fDel23.length===0, JSON.stringify(alertas23));
const _seqOrig23=g('_pendSeq'), _okOrig23=g('_pendOk'), _desdeOrig23=g('_pendDesde'); setg('_pendSeq',5); setg('_pendOk',4); setg('_pendDesde',Date.now()-20000); alertas23=[]; A('moverFotoPara')('fB','i1');
t('F3 mover (G1): fotos na nuvem com salvamento sem confirmacao ha mais de 10 s (wifi sem internet) -> tambem recusa', alertas23.length===1 && /Sem internet/.test(alertas23[0]) && fotoLog23.length===0, JSON.stringify(alertas23));
/* pendencia FRESCA (o commit normal em voo, o dono online) NAO recusa — re-checagem F3, medio 1 */
setg('_pendDesde',Date.now()); alertas23=[]; let perg0=0; ctx.confirm=()=>{perg0++;return false;}; A('moverFotoPara')('fB','i1'); ctx.confirm=()=>true;
t('F3 mover (re-checagem): pendencia fresca (salvou ha 1 s, nuvem boa) NAO recusa — chega ate a pergunta', alertas23.length===0 && perg0===1 && fotoLog23.length===0, JSON.stringify(alertas23)+' perg='+perg0);
setg('_pendSeq',_seqOrig23); setg('_pendOk',_okOrig23); setg('_pendDesde',_desdeOrig23);
t('F3: marcar pendencia registra DESDE quando; limpar zera', (function(){const s=g('_pendSeq'),o=g('_pendOk'),d=g('_pendDesde');setg('_pendSeq',0);setg('_pendOk',0);setg('_pendDesde',0);A('marcaPendNuvem')();const d1=g('_pendDesde');A('marcaPendNuvem')();const d2=g('_pendDesde');A('limpaPendNuvem')(2);const d3=g('_pendDesde');setg('_pendSeq',s);setg('_pendOk',o);setg('_pendDesde',d);return d1>0&&d2===d1&&d3===0;})());
/* daqui em diante o gesto roda no modo LOCAL (sem _db): no arquivo de deploy o _db nasce ligado e herdaria pendencia de secoes anteriores */
setg('_db',null);
/* a pergunta antes de mover (M5): "nao" = nada acontece */
let perguntou23=''; ctx.confirm=(m)=>{perguntou23=String(m);return false;}; alertas23=[]; _campos.mvf_dest='i2'; A('moverFotoPara')('fB','i1');
t('F3 mover (M5): pergunta "Mover esta foto para: <destino>?" e, no nao, nao encosta em nada', /Mover esta foto para/.test(perguntou23) && /mesma nota/.test(perguntou23) && fotoLog23.length===0 && fDel23.length===0, perguntou23.slice(0,100));
ctx.confirm=()=>true;
/* mover de verdade (a SEGUNDA foto da lista, nao a primeira): grava no destino, apaga a certa, contadores por RELEITURA, reabre a grade da origem */
let reabriu23=[]; const _abrirFotosOrig23=g('abrirFotos'); setg('abrirFotos',(id)=>{reabriu23.push(id);});
let toasts23=[]; const _toastOrig23=g('toast'); setg('toast',(m)=>{toasts23.push(String(m));});
fotosPorDono={i1:[{id:'fA',b64:'A'},{id:'fB',b64:'B'}],i2:[]};   /* estado da "nuvem" ANTES do mover; o dube vivo atualiza */
alertas23=[]; _campos.mvf_dest='i2'; A('moverFotoPara')('fB','i1');
const i1=M().find(m=>m.id==='i1'), i2=M().find(m=>m.id==='i2');
t('F3 mover: gravou a foto CERTA (a segunda, B) no destino e apagou a certa da origem (ordem grava->apaga provada na F2)', fotoLog23.length===1 && fotoLog23[0].movId==='i2' && fotoLog23[0].b64==='B' && fDel23.length===1 && fDel23[0]==='fB', JSON.stringify(fotoLog23)+' dels='+JSON.stringify(fDel23));
t('F3 mover (M2/M3): contadores vem da RELEITURA da lista — origem 1 (sobrou A), destino 1 — e a miniatura da origem nao e apagada com foto viva', +i1.nFotos===1 && !!i1.fotoThumb && +i2.nFotos===1, JSON.stringify([i1.nFotos,i1.fotoThumb,i2.nFotos]));
t('F3 mover: fechou o visor, avisou "Foto movida" e reabriu a grade de onde a foto saiu', fv23.removido>=1 && toasts23.some(x=>/Foto movida/.test(x)) && reabriu23[0]==='i1' && alertas23.length===0, JSON.stringify(reabriu23)+' '+JSON.stringify(toasts23));
/* contador do destino errado (card dizia 1, nuvem tem 6): a releitura corrige — nao e ±1 cego */
fotosPorDono={i1:[{id:'fA',b64:'A'}],i2:[{id:'x1',b64:'1'},{id:'x2',b64:'2'},{id:'x3',b64:'3'},{id:'x4',b64:'4'},{id:'x5',b64:'5'}]}; fotoLog23.length=0; fDel23.length=0; reabriu23=[];
setg('_fotosCache',[{id:'fA',b64:'A',movId:'i1'}]); _campos.mvf_dest='i2'; A('moverFotoPara')('fA','i1');
t('F3 mover (M2): destino que dizia 1 e tem 6 na nuvem passa a dizer 6 (releitura), origem 0 e sem miniatura', +M().find(m=>m.id==='i2').nFotos===6 && +M().find(m=>m.id==='i1').nFotos===0 && !M().find(m=>m.id==='i1').fotoThumb, JSON.stringify([M().find(m=>m.id==='i2').nFotos,M().find(m=>m.id==='i1').nFotos]));
/* leitura da origem FALHOU depois do mover: contador errado nao vira zero salvo nem apaga miniatura (M3 = classe P0-1) */
setg('movs',[{id:'i1',tipo:'COMPRA',data:hoje23,cat:'ETB',qtd:1,valor:10,nFotos:1,fotoThumb:'T'},{id:'i2',tipo:'COMPRA',data:hoje23,cat:'Box',qtd:1,valor:20}]);
fotosPorDono={i1:null,i2:[]}; fotoLog23.length=0; fDel23.length=0; setg('_fotosCache',[{id:'fA',b64:'A',movId:'i1'},{id:'fB',b64:'B',movId:'i1'}]); _campos.mvf_dest='i2'; A('moverFotoPara')('fA','i1');
t('F3 mover (M3): com a releitura da origem falhando, o contador so cai 1 (1->0) e a miniatura NAO e apagada as cegas', +M().find(m=>m.id==='i1').nFotos===0 && !!M().find(m=>m.id==='i1').fotoThumb, JSON.stringify(M().find(m=>m.id==='i1')));
/* destino = comprovante da nota (grupo): nao ha contador a mexer no destino */
setg('movs',[{id:'i1',tipo:'COMPRA',data:hoje23,cat:'ETB',qtd:1,valor:10,notaId:'n1',notaNum:'77',nFotos:1,fotoThumb:'T'},{id:'i2',tipo:'COMPRA',data:hoje23,cat:'Box',qtd:1,valor:20,notaId:'n1',notaNum:'77'}]);
fotosPorDono={i1:[{id:'fB',b64:'B'}],n1:[]}; reabriu23=[]; fotoLog23.length=0; fDel23.length=0; setg('_fotosCache',[{id:'fB',b64:'B',movId:'i1'}]); _campos.mvf_dest='n1'; A('moverFotoPara')('fB','i1');
t('F3 mover para o comprovante da nota: grava no grupo, apaga da origem, origem 1->0 sem miniatura', fotoLog23.length===1 && fotoLog23[0].movId==='n1' && fDel23[0]==='fB' && +M().find(m=>m.id==='i1').nFotos===0 && !M().find(m=>m.id==='i1').fotoThumb, JSON.stringify(fotoLog23));
/* falha ao GRAVAR: nada apagado, avisa, reabre */
reabriu23=[]; alertas23=[]; fotoLog23.length=0; fDel23.length=0; fotosPorDono={i1:[],i2:[{id:'fC',b64:'C'}]}; setg('fotoAdd',(movId,b64,cb)=>{cb(false);}); setg('_fotosCache',[{id:'fC',b64:'C',movId:'i2'}]); _campos.mvf_dest='i1'; A('moverFotoPara')('fC','i2');
t('F3 mover: gravar no destino falhou -> nada apagado, avisa que a foto nao se perdeu e reabre a grade', fDel23.length===0 && alertas23.length===1 && /NÃO se perdeu/.test(alertas23[0]) && reabriu23[0]==='i2', JSON.stringify(alertas23));
/* falha ao APAGAR depois de gravar (M1): avisa "nos dois lugares"; repetir NAO grava de novo — so apaga da origem */
setg('fotoAdd',addVivo); setg('fotoDel',delFalha);
reabriu23=[]; alertas23=[]; fotoLog23.length=0; fDel23.length=0; fotosPorDono={i2:[{id:'fC',b64:'C'}],i1:[]}; setg('_fotosCache',[{id:'fC',b64:'C',movId:'i2'}]); _campos.mvf_dest='i1'; A('moverFotoPara')('fC','i2');
t('F3 mover (M1): apagar da origem falhou depois de gravar -> avisa (pode estar nos dois lugares) e nao conta', fotoLog23.length===1 && fDel23.length===1 && alertas23.length===1 && /dois lugares/.test(alertas23[0]) && !(+M().find(m=>m.id==='i1').nFotos), JSON.stringify(alertas23));
setg('fotoDel',delVivo); fotoLog23.length=0; fDel23.length=0; alertas23=[]; reabriu23=[]; toasts23=[];
A('moverFotoPara')('fC','i2');   /* a "nuvem" ja tem C nos dois donos (ficou da tentativa anterior) */
t('F3 mover (M1): repetir o gesto com a foto JA no destino -> nao grava de novo, so apaga da origem, e conclui', fotoLog23.length===0 && fDel23.length===1 && fDel23[0]==='fC' && toasts23.some(x=>/Foto movida/.test(x)) && +M().find(m=>m.id==='i1').nFotos===1, JSON.stringify(fDel23)+' '+JSON.stringify(toasts23));
/* prazo de socorro (G1): destino mudo -> 8 s -> avisa, fecha o visor e reabre a grade; resposta atrasada e ignorada (nao puxa o dono de volta) */
const _stOrig23=ctx.setTimeout; const timers23=[]; ctx.setTimeout=(fn,ms)=>{timers23.push({fn,ms});return 0;};
let cbPend23=null; setg('fotoAdd',(movId,b64,cb)=>{cbPend23=cb;}); fotosPorDono={i1:[],i2:[]}; fotoLog23.length=0; fDel23.length=0; alertas23=[]; reabriu23=[]; toasts23=[]; fv23.removido=0;
setg('_fotosCache',[{id:'fA',b64:'A',movId:'i1'}]); _campos.mvf_dest='i2'; A('moverFotoPara')('fA','i1');
t('F3 mover (G1): com o destino mudo o gesto fica pendurado e arma o prazo de 8 s — antes da leitura previa E de novo depois dela (lista grande nao come o prazo)', reabriu23.length===0 && timers23.filter(x=>x.ms===8000).length===2 && typeof cbPend23==='function', JSON.stringify(timers23.map(x=>x.ms)));
timers23.filter(x=>x.ms===8000).forEach(x=>x.fn());
t('F3 mover (G1): passados 8 s -> avisa que a nuvem nao respondeu, fecha o visor e reabre a grade', alertas23.length===1 && /8 segundos/.test(alertas23[0]) && fv23.removido>=1 && reabriu23[0]==='i1', JSON.stringify(alertas23));
cbPend23(true);
t('F3 mover (G1): a resposta atrasada da nuvem e ignorada — nao reabre a grade de novo nem avisa "movida"', reabriu23.length===1 && !toasts23.some(x=>/Foto movida/.test(x)), JSON.stringify(reabriu23)+' '+JSON.stringify(toasts23));
ctx.setTimeout=_stOrig23; setg('fotoAdd',addVivo);
/* origem = GRUPO: reabre o visor do comprovante com o mesmo titulo/retorno — e o _gradeMeta e gravado pelo proprio abrirFotosGrupo */
let htmlG23=''; const _insG23=ctx.document.body.insertAdjacentHTML; ctx.document.body.insertAdjacentHTML=(p,h)=>{htmlG23=h;};
fotosPorDono={n1:[]}; A('abrirFotosGrupo')('n1','📷 Fotos da venda (comprovante)','verVenda("n1")'); ctx.document.body.insertAdjacentHTML=_insG23;
t('F3: abrir o visor do comprovante grava titulo e retorno para a reabertura', !!g('_gradeMeta') && /venda/.test(g('_gradeMeta').titulo) && /verVenda/.test(g('_gradeMeta').voltaJs), JSON.stringify(g('_gradeMeta')));
let grupoReaberto=null; const _abrirGrupoOrig23=g('abrirFotosGrupo'); setg('abrirFotosGrupo',(gid,tit,vj)=>{grupoReaberto=[gid,tit,vj];});
fotosPorDono={n1:[{id:'fD',b64:'D'}],i2:[]}; fotoLog23.length=0; fDel23.length=0; setg('_fotosCache',[{id:'fD',b64:'D',movId:'n1'}]); _campos.mvf_dest='i2'; A('moverFotoPara')('fD','n1');
t('F3 mover saindo do comprovante: vai pro item (conta nele pela releitura) e reabre o visor do grupo com titulo e retorno', !!fotoLog23[0] && fotoLog23[0].movId==='i2' && +M().find(m=>m.id==='i2').nFotos===1 && !!grupoReaberto && grupoReaberto[0]==='n1' && /venda/.test(grupoReaberto[1]) && /verVenda/.test(grupoReaberto[2]), JSON.stringify(grupoReaberto)+' '+JSON.stringify(fotoLog23));
t('F3: o botao "mover" existe no visor da foto e a gravacao esta na lista de toques protegidos (anti toque dobrado)', /abrirMoverFoto\(/.test(src) && /🔀 mover</.test(src) && g('RE_GRAVA').test("moverFotoPara('a','b')"));
/* [re-checagem F3] origem SEM contador e com leitura falhada: o provisorio nao pode virar NaN (undefined-1) */
setg('abrirFotosGrupo',_abrirGrupoOrig23); setg('movs',[{id:'i1',tipo:'COMPRA',data:hoje23,cat:'ETB',qtd:1,valor:10},{id:'i2',tipo:'COMPRA',data:hoje23,cat:'Box',qtd:1,valor:20}]);
fotosPorDono={i1:null,i2:[]}; fotoLog23.length=0; fDel23.length=0; reabriu23=[]; setg('_fotosCache',[{id:'fA',b64:'A',movId:'i1'}]); _campos.mvf_dest='i2'; A('moverFotoPara')('fA','i1');
const nf23=M().find(m=>m.id==='i1').nFotos;
t('re-checagem F3: origem sem contador + leitura falhada -> o contador nao vira NaN (fica vazio ou numero)', fotoLog23.length===1 && (nf23===undefined || (typeof nf23==='number' && !Number.isNaN(nf23))), 'nFotos='+String(nf23));
/* [re-checagem F3] sem nenhum destino possivel o painel diz isso (e aponta o "incluir antigos"), em vez de uma busca vazia */
setg('movs',[{id:'i1',tipo:'COMPRA',data:'2020-01-01',cat:'ETB',qtd:1,valor:10}]); htmlFv=''; setg('_fotosCache',[{id:'fA',b64:'A',movId:'i1'}]); A('abrirMoverFoto')('fA','i1');
t('re-checagem F3: sem destino recente o painel avisa e aponta o atalho "incluir antigos"', /Nenhum lançamento recente para receber a foto/.test(htmlFv) && /incluir lançamentos com mais de 90 dias/.test(htmlFv), htmlFv.slice(0,200));
setg('fotoAdd',_fotoAddOrig23); setg('fotoDel',_fotoDelOrig23); setg('fotoList',_fotoListOrig23); setg('abrirFotos',_abrirFotosOrig23); setg('abrirFotosGrupo',_abrirGrupoOrig23); setg('toast',_toastOrig23); ctx.alert=_alOrig23; ctx.navigator.onLine=true; ctx.confirm=()=>true; setg('_db',_dbOrig23);
ctx.document.getElementById = () => elStub(); reset(); setg('tela','painel'); setg('consMenu',true); setg('excluidos',{}); setg('_fotosCache',[]); setg('_gradeMeta',null);

console.log('\n=== 24. fotos F5a: foto de excluido morre aos 120 dias (fila de limpeza persistida), medidor de espaco no Backup ===');
/* purga: tumulo que completa 120 dias poe o DONO na fila (grupo entra SEM o prefixo) e persiste no disco */
const _fdOrig24=g('fotoDel'), _flOrig24=g('fotoList'), _dbOrig24s=g('_db');
const _laOrig24=g('lixeiraApaga'); setg('lixeiraApaga',(id,cb)=>{cb&&cb(true);});   /* a varredura tambem limpa a lixeira; aqui e dube */
if(g('USAR_NUVEM'))setg('_db',{});   /* a varredura espera login quando ha nuvem; aqui o "login" e um dube */
delete store['tcg_fotos_purga']; setg('_fotosPurga',[]);
setg('excluidos',{velho1:Date.now()-121*864e5,'nota:nV':Date.now()-121*864e5,novo1:Date.now()-3*864e5});
A('podaExcluidos')();
t('F5a purga: tumulo de 121 dias poe o dono na fila (item e grupo sem prefixo); o de 3 dias fica como esta', g('_fotosPurga').includes('velho1') && g('_fotosPurga').includes('nV') && !g('_fotosPurga').includes('novo1') && g('excluidos').novo1>0 && !('velho1' in g('excluidos')), JSON.stringify(g('_fotosPurga'))+' exc='+JSON.stringify(Object.keys(g('excluidos'))));
t('F5a purga: a fila de limpeza foi para o disco', /velho1/.test(store['tcg_fotos_purga']||''), String(store['tcg_fotos_purga']));
let fotosDe24={velho1:[{id:'pa',b64:'1'},{id:'pb',b64:'2'}],nV:[{id:'pc',b64:'3'}]}; const del24=[];
setg('fotoList',(id,cb)=>cb(fotosDe24[id]===null?null:(fotosDe24[id]||[]).slice()));
setg('fotoDel',(fid,cb)=>{del24.push(fid);Object.keys(fotosDe24).forEach(k=>{if(Array.isArray(fotosDe24[k]))fotosDe24[k]=fotosDe24[k].filter(x=>x.id!==fid);});cb(true);});
A('processarPurgaFotos')();
t('F5a varredura: apagou as fotos dos donos e tirou-os da fila (memoria e disco)', del24.length===3 && g('_fotosPurga').length===0 && !/velho1/.test(store['tcg_fotos_purga']||''), JSON.stringify(del24)+' fila='+JSON.stringify(g('_fotosPurga')));
setg('_fotosPurga',['teim1']); fotosDe24={teim1:[{id:'pd',b64:'4'}]}; setg('fotoDel',(fid,cb)=>{del24.push(fid);cb(false);});
A('processarPurgaFotos')();
t('F5a varredura: apagar falhou -> o dono FICA na fila para a proxima rodada', g('_fotosPurga').length===1);
fotosDe24={teim1:null}; A('processarPurgaFotos')();
t('F5a varredura: leitura falhada -> nao conclui nada, dono fica', g('_fotosPurga').length===1);
setg('_fotosPurga',['a1','a2','a3','a4']); fotosDe24={}; let lidas24=[]; setg('fotoList',(id,cb)=>{lidas24.push(id);cb([]);});
A('processarPurgaFotos')();
t('F5a varredura: no maximo 3 donos por rodada (limpeza de fundo, nao rajada)', lidas24.length===3 && g('_fotosPurga').length===1, JSON.stringify(lidas24));
/* [revisao F5a, G3] dono que VOLTOU a existir sai da fila sem apagar nada — restauro, import, fusao, id reusado */
setg('movs',[{id:'volta1',tipo:'COMPRA',valor:9},{id:'filho1',tipo:'COMPRA',valor:9,notaId:'nRest'}]);
setg('_fotosPurga',['volta1','nRest','morto1']); fotosDe24={morto1:[{id:'pm',b64:'m'}]}; del24.length=0; lidas24=[];
setg('fotoList',(id,cb)=>{lidas24.push(id);cb(fotosDe24[id]===null?null:(fotosDe24[id]||[]).slice());});
setg('fotoDel',(fid,cb)=>{del24.push(fid);cb(true);});
A('processarPurgaFotos')();
t('F5a purga (G3): dono restaurado (por id) e nota reimportada (por notaId) saem da fila SEM apagar nada; so o morto de verdade e limpo', !g('_fotosPurga').includes('volta1') && !g('_fotosPurga').includes('nRest') && !lidas24.includes('volta1') && !lidas24.includes('nRest') && del24.length===1 && del24[0]==='pm' && g('_fotosPurga').length===0, 'fila='+JSON.stringify(g('_fotosPurga'))+' lidas='+JSON.stringify(lidas24)+' dels='+JSON.stringify(del24));
setg('_fotosPurga',[]); setg('fotoDel',_fdOrig24); setg('fotoList',_flOrig24); delete store['tcg_fotos_purga'];
t('F5a: a exclusao simples diz a regra nova (Lixeira por 120 dias e depois apagado de vez)', /vai para a 🗑 Lixeira/.test(src) && /são apagados de vez/.test(src));
/* [revisao F5a, G1/M7] a frase e provada na TELA que o dono ve (modalAviso), nao so no fonte — e sem a promessa falsa */
let corpoCap24=''; const _maOrig24=g('modalAviso'); setg('modalAviso',(t1,c)=>{corpoCap24=String(c);});
A('exclSimples')({id:'z1',cat:'ETB',valor:10,data:'2026-08-25'});
setg('modalAviso',_maOrig24);
t('F5a (G1): o aviso de excluir aponta a Lixeira (120 dias, restauravel), sem a promessa falsa antiga', /🗑 Lixeira/.test(corpoCap24) && /120 dias/.test(corpoCap24) && /restaurar por lá/.test(corpoCap24) && !/o prazo em que dá pra restaurar/.test(corpoCap24), corpoCap24.slice(0,180));
/* medidor no Backup */
setg('movs',[{id:'x1',tipo:'COMPRA',valor:10}]);
t('F5a medidor: o documento e medido em bytes e da um numero de verdade', A('medirDocBytes')()>100, 'bytes='+A('medirDocBytes')());
setg('_pontosNuvem',{erro:'sem conexao'}); let htmlBk=''; const _insBk=ctx.document.body.insertAdjacentHTML; ctx.document.body.insertAdjacentHTML=(p,h)=>{htmlBk=h;};
A('abrirBackup')(); ctx.document.body.insertAdjacentHTML=_insBk;
t('F5a medidor: o Backup mostra o espaco do documento (com %), o atalho de medir as fotos, e diz a VERDADE sobre o teto (salvamento nao se trava; ponto recusa em 700 mil)', /Espaço na nuvem — documento principal/.test(htmlBk) && /%\)/.test(htmlBk) && /medir o espaço das fotos/.test(htmlBk) && /NÃO se trava perto do teto/.test(htmlBk) && !/o app trava o salvamento em 700 mil/.test(htmlBk), htmlBk.slice(0,0));
t('F5a medidor (G2): a medida inclui os tumulos (payload real do salvamento)', (function(){const a=A('medirDocBytes')();setg('excluidos',{tumbaGrande:Date.now()});const b=A('medirDocBytes')();setg('excluidos',{});return b>a;})(), 'a medida nao mudou com um tumulo novo');
let spanTxt24={textContent:''}; ctx.document.getElementById=(id)=>id==='fotoMedidaTxt'?spanTxt24:elStub();
const _todasOrig24=g('todasFotos'); setg('todasFotos',cb=>cb([{b64:'aaaa'},{b64:'bbbb'}]));
A('medirFotosNuvem')(null);
t('F5a medidor: medir fotos escreve a contagem e diz que ficam fora do documento', /2 fotos/.test(spanTxt24.textContent) && /fora do documento principal/.test(spanTxt24.textContent), spanTxt24.textContent);
setg('todasFotos',cb=>cb(null)); spanTxt24.textContent='';
A('medirFotosNuvem')(null);
t('F5a medidor (M3): leitura falhada AVISA em vez de dizer "nenhuma foto ainda"', /não consegui ler as fotos agora/.test(spanTxt24.textContent) && !/nenhuma foto/.test(spanTxt24.textContent), spanTxt24.textContent);
setg('todasFotos',_todasOrig24); ctx.document.getElementById=()=>elStub(); setg('_pontosNuvem',null); setg('_db',_dbOrig24s); setg('lixeiraApaga',_laOrig24); reset(); setg('excluidos',{}); setg('tela','painel');

console.log('\n=== 25. lixeira: excluido guardado por 120 dias, restauravel com fotos; diario registra quem fez ===');
const guardou25=[]; const _lgOrig=g('lixeiraGuarda'); setg('lixeiraGuarda',arr=>{(arr||[]).forEach(m=>guardou25.push(m.id));});
const diario25=[]; const _drOrig=g('diarioReg'); setg('diarioReg',(a)=>{diario25.push(a);});
ctx.confirm=()=>true; setg('excluidos',{});
setg('movs',[{id:'e1',tipo:'COMPRA',valor:10,cat:'ETB'},{id:'e2',tipo:'VENDA',valor:30,vendaId:'vL',cat:'ETB'}]);
A('execExcl')('e1','so');
t('L1: excluir (so este) guarda o lancamento na lixeira e registra no diario', guardou25.includes('e1') && diario25.includes('excluiu'), JSON.stringify(guardou25)+' '+JSON.stringify(diario25));
setg('movs',[{id:'n1',tipo:'COMPRA',valor:10,notaId:'nX',cat:'A'},{id:'n2',tipo:'COMPRA',valor:20,notaId:'nX',cat:'B'}]); guardou25.length=0;
A('excluirNotaInteira')('nX');
t('L1: excluir a nota inteira guarda os 2 itens', guardou25.includes('n1')&&guardou25.includes('n2'), JSON.stringify(guardou25));
guardou25.length=0; setg('movs',[{id:'g1',tipo:'COMPRA',valor:5},{id:'g2',tipo:'DESPESA',valor:7}]);
A('limparTudo')();
t('L1: apagar tudo guarda TODOS na lixeira antes de limpar', guardou25.includes('g1')&&guardou25.includes('g2')&&M().length===0 && diario25.includes('apagou tudo'), JSON.stringify(guardou25));
guardou25.length=0; setg('excluidos',{}); ctx.prompt=()=>'motivo';
setg('movs',[{id:'og',tipo:'COMPRA',valor:100,situacao:'Vendido',destino:'Vender',destIni:'Em estoque',vendaRef:'s1',cat:'ETB'},{id:'s1',tipo:'VENDA',valor:200,origemId:'og',vendaId:'vX',cat:'ETB'}]);
A('execDev')('s1');
t('L1: devolver venda tambem guarda a venda na lixeira', guardou25.includes('s1') && diario25.includes('devolveu venda'), JSON.stringify(guardou25)+' '+JSON.stringify(diario25));
setg('lixeiraGuarda',_lgOrig);
const apagou25=[]; const _laOrig=g('lixeiraApaga'); setg('lixeiraApaga',(id,cb)=>{apagou25.push(id);cb&&cb(true);});
let reabriu25=0; const _abrirLixOrig=g('abrirLixeira'); setg('abrirLixeira',()=>{reabriu25++;});
setg('excluidos',{r1:Date.now(),'nota:nR':Date.now()}); setg('_fotosPurga',['r1','nR']); setg('movs',[]);
setg('_lixCache',[{id:'r1',ts:Date.now()-5*864e5,quem:'laura',mov:{id:'r1',tipo:'COMPRA',valor:50,cat:'Box',notaId:'nR',nFotos:2}}]);
A('lixeiraRestaura')('r1');
t('L2: restaurar devolve o lancamento, desmarca os tumulos (dele e do grupo) e tira da fila de limpeza', M().some(m=>m.id==='r1') && !A('estaExcluido')('r1') && !A('estaExcluido')('nota:nR') && !g('_fotosPurga').includes('r1') && !g('_fotosPurga').includes('nR') && reabriu25===1 && diario25.includes('restaurou da lixeira'), 'exc='+JSON.stringify(Object.keys(g('excluidos')))+' purga='+JSON.stringify(g('_fotosPurga')));
t('L2 (G1): a entrada da lixeira FICA depois de restaurar — se a fusao entre aparelhos devorar o item, da pra restaurar DE NOVO', apagou25.length===0, JSON.stringify(apagou25));
apagou25.length=0; setg('_lixCache',[{id:'r1',ts:1,mov:{id:'r1',tipo:'COMPRA'}}]);
A('lixeiraRestaura')('r1');
t('L2: restaurar um que JA voltou so limpa a entrada (nao duplica)', M().filter(m=>m.id==='r1').length===1 && apagou25.includes('r1'));
let perg25=''; ctx.confirm=(m)=>{perg25=String(m);return false;};
setg('_lixCache',[{id:'sv1',ts:1,mov:{id:'sv1',tipo:'VENDA',origemId:'og2',valor:9,cat:'C'}}]); const antes25=M().length;
A('lixeiraRestaura')('sv1'); ctx.confirm=()=>true;
t('L2: venda com produto vinculado pergunta antes (estoque nao baixa de novo); no nao, nada muda', /NÃO baixa o estoque/.test(perg25) && M().length===antes25 && !M().some(m=>m.id==='sv1'), perg25.slice(0,80));
let htmlLx=''; const _insLx=ctx.document.body.insertAdjacentHTML; ctx.document.body.insertAdjacentHTML=(p,h)=>{htmlLx=h;};
const _llOrig=g('lixeiraLista'); const elLix={innerHTML:''}; ctx.document.getElementById=(id)=>id==='lixLista'?elLix:_elCampo(id);
setg('lixeiraLista',cb=>cb([{id:'w1',ts:Date.now()-10*864e5,quem:'felype',mov:{id:'w1',tipo:'COMPRA',valor:80,cat:'ETB',data:'2026-08-01',nFotos:1}}]));
setg('abrirLixeira',_abrirLixOrig); A('abrirLixeira')();
t('L3: a tela lista o excluido com restaurar, fotos e "some em N dias"', /🗑 Lixeira/.test(htmlLx) && /lixeiraRestaura\('w1'\)/.test(elLix.innerHTML) && /some em 110 dias/.test(elLix.innerHTML) && /por felype/.test(elLix.innerHTML) && /📷 fotos \(1\)/.test(elLix.innerHTML), elLix.innerHTML.slice(0,220));
/* [re-checagem lixeira] o ramo "ja esta de volta" e a peca que sustenta a mitigacao do G1 — provado na tela */
setg('movs',[{id:'w1',tipo:'COMPRA',valor:80,cat:'ETB'}]);
setg('lixeiraLista',cb=>cb([{id:'w1',ts:Date.now()-3*864e5,quem:'felype',mov:{id:'w1',tipo:'COMPRA',valor:80,cat:'ETB'}}]));
A('abrirLixeira')();
t('L3 (G1): item que ja voltou aparece como "ja esta de volta" com o botao de limpar — sem botao de restaurar duplicando', /já está de volta no app/.test(elLix.innerHTML) && /limpar da lixeira/.test(elLix.innerHTML) && !/lixeiraRestaura\('w1'\)/.test(elLix.innerHTML), elLix.innerHTML.slice(0,200));
setg('movs',[]);
setg('lixeiraLista',cb=>cb(null)); A('abrirLixeira')();
t('L3: leitura falhada avisa (os itens continuam guardados), nao finge vazio', /Não consegui ler a lixeira/.test(elLix.innerHTML), elLix.innerHTML.slice(0,120));
setg('lixeiraLista',cb=>cb([])); A('abrirLixeira')();
t('L3: vazio diz vazio', /Nada na lixeira/.test(elLix.innerHTML));
setg('lixeiraLista',_llOrig); ctx.document.body.insertAdjacentHTML=_insLx; ctx.document.getElementById=()=>elStub();
t('L4: o Backup tem a porta da Lixeira', /fecharModal\(\);abrirLixeira\(\)/.test(src) && /🗑 Lixeira <span/.test(src));
const lixApagadas25=[]; setg('lixeiraApaga',(id,cb)=>{lixApagadas25.push(id);cb&&cb(true);});
setg('_fotosPurga',['pz','pv']); setg('movs',[]); const _flOrig25=g('fotoList'), _fdOrig25=g('fotoDel');
setg('fotoList',(id,cb)=>cb(id==='pz'?[{id:'fpz',b64:'z'}]:[])); setg('fotoDel',(fid,cb)=>cb(true)); const _dbP25=g('_db'); if(g('USAR_NUVEM'))setg('_db',{});
A('processarPurgaFotos')();
t('L4: a limpeza dos 120 dias apaga a ENTRADA da lixeira junto com as fotos — inclusive do dono SEM foto (G2)', lixApagadas25.includes('pz') && lixApagadas25.includes('pv'), JSON.stringify(lixApagadas25));
/* [revisao lixeira, G3] venda restaurada depois da devolucao: prova real apita o dobro (estoque E lucro) */
setg('movs',[{id:'al1',tipo:'COMPRA',valor:100,qtd:1,situacao:'Em estoque',destino:'Vender'},{id:'vd1',tipo:'VENDA',valor:200,qtd:1,origemId:'al1',custoOrigem:100}]);
setg('_provaCache',null); const achados25=(A('provaReal')()||{}).A||[];
t('L4 (G3): venda vinculada a item que voltou pro estoque vira VERMELHO na prova real (valor contando duas vezes)', achados25.some(a=>a.sev==='vermelho'&&/DUAS vezes/.test(a.detalhe)), JSON.stringify(achados25.map(a=>[a.sev,a.titulo]).slice(0,4)));
setg('movs',[{id:'al2',tipo:'COMPRA',valor:100,qtd:1,situacao:'Vendido',destino:'Vender'},{id:'vd2',tipo:'VENDA',valor:200,qtd:1,origemId:'al2',custoOrigem:100}]); setg('_provaCache',null);
t('L4 (G3): vinculo sao (alvo Vendido) NAO apita o dobro', !(((A('provaReal')()||{}).A)||[]).some(a=>/DUAS vezes/.test(a.detalhe)));
setg('_db',_dbP25); setg('fotoList',_flOrig25); setg('fotoDel',_fdOrig25); setg('lixeiraApaga',_laOrig); setg('diarioReg',_drOrig);
t('L5: restaurar/limpar da lixeira estao na lista de toques protegidos', g('RE_GRAVA').test("lixeiraRestaura('a')") && g('RE_GRAVA').test("lixeiraApaga('a')"));
reset(); setg('excluidos',{}); setg('_fotosPurga',[]); setg('_lixCache',null); setg('tela','painel');

console.log('\n=== 26. diario (tela): quem fez o que, filtro por pessoa, erro avisa; gestos de criar registram ===');
const dia26=[]; const _dr26=g('diarioReg'); setg('diarioReg',(a)=>{dia26.push(a);});
ctx.confirm=()=>true; setg('excluidos',{});
setg('movs',[{id:'p1',tipo:'DESPESA',valor:10,status:'aberto',cat:'X'}]); A('marcarPago')('p1');
setg('movs',[{id:'j1',tipo:'COMPRA',valor:10,notaId:'nJ'},{id:'j2',tipo:'COMPRA',valor:5,notaId:'nJ'}]); A('desfazerNotaFaz')('nJ');
setg('movs',[{id:'s1',tipo:'COMPRA',valor:10,notaId:'nS'},{id:'s2',tipo:'COMPRA',valor:5,notaId:'nS'}]); A('separarDaNotaFaz')('s1');
setg('movs',[{id:'pd1',tipo:'COMPRA',valor:10,cat:'ETB',situacao:'Pedido',destino:'Vender'}]); A('chegouPedido')('pd1');
t('D26: pagar parcela, desfazer/separar nota e pedido-chegou registram no diario', dia26.includes('marcou pago')&&dia26.includes('desfez nota')&&dia26.includes('separou da nota')&&dia26.includes('marcou pedido chegado'), JSON.stringify(dia26));
/* [revisor-diario G1] gesto de LOTE = UM registro, nao um por item */
dia26.length=0; setg('excluidos',{}); setg('movs',Array.from({length:6},(_,i)=>({id:'lt'+i,tipo:'COMPRA',valor:1,cat:'C'+i})));
const _lgD=g('lixeiraGuarda'); setg('lixeiraGuarda',()=>{});
A('execExcl')('lt0','so');
t('D26 (lote): excluir 1 registra 1', dia26.filter(x=>x==='excluiu').length===1, JSON.stringify(dia26));
setg('movs',[{id:'nb1',tipo:'COMPRA',valor:1,notaId:'nB',notaNum:'9'},{id:'nb2',tipo:'COMPRA',valor:1,notaId:'nB'},{id:'nb3',tipo:'COMPRA',valor:1,notaId:'nB'},{id:'nb4',tipo:'COMPRA',valor:1,notaId:'nB'},{id:'nb5',tipo:'COMPRA',valor:1,notaId:'nB'}]);
dia26.length=0; A('excluirNotaInteira')('nB');
t('D26 (lote): nota inteira de 5 = UM registro agregado (nao 5)', dia26.length===1 && dia26[0]==='excluiu (nota inteira)', JSON.stringify(dia26));
setg('lixeiraGuarda',_lgD);

console.log('\n=== 27. cura de classe G1: restauracao viaja com SINAL e vence tumulo mais velho na fusao ===');
setg('excluidos',{}); setg('movs',[{id:'rx',tipo:'COMPRA',valor:10}]); setg('_fotosPurga',[]);
A('marcaExcluido')('rx');
t('G1c: excluir marca positivo (excluido)', A('estaExcluido')('rx') && +g('excluidos').rx>0);
A('desmarcaExcluido')('rx');
t('G1c: restaurar NAO apaga o registro — vira marca NEGATIVA e o item deixa de estar excluido', !A('estaExcluido')('rx') && +g('excluidos').rx<0, JSON.stringify(g('excluidos')));
const antigoPos27=Date.now()-3600000;
const fus1=A('mergeExcl')({rx:g('excluidos').rx},{rx:antigoPos27});
t('G1c (o ciclo que matava): a restauracao NOVA vence o tumulo VELHO do aparelho atrasado — o item sobrevive a fusao', +fus1.rx<0 && !( +fus1.rx>0 ), JSON.stringify(fus1));
const fus2=A('mergeExcl')({rx:-antigoPos27},{rx:Date.now()});
t('G1c: re-excluido DEPOIS da restauracao (no outro aparelho): o tumulo mais novo vence — o item morre, como deve', +fus2.rx>0, JSON.stringify(fus2));
setg('excluidos',{velhoNeg:-(Date.now()-121*864e5),velhoPos:Date.now()-121*864e5,novoPos:Date.now()}); setg('_fotosPurga',[]);
A('podaExcluidos')();
t('G1c: poda por |idade| — restauracao velha sai SEM alimentar a limpeza de fotos; exclusao velha sai ALIMENTANDO; novo fica', !('velhoNeg' in g('excluidos')) && !('velhoPos' in g('excluidos')) && ('novoPos' in g('excluidos')) && g('_fotosPurga').includes('velhoPos') && !g('_fotosPurga').includes('velhoNeg'), JSON.stringify(g('_fotosPurga')));
/* [red-team M-A] aparelho com relogio ADIANTADO carimbou o futuro: a idade conta a partir do MAIOR
   carimbo conhecido, senao a poda para pra sempre (tumulo imortal) e a foto do lancamento excluido
   nunca entra na fila de limpeza — a decisao de 25/08 morria em silencio */
const fut27=Date.now()+200*864e5;
setg('excluidos',{'nota:podreF':fut27-130*864e5,vivoF:fut27}); setg('_fotosPurga',[]);
A('podaExcluidos')();
t('G1c (relogio adiantado): a poda continua rodando — o velho-relativo sai e alimenta a fila, o novo fica', !('nota:podreF' in g('excluidos')) && ('vivoF' in g('excluidos')) && g('_fotosPurga').includes('podreF'), JSON.stringify(g('excluidos'))+' fila='+JSON.stringify(g('_fotosPurga')));
/* fiacao real, do lado do APARELHO ATRASADO (o ciclo que matava): o local ainda carrega o tumulo VELHO positivo;
   o snapshot chega com a restauracao NOVA (negativa) e o proprio item — com uniao, o positivo local vencia e o
   aparelho atrasado devorava o restaurado e subia a morte de volta */
setg('excluidos',{gz:Date.now()-7200000}); setg('movs',[]); setg('_baseH',{});
const r27={movs:[{id:'gz',tipo:'COMPRA',valor:5}],excluidos:{gz:-Date.now()},jogos:[],cats:[],cols:[],colsJ:{},colsG:{},pess:[],pgs:[],despCats:[],cadastros:[],contasBanc:[],codigosResolvidos:{}};
const f27=A('fundirComRemoto')(r27);
t('G1c (fiacao real): no aparelho ATRASADO, a restauracao nova do snapshot vence o tumulo velho local — o item entra e fica vivo', f27.movs.some(m=>m.id==='gz') && +f27.excluidos.gz<0, JSON.stringify(f27.excluidos)+' ids='+JSON.stringify(f27.movs.map(m=>m.id)));
/* [red-team G-1/M-4] a PORTA PRINCIPAL (aplicarNuvem, sem pendencia local) preserva o restaurado e roda a poda */
setg('_restaurando',false); setg('_syncReady',true); setg('_db',null); setg('_pendSeq',0); setg('_pendOk',0); delete store['tcg_pend_nuvem'];
setg('tela','painel'); setg('editId',null);
setg('excluidos',{x1:Date.now()-3600000,fossil:Date.now()-121*864e5}); setg('movs',[]); setg('_fotosPurga',[]);
A('aplicarNuvem')({_upd:9999,movs:[{id:'x1',tipo:'COMPRA',valor:7}],excluidos:{x1:-Date.now()}});
t('G1c (PORTA PRINCIPAL): snapshot com restauracao nova vence o tumulo velho local — item vivo, marca negativa, poda rodou', M().some(m=>m.id==='x1') && +g('excluidos').x1<0 && !('fossil' in g('excluidos')), JSON.stringify(g('excluidos'))+' ids='+JSON.stringify(M().map(m=>m.id)));
/* [red-team G-4] relogio atrasado: excluir DEPOIS de uma restauracao com carimbo "do futuro" ainda vence */
setg('excluidos',{sk:-(Date.now()+3600000)}); setg('movs',[{id:'sk',tipo:'COMPRA',valor:3}]);
A('marcaExcluido')('sk');
t('G1c (relogio): exclusao de agora vence marca do futuro (carimbo monotonico, independe do relogio)', A('estaExcluido')('sk') && +g('excluidos').sk>Date.now()+3600000-5, String(g('excluidos').sk));
setg('excluidos',{}); setg('_fotosPurga',[]); setg('movs',[]);
/* D5: apelidos de jogo no ligaDoJogo — exato, mtg, dragonball masters, containment; desconhecido = null */
t('D5: apelidos de jogo acham a Liga certa (mtg, Magic the Gathering, Pokemon TCG, DB Masters) e desconhecido segue null',
  A('ligaDoJogo')('mtg')===A('ligaDoJogo')('Magic') && /ligamagic/.test(A('ligaDoJogo')('Magic the Gathering')||'') && /ligapokemon/.test(A('ligaDoJogo')('Pokémon TCG')||'') && A('ligaDoJogo')('Dragon Ball Masters')==='masters.ligadragonball.com.br' && /fusion\.ligadragonball/.test(A('ligaDoJogo')('Dragon Ball Super')||'') && A('ligaDoJogo')('Lorcana')===null,
  JSON.stringify([A('ligaDoJogo')('Magic the Gathering'),A('ligaDoJogo')('Dragon Ball Masters'),A('ligaDoJogo')('Lorcana')]));
t('D26: os gestos de CRIAR estao ligados no fonte (lançou/editou/nota/venda-vários/troca/mover/restaurar)', /diarioReg\('lançou',rotDe\(obj\)/.test(src)&&/diarioReg\('editou',rotDe\(movs\[i\]\)/.test(src)&&/diarioReg\('lançou nota de compra'/.test(src)&&/diarioReg\('vendeu \(vários\)'/.test(src)&&/diarioReg\('registrou troca'/.test(src)&&/diarioReg\('moveu foto'/.test(src)&&/diarioReg\('restaurou ponto da nuvem'/.test(src));
setg('diarioReg',_dr26);
let htmlDia=''; const _insD=ctx.document.body.insertAdjacentHTML; ctx.document.body.insertAdjacentHTML=(p,h)=>{htmlDia=h;};
const elDia={innerHTML:''},elFil={innerHTML:''}; ctx.document.getElementById=(id)=>id==='diaLista'?elDia:(id==='diaFiltros'?elFil:_elCampo(id));
const _dlOrig=g('diarioLista'); const regs26=[{id:'a',ts:Date.now()-3600000,quem:'felype',acao:'lançou',alvo:'ETB'},{id:'b',ts:Date.now()-60000,quem:'laura',acao:'excluiu',alvo:'Box'},{id:'c',ts:Date.now(),quem:'laura',acao:'vendeu (vários)',alvo:'2 itens'}];
setg('diarioLista',cb=>cb(regs26.slice()));
A('abrirDiario')();
t('D26 tela: abre com os registros (hora · pessoa · acao) e chips de filtro por pessoa', /👣 Diário/.test(htmlDia) && /<b>laura<\/b>/.test(elDia.innerHTML) && /excluiu — Box/.test(elDia.innerHTML) && /felype/.test(elFil.innerHTML) && /todos/.test(elFil.innerHTML), elDia.innerHTML.slice(0,200));
A('filtraDiario')('laura');
t('D26 tela: filtrar por pessoa mostra so ela (e o chip dela acende)', !/<b>felype<\/b>/.test(elDia.innerHTML) && /excluiu — Box/.test(elDia.innerHTML) && /class="on" onclick="filtraDiario\('laura'\)/.test(elFil.innerHTML), elFil.innerHTML.slice(0,160));
setg('diarioLista',cb=>cb(null)); A('abrirDiario')();
t('D26 tela: leitura falhada AVISA (registros continuam guardados), nao finge vazio', /Não consegui ler o diário/.test(elDia.innerHTML), elDia.innerHTML.slice(0,120));
setg('diarioLista',cb=>cb([])); A('abrirDiario')();
t('D26 tela: vazio diz vazio', /Nada registrado ainda/.test(elDia.innerHTML));
setg('diarioLista',_dlOrig); ctx.document.body.insertAdjacentHTML=_insD; ctx.document.getElementById=()=>elStub();
t('D26: o Backup tem a porta do Diario', /fecharModal\(\);abrirDiario\(\)/.test(src) && /👣 Diário <span/.test(src));
reset(); setg('excluidos',{}); setg('tela','painel');

console.log('\n=== 18. sem internet: lancamento local sobrevive ao snapshot do outro aparelho (F0 22/08) ===');
/* Cenario real (revisor do mundo real, 22/08): Felype lanca sem sinal -> salvarNuvem falha (a
   transacao exige servidor) -> a Laura salva em casa -> quando o sinal volta, o snapshot dela
   chega com _upd diferente e, ate hoje, aplicarNuvem SUBSTITUIA os movs locais: o lancamento
   feito sem internet sumia em silencio. Dube de Firestore com transacao controlavel
   (offline/online); a secao e assincrona, por isso o placar final roda depois dela. */
let cloud18=null, offline18=true, txCalls18=0;
const ref18={};
const db18={collection(){return {doc(){return ref18;}};},
  runTransaction(fn){txCalls18++;
    if(offline18) return Promise.reject(new Error('Failed to get document because the client is offline.'));
    const tx={get(){return Promise.resolve({exists:!!cloud18,data:()=>cloud18});}, set(r,p){cloud18=p;}};
    return fn(tx);}};
const tick=()=>new Promise(r=>setImmediate(r));
const idsDe=L=>(L||[]).map(m=>m.id).join(',');
(async()=>{
  reset(); setg('_db',db18); setg('_syncReady',true); setg('_restaurando',false); setg('tela','painel'); setg('editId',null);
  setg('_pendSeq',0); setg('_pendOk',0); delete store['tcg_pend_nuvem'];
  setg('movs',[{id:'a1',tipo:'COMPRA',valor:10}]);
  cloud18={_upd:100,movs:[{id:'a1',tipo:'COMPRA',valor:10}],excluidos:{}};
  setg('_ultimoUpdAplicado',100);
  /* 1) lancamento sem rede: a pendencia fica marcada e a transacao falha */
  M().push({id:'b2',tipo:'COMPRA',valor:20});
  A('marcaPendNuvem')(); A('salvarNuvem')();
  await tick();
  t('sem rede, a marca de pendencia fica (memoria E disco)',
    A('pendNuvem')()===true && store['tcg_pend_nuvem']==='1', 'pend='+A('pendNuvem')()+' disco='+store['tcg_pend_nuvem']);
  /* 2) a rede voltou e o snapshot do OUTRO aparelho chega primeiro (ele lancou c3) */
  offline18=false; txCalls18=0;
  A('aplicarNuvem')({_upd:200,movs:[{id:'a1',tipo:'COMPRA',valor:10},{id:'c3',tipo:'COMPRA',valor:30}],excluidos:{}});
  t('o lancamento feito sem internet NAO sumiu', M().some(m=>m.id==='b2'), 'ids: '+idsDe(M()));
  t('o lancamento do outro aparelho entrou', M().some(m=>m.id==='c3'), 'ids: '+idsDe(M()));
  await tick();
  t('a uniao subiu pra nuvem em seguida', txCalls18>=1 && !!cloud18 && ['a1','b2','c3'].every(x=>(cloud18.movs||[]).some(m=>m.id===x)),
    'transacoes='+txCalls18+' nuvem='+idsDe(cloud18&&cloud18.movs));
  t('e a pendencia foi limpa (memoria E disco)', A('pendNuvem')()===false && !store['tcg_pend_nuvem'],
    'pend='+A('pendNuvem')()+' disco='+store['tcg_pend_nuvem']);
  /* 3) falso-positivo: sem pendencia, o snapshot manda (substitui, como sempre) */
  A('aplicarNuvem')({_upd:300,movs:[{id:'a1',tipo:'COMPRA',valor:10}],excluidos:{}});
  t('sem pendencia, o snapshot substitui (a nuvem manda)', M().length===1 && M()[0].id==='a1', 'ids: '+idsDe(M()));
  /* 4) tumulo do outro lado vale ANTES de unir: o que a Laura apagou nao ressuscita pela pendencia */
  setg('movs',[{id:'a1',tipo:'COMPRA',valor:10},{id:'z9',tipo:'COMPRA',valor:9},{id:'n7',tipo:'COMPRA',valor:7}]);
  A('marcaPendNuvem')();
  A('aplicarNuvem')({_upd:400,movs:[{id:'a1',tipo:'COMPRA',valor:10}],excluidos:{z9:Date.now()}});
  t('item apagado no outro aparelho nao ressuscita pela pendencia', !M().some(m=>m.id==='z9'), 'ids: '+idsDe(M()));
  t('e o lancamento local novo continua', M().some(m=>m.id==='n7'), 'ids: '+idsDe(M()));
  await tick();
  /* 5) dois saves em voo: o commit do 1o nao limpa a pendencia do 2o */
  setg('_pendSeq',0); setg('_pendOk',0);
  A('marcaPendNuvem')(); A('limpaPendNuvem')(1);
  t('commit do proprio seq limpa a pendencia', A('pendNuvem')()===false && !store['tcg_pend_nuvem']);
  A('marcaPendNuvem')(); A('marcaPendNuvem')(); A('limpaPendNuvem')(2);
  t('commit antigo NAO limpa mudanca mais nova', A('pendNuvem')()===true && store['tcg_pend_nuvem']==='1');
  A('limpaPendNuvem')(3);
  t('commit do ultimo limpa tudo', A('pendNuvem')()===false && !store['tcg_pend_nuvem']);
  /* 6) a porta antiga (salvarNuvem) tambem aplica o tumulo remoto ANTES de unir */
  setg('movs',[{id:'a1'},{id:'z9'}]); setg('excluidos',{});
  const f6=A('fundirComRemoto')({movs:[{id:'a1'}],excluidos:{z9:Date.now()}});
  t('fusao: tumulo remoto vale antes da uniao (nao ressuscita z9)', !f6.movs.some(m=>m.id==='z9') && f6.movs.some(m=>m.id==='a1'), 'ids: '+idsDe(f6.movs));
  setg('_db',null); setg('_syncReady',false); setg('excluidos',{});

  /* ===== 19. fatia 0 — ajustes da revisao adversarial de 23/08 (G1/G2/G3/M2/M3) ===== */
  console.log('\n=== 19. fatia 0, revisao 23/08: fiacao do save, boot com a marca no disco, save durante o commit ===');
  /* (M3-i) a FIACAO: save()/saveL()/setGrupoCol marcam a pendencia — so no modo NUVEM (arquivo de deploy).
     O revisor mostrou que tirar marcaPendNuvem() do saveL passava verde: a secao 18 chamava tudo na mao. */
  reset(); setg('_pendSeq',0); setg('_pendOk',0); delete store['tcg_pend_nuvem'];
  setg('_db',null); setg('_syncReady',false); setg('colsG',{});
  A('save')(); A('saveL')(); A('setGrupoCol')('Pokémon','Col Teste','Grupo T');
  if(g('USAR_NUVEM')){
    t('modo nuvem: save()+saveL()+setGrupoCol marcam pendencia (memoria E disco)', g('_pendSeq')===3 && store['tcg_pend_nuvem']==='1', 'seq='+g('_pendSeq')+' disco='+store['tcg_pend_nuvem']);
  }else{
    t('modo local: save()/saveL()/setGrupoCol NAO tocam na pendencia', g('_pendSeq')===0 && !store['tcg_pend_nuvem'], 'seq='+g('_pendSeq'));
  }
  /* (G2) memoria do aparelho cheia: a marca tem de passar pela escada de poda do gravaLocal —
     um setItem cru engolia o erro, o lancamento ficava no disco e a marca nao, e ao reabrir o
     1o snapshot apagava o lancamento sem rede em silencio. Dube: a cota so abre depois que os
     pontos de restauracao locais (tcg_backups) forem podados a 3. */
  setg('_pendSeq',0); setg('_pendOk',0); delete store['tcg_pend_nuvem'];
  store['tcg_backups']=JSON.stringify([{t:1},{t:2},{t:3},{t:4},{t:5}]);
  const _setOrig=ctx.localStorage.setItem;
  ctx.localStorage.setItem=(k,v)=>{if(k!=='tcg_backups'&&JSON.parse(store['tcg_backups']||'[]').length>3){const e=new Error('QuotaExceededError');e.name='QuotaExceededError';throw e;}store[k]=String(v);};
  setg('_avisouPoda',false);
  A('marcaPendNuvem')();
  ctx.localStorage.setItem=_setOrig;
  t('G2: com a memoria cheia, a marca de pendencia ainda chega ao disco (poda abriu espaco)', store['tcg_pend_nuvem']==='1', 'disco='+store['tcg_pend_nuvem']+' backups='+(store['tcg_backups']||'').length);
  t('G2: a poda deixou so os 3 pontos mais recentes deste aparelho', JSON.parse(store['tcg_backups']||'[]').length===3);
  delete store['tcg_backups']; delete store['tcg_pend_nuvem']; setg('_pendSeq',0);
  /* (M3-ii + G1) reabrir o app com a marca no disco e copia local VELHA: o 1o snapshot FUNDE (o
     lancamento sem rede, id so local, sobrevive) e o que o OUTRO aparelho editou VENCE a copia velha. */
  function novoContexto(storeInit){
    const st2=Object.assign({},storeInit||{});
    const c2=Object.assign({},ctx);
    c2.localStorage={getItem:k=>(k in st2?st2[k]:null),setItem:(k,v)=>{st2[k]=String(v);},removeItem:k=>{delete st2[k];},clear:()=>{for(const k in st2)delete st2[k];}};
    c2.window=c2;c2.globalThis=c2;c2.self=c2;
    vm.createContext(c2);
    vm.runInContext(src,c2,{filename:'app-reaberto.js'});
    return {ctx:c2,store:st2,g:n=>vm.runInContext(n,c2),set:(n,v)=>{c2.__tmp=v;vm.runInContext(n+' = __tmp;',c2);}};
  }
  /* tcg_seed_v1: o arquivo de DEV carrega o acervo de exemplo num disco sem essa marca e
     sobrescreveria os movs do cenario (o de deploy tem SEED vazio) — um aparelho reaberto
     de verdade sempre tem a marca. */
  const R2=novoContexto({'tcg_pend_nuvem':'1','tcg_seed_v1':'1',
    'tcg_movs_v2':JSON.stringify([{id:'a1',tipo:'COMPRA',valor:10,situacao:'Em estoque'},{id:'off1',tipo:'COMPRA',valor:5}]),
    'tcg_excluidos':'{}'});
  t('reaberto com a marca no disco: pendencia ligada no boot', R2.g('pendNuvem()')===true, 'seq='+R2.g('_pendSeq')+' ok='+R2.g('_pendOk'));
  t('reaberto: os movs locais (com o feito sem rede) vieram do disco', R2.g('movs').some(m=>m.id==='off1'), 'ids: '+idsDe(R2.g('movs')));
  R2.set('_syncReady',true); R2.set('_restaurando',false); R2.set('_db',null); R2.set('tela','painel'); R2.set('editId',null);
  vm.runInContext("aplicarNuvem({_upd:777,movs:[{id:'a1',tipo:'COMPRA',valor:10,situacao:'Vendido'}],excluidos:{}})",R2.ctx);
  const mv2=R2.g('movs');
  t('1o snapshot FUNDE em vez de substituir: o lancamento feito sem rede sobrevive', mv2.some(m=>m.id==='off1'), 'ids: '+idsDe(mv2));
  t('G1: a edicao feita no OUTRO aparelho vence a copia velha daqui (remoto vence o empate)', (mv2.find(m=>m.id==='a1')||{}).situacao==='Vendido', JSON.stringify(mv2.find(m=>m.id==='a1')));
  t('reaberto: o disco dele recebeu a uniao', JSON.parse(R2.store['tcg_movs_v2']||'[]').some(m=>m.id==='off1'));
  /* (G3) lancamento feito DURANTE a ida-e-volta do commit nao e apagado pelo .then da transacao */
  reset(); setg('_restaurando',false); setg('tela','painel'); setg('editId',null);
  setg('_pendSeq',0); setg('_pendOk',0); delete store['tcg_pend_nuvem'];
  let commitLibera=null, cloud19={_upd:500,movs:[{id:'a1',tipo:'COMPRA',valor:10},{id:'r7',tipo:'COMPRA',valor:7}],excluidos:{}};
  const db19={collection(){return {doc(){return {};}};},
    runTransaction(fn){const tx={get(){return Promise.resolve({exists:true,data:()=>cloud19});},set(r,p){cloud19=p;}};
      return fn(tx).then(p=>new Promise(res=>{commitLibera=()=>res(p);}));}};
  setg('_db',db19); setg('_syncReady',true); setg('_ultimoUpdAplicado',1);
  /* [re-checagem F2] a fiacao: o commit bem-sucedido da nuvem e quem ACORDA a retomada dos moves pendentes */
  const _retOrig19=g('retomarMovesPendentes'); let retomou19=0; setg('retomarMovesPendentes',()=>{retomou19++;});
  setg('movs',[{id:'a1',tipo:'COMPRA',valor:10},{id:'b2',tipo:'COMPRA',valor:20}]);
  A('marcaPendNuvem')(); A('salvarNuvem')();
  await tick();
  M().push({id:'novo1',tipo:'COMPRA',valor:1}); A('marcaPendNuvem')();
  t('G3 cenario: commit ainda em voo quando o dono lancou', typeof commitLibera==='function');
  if(commitLibera)commitLibera(); await tick();
  t('G3: o lancamento feito durante o commit NAO foi apagado da memoria', M().some(m=>m.id==='novo1'), 'ids: '+idsDe(M()));
  t('G3: ...nem do disco', JSON.parse(store['tcg_movs_v2']||'[]').some(m=>m.id==='novo1'));
  t('G3: e o que o outro aparelho tinha (r7) entrou', M().some(m=>m.id==='r7'), 'ids: '+idsDe(M()));
  t('G3: a pendencia do save do meio continua marcada (commit antigo nao a limpa)', A('pendNuvem')()===true);
  t('re-checagem F2: o commit bem-sucedido da nuvem chamou a retomada dos moves pendentes (fiacao real, nao chamada direta)', retomou19===1, 'chamadas='+retomou19);
  setg('retomarMovesPendentes',_retOrig19);
  /* (M2) transacao que falha DEPOIS do callback nao deixa tumulo remoto "adiantado" na memoria */
  setg('movs',[{id:'a1',tipo:'COMPRA',valor:10},{id:'z9',tipo:'COMPRA',valor:9}]); setg('excluidos',{});
  cloud19={_upd:600,movs:[{id:'a1',tipo:'COMPRA',valor:10}],excluidos:{z9:Date.now()}};
  const db19b={collection(){return {doc(){return {};}};},
    runTransaction(fn){const tx={get(){return Promise.resolve({exists:true,data:()=>cloud19});},set(){}};
      return fn(tx).then(()=>Promise.reject(new Error('commit falhou')));}};
  setg('_db',db19b); setg('_ultimoUpdAplicado',1);
  A('salvarNuvem')(); await tick();
  t('M2: commit falhou -> o registro de exclusao NAO foi adiantado na memoria', Object.keys(g('excluidos')).length===0, JSON.stringify(g('excluidos')));
  t('M2: e o item continua na tela (nao virou fantasma)', M().some(m=>m.id==='z9'), 'ids: '+idsDe(M()));
  /* (N1, re-checagem 23/08) operacao COMPOSTA feita sem rede (baixa de lote: pai editado + pedaco novo)
     nao pode ser rasgada pela fusao. Com a BASE CONFIRMADA (hash por registro): o pai mudou AQUI desde a
     ultima confirmacao -> local vence; o que NAO mudou aqui -> remoto vence (G1 continua curado). */
  reset(); setg('_restaurando',false); setg('tela','painel'); setg('editId',null); setg('_db',null); setg('_syncReady',false);
  setg('_pendSeq',0); setg('_pendOk',0); delete store['tcg_pend_nuvem'];
  setg('movs',[{id:'c1',tipo:'COMPRA',qtd:10,valor:1000,situacao:'Em estoque',destino:'Vender'},{id:'a1',tipo:'COMPRA',valor:10,situacao:'Em estoque'}]);
  A('gravaBaseConfirmada')({movs:g('movs')});
  t('base confirmada gravada (memoria E disco)', g('_baseH').c1!==undefined && /c1/.test(store['tcg_base_h']||''));
  const pedN1=A('baixarLote')('c1',2,'Vendido',{dataVenda:'2026-08-23'});
  A('marcaPendNuvem')(); setg('_syncReady',true);
  A('aplicarNuvem')({_upd:900,movs:[{id:'c1',tipo:'COMPRA',qtd:10,valor:1000,situacao:'Em estoque',destino:'Vender'},{id:'a1',tipo:'COMPRA',valor:10,situacao:'Vendido'},{id:'outro',tipo:'COMPRA',qtd:1,valor:50}],excluidos:{}});
  const c1N1=M().find(m=>m.id==='c1'),somaQ=M().filter(m=>m.tipo==='COMPRA').reduce((s,m)=>s+(+m.qtd||1),0);
  t('N1: o pai da baixa feita sem rede continua baixado (qtd 8 / R$800), nao voltou a 10/1000', !!c1N1&&+c1N1.qtd===8&&+c1N1.valor===800, JSON.stringify(c1N1));
  t('N1: o pedaco novo continua', !!pedN1&&M().some(m=>m.id===pedN1.id), 'ids: '+idsDe(M()));
  t('N1: o total de unidades fecha (8+2+1+1=12), sem inventar estoque', somaQ===12, 'soma='+somaQ+' ids: '+idsDe(M()));
  t('G1 continua: o item que NAO mudou aqui recebe a edicao do outro aparelho', (M().find(m=>m.id==='a1')||{}).situacao==='Vendido', JSON.stringify(M().find(m=>m.id==='a1')));
  /* sem base (1a sessao depois da atualizacao): o pai referenciado por registro novo ainda vence */
  setg('_baseH',{}); setg('movs',[{id:'c2',tipo:'COMPRA',qtd:8,valor:800,situacao:'Em estoque'},{id:'p2',tipo:'COMPRA',qtd:2,valor:200,situacao:'Vendido',loteOrigem:'c2'}]);
  A('marcaPendNuvem')();
  A('aplicarNuvem')({_upd:901,movs:[{id:'c2',tipo:'COMPRA',qtd:10,valor:1000,situacao:'Em estoque'}],excluidos:{}});
  const c2N1=M().find(m=>m.id==='c2');
  t('N1 sem base: pai referenciado pelo pedaco novo vence (8/800)', !!c2N1&&+c2N1.qtd===8&&+c2N1.valor===800, JSON.stringify(c2N1));
  /* snapshot sem pendencia grava a base confirmada */
  setg('_pendSeq',0); setg('_pendOk',0); delete store['tcg_pend_nuvem'];
  A('aplicarNuvem')({_upd:950,movs:[{id:'q1',tipo:'COMPRA',valor:1}],excluidos:{}});
  t('snapshot sem pendencia grava a base confirmada (memoria e disco)', g('_baseH').q1!==undefined && /q1/.test(store['tcg_base_h']||''), JSON.stringify(g('_baseH')));
  /* (N3, re-checagem 2) o hash enxerga mudanca DENTRO de objeto aninhado e ignora a ordem das chaves */
  t('N3: hash muda quando uma parcela e paga (objeto aninhado)', A('hashReg')({id:'c1',pgParcelas:{}})!==A('hashReg')({id:'c1',pgParcelas:{0:{d:'2026-08-01',v:35}}}));
  t('N3: hash nao depende da ordem das chaves (em qualquer nivel)', A('hashReg')({a:1,b:{x:1,y:2}})===A('hashReg')({b:{y:2,x:1},a:1}));
  /* (N2, re-checagem 2) a base guarda o que SUBIU no commit, nao o objeto vivo de depois: correcao feita
     durante a ida-e-volta do commit continua "mudei aqui" (hash != base) e sobrevive a fusao seguinte */
  reset(); setg('_restaurando',false); setg('tela','painel'); setg('editId',null);
  setg('_pendSeq',0); setg('_pendOk',0); delete store['tcg_pend_nuvem']; setg('_baseH',{});
  let commitN2=null, cloudN2={_upd:50,movs:[{id:'x1',tipo:'COMPRA',valor:100,obs:'A'}],excluidos:{}};
  const dbN2={collection(){return {doc(){return {};}};},
    runTransaction(fn){const tx={get(){return Promise.resolve({exists:true,data:()=>cloudN2});},set(r,p){cloudN2=JSON.parse(JSON.stringify(p));}};
      return fn(tx).then(p=>new Promise(res=>{commitN2=()=>res(p);}));}};
  setg('_db',dbN2); setg('_syncReady',true); setg('_ultimoUpdAplicado',50);
  setg('movs',[{id:'x1',tipo:'COMPRA',valor:100,obs:'A'}]);
  A('marcaPendNuvem')(); A('salvarNuvem')();
  await tick();
  const hashA=A('hashReg')({id:'x1',tipo:'COMPRA',valor:100,obs:'A'});
  M()[0].obs='CORRIGI SEM REDE'; M()[0].valor=175; A('marcaPendNuvem')();   /* correcao no meio do commit; o save dela cai sem rede */
  t('N2 cenario: commit ainda em voo quando a correcao foi feita', typeof commitN2==='function');
  if(commitN2)commitN2(); await tick();
  t('N2: a base guardou o que SUBIU (obs A), nao o objeto vivo corrigido', g('_baseH').x1===hashA && g('_baseH').x1!==A('hashReg')(M()[0]), 'base='+g('_baseH').x1+' hashA='+hashA+' hashAgora='+A('hashReg')(M()[0]));
  A('aplicarNuvem')({_upd:60,movs:[{id:'x1',tipo:'COMPRA',valor:100,obs:'A'},{id:'y1',tipo:'COMPRA',valor:1}],excluidos:{}});
  t('N2: na fusao seguinte a correcao feita sem rede SOBREVIVE (local mudou desde a base)', (M().find(m=>m.id==='x1')||{}).obs==='CORRIGI SEM REDE' && +(M().find(m=>m.id==='x1')||{}).valor===175, JSON.stringify(M().find(m=>m.id==='x1')));
  await tick();
  /* (N4, re-checagem 2) sem base: troca feita sem rede (item dado vira Trocado + recebido novo, ligados
     so pelo trocaId) nao pode ficar com os dois em estoque */
  setg('_db',null); setg('_syncReady',false); setg('_baseH',{}); setg('_pendSeq',0); setg('_pendOk',0); delete store['tcg_pend_nuvem'];
  setg('movs',[{id:'d1',tipo:'COMPRA',qtd:1,valor:80,situacao:'Trocado',trocaId:'t1',deu:true},{id:'r1',tipo:'COMPRA',qtd:1,valor:80,situacao:'Em estoque',trocaId:'t1'}]);
  A('marcaPendNuvem')(); setg('_syncReady',true);
  A('aplicarNuvem')({_upd:70,movs:[{id:'d1',tipo:'COMPRA',qtd:1,valor:80,situacao:'Em estoque'}],excluidos:{}});
  const d1N4=M().find(m=>m.id==='d1');
  t('N4 sem base: o item DADO na troca feita sem rede continua Trocado (nao volta ao estoque)', !!d1N4&&d1N4.situacao==='Trocado', JSON.stringify(d1N4));
  t('N4 sem base: o item recebido continua', M().some(m=>m.id==='r1'));
  t('N4 sem base: nao ficou com os dois em estoque', M().filter(m=>m.situacao==='Em estoque').length===1, 'ids em estoque: '+idsDe(M().filter(m=>m.situacao==='Em estoque')));
  /* (N4-1) primeiro boot depois da atualizacao, sem base e sem pendencia: grava a base do estado local (modo nuvem) */
  const R3=novoContexto({'tcg_seed_v1':'1','tcg_movs_v2':JSON.stringify([{id:'k1',tipo:'COMPRA',valor:9}]),'tcg_excluidos':'{}'});
  if(g('USAR_NUVEM')){
    t('N4-1 (nuvem): boot sem base e sem pendencia grava a base do estado local', R3.g('_baseH').k1!==undefined && /k1/.test(R3.store['tcg_base_h']||''), JSON.stringify(R3.g('_baseH')));
  }else{
    t('N4-1 (local): sem nuvem nao grava base', !R3.store['tcg_base_h']);
  }
  /* (N5, re-checagem 3) restaurar um ponto da nuvem com a subida falhando: o snapshot seguinte NAO pode
     desfazer a restauracao. Sequencia do restaurarPontoNuvem (2763+) reproduzida aqui porque o modal e
     a gravacao previa do ponto exigiriam dublar a subcolecao inteira; a linha do remendo e conferida
     tambem pelo build (texto). */
  reset(); setg('_restaurando',false); setg('tela','painel'); setg('editId',null);
  setg('movs',[{id:'p1',tipo:'COMPRA',valor:900,obs:'HOJE'}]); setg('excluidos',{});
  A('gravaBaseConfirmada')({movs:g('movs')});                    /* estado confirmado pela nuvem = HOJE */
  const hashHoje=A('hashReg')(M()[0]);
  const ponto={movs:[{id:'p1',tipo:'COMPRA',valor:100,obs:'ORIGINAL'}],excluidos:{}};
  /* dube da subcolecao de pontos: guarda o ponto 777 e responde ao get/set/orderBy/limit; a transacao
     (subida) FALHA — e o cenario do N5 */
  const pontosN5={'777':{ts:777,n:1,quem:'',dados:JSON.stringify(ponto)}};
  const refP={doc(id){return {get(){return Promise.resolve({exists:!!pontosN5[id],data:()=>pontosN5[id]});},set(p){pontosN5[id]=p;return Promise.resolve();},delete(){delete pontosN5[id];return Promise.resolve();}};},
    orderBy(){return refP;},limit(){return refP;},get(){return Promise.resolve({forEach(){},docs:[],size:0});}};
  const docDados={collection(){return refP;},get(){return Promise.resolve({exists:false,data:()=>({})});},set(){return Promise.resolve();}};
  setg('_db',{collection(){return {doc(){return docDados;}};},runTransaction(){return Promise.reject(new Error('offline'));}}); setg('_syncReady',true);
  setg('_pendSeq',3); setg('_pendOk',0); setg('_restaurando',false);
  A('restaurarPontoNuvem')(777);                                  /* a porta REAL: confirm -> pre-salva -> le o ponto -> aplica */
  for(let i=0;i<6;i++)await tick();
  t('N5: o ponto foi restaurado de verdade pela funcao (obs ORIGINAL)', (M().find(m=>m.id==='p1')||{}).obs==='ORIGINAL', JSON.stringify(M()));
  t('N5: depois de restaurar, a base continua sendo a anterior (o ponto NAO vira "confirmado")', g('_baseH').p1===hashHoje, 'base='+g('_baseH').p1+' hoje='+hashHoje);
  setg('_restaurando',false);                                     /* o timer de 3 s do app (stub de setTimeout nao dispara) */
  A('marcaPendNuvem')(); A('salvarNuvem')(); await tick();        /* a subida falhou (offline) */
  A('aplicarNuvem')({_upd:80,movs:[{id:'p1',tipo:'COMPRA',valor:900,obs:'HOJE'}],excluidos:{}});
  t('N5: o snapshot seguinte NAO desfaz a restauracao (o ponto restaurado sobrevive)', (M().find(m=>m.id==='p1')||{}).obs==='ORIGINAL', JSON.stringify(M().find(m=>m.id==='p1')));
  /* (M2, revisao C 23/08) a FIACAO do contador de pendencias: com o precos.json chegando COM sucesso, a marca
     `_precosTentado` tem de ligar (a versao anterior so ligava no caminho de falha, e o Painel ficava em
     "conferindo…" ate algo mais repintar) — contexto novo com fetch que resolve */
  const fetchOrig=ctx.fetch;
  ctx.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({cartas:{},atualizadoEm:'2026-08-23'})});
  const R4=novoContexto({'tcg_seed_v1':'1','tcg_movs_v2':'[]','tcg_excluidos':'{}'});
  ctx.fetch=fetchOrig;
  for(let i=0;i<6;i++)await tick();
  t('M2: precos carregados com sucesso -> a marca de "precos tentados" liga', R4.g('_precosTentado')===true && !!R4.g('_precosLiga'), 'tentado='+R4.g('_precosTentado')+' liga='+!!R4.g('_precosLiga'));
  R4.set('tela','painel');
  t('M2: e o Painel deixa de dizer "conferindo…"', !/conferindo…/.test(R4.g('vPainel()')));
  /* ===== 21. fotos F1 — P0-1..P0-4 (revisao adversarial do desenho das fotos, 22/08) ===== */
  console.log('\n=== 21. fotos F1: ler fotos sem rede nao zera contador; foto so conta depois de gravada; venda 1<->varios troca o balde ===');
  reset(); setg('_restaurando',false); setg('tela','painel'); setg('editId',null); setg('_syncReady',true);
  setg('movs',[{id:'m1',tipo:'COMPRA',valor:10,nFotos:3,fotoThumb:'data:thumb'}]);
  let gravouMK=0; const _gravaOrig=g('gravaLocal'); setg('gravaLocal',(k,v)=>{if(k==='tcg_movs_v2')gravouMK++;return true;});
  let modoF='reject', setOk=true;
  const fotosRef=()=>({where(){return {get(){
      if(modoF==='reject')return Promise.reject(new Error('Failed to get documents: client is offline'));
      if(modoF==='vazioCache')return Promise.resolve({metadata:{fromCache:true},empty:true,forEach(){}});
      if(modoF==='vazioServidor')return Promise.resolve({metadata:{fromCache:false},empty:true,forEach(){}});
      return Promise.resolve({metadata:{fromCache:false},empty:false,forEach(f){[{id:'f1',data:()=>({movId:'m1',b64:'data:x',ts:1})}].forEach(f);}});}};},
    doc(){return {set(){return setOk?Promise.resolve():Promise.reject(new Error('permission-denied'));}};}});
  setg('_db',{collection(){return {doc(){return {collection(){return fotosRef();}};}};},runTransaction(){return Promise.resolve();}});
  const m1=()=>M().find(m=>m.id==='m1');
  A('fotoRefresh')('m1'); await tick();
  t('P0-1: leitura que FALHA (sem rede / sem storage) nao zera contador nem miniatura, nem grava', m1().nFotos===3 && m1().fotoThumb==='data:thumb' && gravouMK===0, JSON.stringify(m1())+' gravouMK='+gravouMK);
  if(g('USAR_NUVEM')){
    modoF='vazioCache'; A('fotoRefresh')('m1'); await tick();
    t('P0-1 (nuvem): vazio servido do CACHE e "nao sei" — nao zera', m1().nFotos===3 && m1().fotoThumb==='data:thumb', JSON.stringify(m1()));
    modoF='vazioServidor'; A('fotoRefresh')('m1'); await tick();
    t('P0-1 (nuvem): vazio confirmado pelo SERVIDOR zera (comportamento legitimo mantido) e grava 1x', m1().nFotos===0 && !m1().fotoThumb && gravouMK===1, JSON.stringify(m1())+' gravouMK='+gravouMK);
    /* P0-3: visor aberto com o contador ja certo nao grava (a miniatura depende de Image.onload, que o dube nao dispara) */
    setg('movs',[{id:'m1',tipo:'COMPRA',valor:10,nFotos:1,fotoThumb:'data:thumb'}]); gravouMK=0; modoF='umaFoto';
    A('fotoRefresh')('m1'); await tick();
    t('P0-3 (nuvem): abrir o visor com tudo igual nao grava', gravouMK===0, 'gravouMK='+gravouMK);
  }
  /* P0-2: a foto so conta depois de gravada; recusa devolve ao balde */
  setg('movs',[{id:'m2',tipo:'COMPRA',valor:10}]); setg('_fotosPend',['data:a','data:b']);
  const m2=()=>M().find(m=>m.id==='m2');
  setg('_fotosFalhadas',[]);
  if(g('USAR_NUVEM')){
    setOk=false; A('aplicarFotosPend')('m2'); await tick();
    t('P0-2 (nuvem): nuvem RECUSOU -> as fotos vao para a fila DO LANCAMENTO (nao pro balde da tela) e o contador NAO sobe',
      g('_fotosPend').length===0 && g('_fotosFalhadas').length===2 && g('_fotosFalhadas').every(f=>f.movId==='m2') && !(+m2().nFotos),
      'balde='+g('_fotosPend').length+' fila='+JSON.stringify(g('_fotosFalhadas').map(f=>f.movId))+' nFotos='+m2().nFotos);
    /* o dono saiu da tela e lancou outra coisa: a foto recusada NAO cola no lancamento seguinte */
    setg('_fotosPend',['OUTRA']); M().push({id:'m3',tipo:'COMPRA',valor:1}); A('aplicarFotosPend')('m3'); await tick();
    t('P0-2 (nuvem): recusa antiga nao contamina o lancamento seguinte (fila continua do m2; m3 recebeu so a dele)',
      g('_fotosFalhadas').filter(f=>f.movId==='m2').length===2 && g('_fotosFalhadas').filter(f=>f.movId==='m3').length===1, JSON.stringify(g('_fotosFalhadas').map(f=>f.movId)));
    /* modoF='reject': o dube de LISTAGEM nao sabe das fotos recem-gravadas; com a listagem indisponivel o
       fotoRefresh nao toca no contador (P0-1), e o contador vem so do sucesso da gravacao — que e o que se testa */
    modoF='reject'; setOk=true; const nRe=A('reenviarFotosFalhadas')('m2'); await tick();
    t('P0-2 (nuvem): reenviar para o m2 grava as 2 e o contador vira 2; a do m3 continua na fila', nRe===2 && +m2().nFotos===2 && g('_fotosFalhadas').length===1 && g('_fotosFalhadas')[0].movId==='m3', 'nFotos='+m2().nFotos+' fila='+JSON.stringify(g('_fotosFalhadas').map(f=>f.movId)));
    A('reenviarFotosFalhadas')(); await tick();
    t('P0-2 (nuvem): reenvio geral (commit bem-sucedido) esvazia a fila e conta no m3', g('_fotosFalhadas').length===0 && +(M().find(m=>m.id==='m3').nFotos)===1);
  }else{
    A('aplicarFotosPend')('m2'); await tick();
    t('P0-2 (local sem storage): recusa vai para a fila DO LANCAMENTO (nao pro balde) e NAO conta', g('_fotosPend').length===0 && g('_fotosFalhadas').length===2 && g('_fotosFalhadas').every(f=>f.movId==='m2') && !(+m2().nFotos), 'balde='+g('_fotosPend').length+' fila='+g('_fotosFalhadas').length+' nFotos='+m2().nFotos);
  }
  /* o visor do lancamento com fila mostra o aviso de reenvio */
  setg('_fotosFalhadas',[{movId:'m2',b64:'x',ts:1}]); let htmlVisor=''; const _insOrig=ctx.document.body.insertAdjacentHTML; ctx.document.body.insertAdjacentHTML=(p,h)=>{htmlVisor=h;};
  A('abrirFotos')('m2'); ctx.document.body.insertAdjacentHTML=_insOrig;
  t('P0-2: o visor do lancamento com foto na fila mostra "nao foi gravada — toque para reenviar"', /não foi gravada — toque para reenviar/.test(htmlVisor) && /reenviarFotosFalhadas\('m2'\)/.test(htmlVisor), htmlVisor.slice(0,0));
  /* R-1 (re-checagem F1): reenviar SEM resposta (pendurado) mantem a foto na fila (marcada "enviando") — a faixa nao some
     sem ter gravado; chamada dobrada nao reenvia a mesma foto; recusa libera para nova tentativa */
  setg('movs',[{id:'m5',tipo:'COMPRA',valor:5}]); setg('_fotosFalhadas',[{movId:'m5',b64:'pend',ts:1}]);
  let envios=0, cbPend=null; const _fotoAddReal=g('fotoAdd');
  setg('fotoAdd',(movId,b64,cb)=>{envios++;cbPend=cb;});
  const n1=A('reenviarFotosFalhadas')('m5'), n2=A('reenviarFotosFalhadas')('m5');
  t('R-1: com o envio pendurado a foto CONTINUA na fila (marcada enviando) e a 2a chamada nao reenvia', n1===1 && n2===0 && envios===1 && g('_fotosFalhadas').length===1 && g('_fotosFalhadas')[0].enviando===true, 'n1='+n1+' n2='+n2+' envios='+envios+' fila='+JSON.stringify(g('_fotosFalhadas')));
  cbPend(false);
  t('R-1: recusa libera a foto para nova tentativa (continua na fila, sem "enviando")', g('_fotosFalhadas').length===1 && !g('_fotosFalhadas')[0].enviando);
  A('reenviarFotosFalhadas')('m5'); cbPend(true);
  t('R-1: sucesso tira da fila e conta', g('_fotosFalhadas').length===0 && +(M().find(m=>m.id==='m5').nFotos)===1);
  setg('fotoAdd',_fotoAddReal);
  /* R-2: o caminho automatico (salvar com foto no balde / reenvio da fila) nao abre alerta bloqueante quando a nuvem
     recusa — o alerta e so da acao direta (fotoEscolhida) */
  if(g('USAR_NUVEM')){
    let alertas=0; const _alertOrig=ctx.alert; ctx.alert=()=>{alertas++;};
    setg('movs',[{id:'m6',tipo:'COMPRA',valor:6}]); setg('_fotosPend',['fz']); setOk=false;
    A('aplicarFotosPend')('m6'); await tick();
    A('reenviarFotosFalhadas')(); await tick();
    t('R-2 (nuvem): recusa no salvar e no reenvio automatico NAO abre alerta (fila + faixa ja avisam)', alertas===0 && g('_fotosFalhadas').length===1, 'alertas='+alertas+' fila='+g('_fotosFalhadas').length);
    A('fotoAdd')('m6','direto',()=>{},false); await tick();
    t('R-2 (nuvem): a acao direta do dono continua alertando', alertas===1, 'alertas='+alertas);
    ctx.alert=_alertOrig; setOk=true;
  }
  setg('_fotosPend',[]); setg('_fotosEmVoo',[]); setg('_fotosFalhadas',[]);
  /* P0-4: alternar 1 item <-> varios na VENDA troca a identidade do balde (a foto da carta em digitacao vai embora, com aviso) */
  setg('tela','lancar'); setg('tipoSel','VENDA'); setg('compraModo','item'); setg('editId',null); setg('vendaModo','item'); setg('_fotosItem',[]);
  A('render')(); setg('_fotosItem',['UMA']); setg('vendaModo','varios'); A('render')();
  t('P0-4: alternar 1 item <-> varios na venda descarta o balde da carta (identidade mudou)', g('_fotosItem').length===0, 'balde='+g('_fotosItem').length);
  setg('vendaModo','item'); setg('tela','painel');
  /* ===== F5a: a fila de foto recusada tem casa no aparelho — entra no cofre ao ser recusada, sai ao gravar, volta na abertura ===== */
  console.log('\n=== F5a (dentro da 21): fila de reenvio persistida + guardas de pre-login ===');
  /* [revisao F5a, M6 + lixeira] dube ROTEADO por store: nome errado explode e o teste pega; put/delete disparam
     oncomplete por microtarefa (o app confirma cofre/exclusao por ele) */
  const lojas24={fila:{},lixeira:{},diario:{},rascunho:{}};
  const dbFake24={transaction:(nome)=>{const L=lojas24[nome];if(!L)throw new Error('store errado: '+nome);
    const tx={objectStore:()=>({
      put:v=>{L[v.qid||v.id]=v;Promise.resolve().then(()=>tx.oncomplete&&tx.oncomplete());},
      delete:k=>{delete L[k];Promise.resolve().then(()=>tx.oncomplete&&tx.oncomplete());},
      get:k=>{const req={};Promise.resolve().then(()=>{req.result=L[k];req.onsuccess&&req.onsuccess();});return req;},
      openCursor:()=>{const req={};let i=0;const fire=()=>{const ks=Object.keys(L);
        if(i<ks.length){const v=L[ks[i]];req.onsuccess&&req.onsuccess({target:{result:{value:v,continue:()=>{i++;Promise.resolve().then(fire);}}}});}
        else req.onsuccess&&req.onsuccess({target:{result:null}});};Promise.resolve().then(fire);return req;}})};
    return tx;}};
  const loja24=lojas24.fila;   /* apelido usado pelos testes da fila */
  const _idbOrig24=g('idbOpen'), _faOrig24=g('fotoAdd'); setg('idbOpen',cb=>cb(dbFake24));
  setg('movs',[{id:'m7',tipo:'COMPRA',valor:7}]); setg('_fotosPend',['QQ']); setg('_fotosFalhadas',[]);
  setg('fotoAdd',(mid,b,cb)=>{cb(false);});
  A('aplicarFotosPend')('m7'); await tick();
  t('F5a fila: recusa entra na fila COM identidade e vai pro cofre do aparelho na hora', g('_fotosFalhadas').length===1 && !!g('_fotosFalhadas')[0].qid && Object.keys(loja24).length===1, 'fila='+JSON.stringify(g('_fotosFalhadas').map(f=>f.qid))+' cofre='+Object.keys(loja24).length);
  setg('fotoAdd',(mid,b,cb)=>{cb(true);});
  A('reenviarFotosFalhadas')('m7'); await tick();
  t('F5a fila: gravou -> sai da fila E do cofre', g('_fotosFalhadas').length===0 && Object.keys(loja24).length===0, 'cofre='+Object.keys(loja24).length);
  loja24['qa']={qid:'qa',movId:'m7',b64:'z1',ts:1}; loja24['qb']={qid:'qb',movId:'m7',b64:'z2',ts:2};
  A('carregarFilaFotos')(); await tick(); await tick(); await tick(); await tick();
  t('F5a fila: reabrir o app traz as fotos do cofre de volta para a fila, marcadas como confirmadas no cofre', g('_fotosFalhadas').length===2 && g('_fotosFalhadas').some(f=>f.qid==='qa') && g('_fotosFalhadas').some(f=>f.qid==='qb') && g('_fotosFalhadas').every(f=>f.salva===true), JSON.stringify(g('_fotosFalhadas').map(f=>[f.qid,f.salva])));
  A('carregarFilaFotos')(); await tick(); await tick(); await tick(); await tick();
  t('F5a fila: carregar de novo nao duplica (mesma identidade)', g('_fotosFalhadas').length===2, 'fila='+g('_fotosFalhadas').length);
  if(g('USAR_NUVEM')){
    const _dbSec21=g('_db'); setg('_db',null); let adds24=0; setg('fotoAdd',()=>{adds24++;});
    const nG=A('reenviarFotosFalhadas')();
    t('F5a guarda: nuvem ligada e SEM login -> reenvio espera (senao a foto gravaria no armazenamento errado)', nG===0 && adds24===0 && g('_fotosFalhadas').length===2, 'n='+nG+' adds='+adds24);
    let leu24=0; const _flG=g('fotoList'); setg('fotoList',(id,cb)=>{leu24++;cb([]);});
    setg('_movesPendentes',[{origem:'gg',destino:'m7',tumulo:'nota:gg'}]);
    A('retomarMovesPendentes')();
    t('F5a guarda: retomada de moves tambem espera o login — nada lido, gesto continua na fila', leu24===0 && g('_movesPendentes').length===1, 'leu='+leu24);
    setg('_movesPendentes',[]); setg('fotoList',_flG); setg('_db',_dbSec21);
  }
  /* lixeira/diario no modo LOCAL: guarda -> lista (mais novo primeiro) -> apaga; diario grava (no arquivo com nuvem, o caminho local nao roda) */
  if(!g('USAR_NUVEM')){
    Object.keys(lojas24.lixeira).forEach(k=>delete lojas24.lixeira[k]);
    A('lixeiraGuarda')([{id:'la1',tipo:'COMPRA',valor:1},{id:'la2',tipo:'VENDA',valor:2}]); await tick();
    t('lixeira (local): guardou os 2 no cofre com o lancamento inteiro', Object.keys(lojas24.lixeira).length===2 && lojas24.lixeira.la1.mov.tipo==='COMPRA', JSON.stringify(Object.keys(lojas24.lixeira)));
    lojas24.lixeira.la1.ts=1; lojas24.lixeira.la2.ts=2;
    let lidas25b=null; A('lixeiraLista')(L=>{lidas25b=L;}); for(let i=0;i<5;i++)await tick();
    t('lixeira (local): lista vem do cofre, mais novo primeiro', !!lidas25b && lidas25b.length===2 && lidas25b[0].id==='la2', JSON.stringify((lidas25b||[]).map(x=>x.id)));
    let apagouOk25=null; A('lixeiraApaga')('la1',ok=>{apagouOk25=ok;}); for(let i=0;i<3;i++)await tick();
    t('lixeira (local): apagar tira do cofre e confirma', apagouOk25===true && !lojas24.lixeira.la1, 'ok='+apagouOk25);
    A('diarioReg')('teste','alvo X'); await tick();
    t('diario (local): registro gravado com acao e quem', Object.keys(lojas24.diario).length===1 && Object.values(lojas24.diario)[0].acao==='teste', JSON.stringify(Object.values(lojas24.diario)));
  } else {
    /* [revisao lixeira, M1] o caminho da NUVEM exercitado de verdade: dube do Firestore por subcolecao — sem isto,
       lixeiraGuarda/diarioReg no-op passavam VERDES nas 4 portas do arquivo publicado */
    const nuvemLix={}, nuvemDia={};
    const colFake=(store)=>({doc:(id)=>({set:(v)=>{store[id]=v;return Promise.resolve();},delete:()=>{delete store[id];return Promise.resolve();}}),
      orderBy:()=>({limit:()=>({get:()=>Promise.resolve({metadata:{fromCache:false},empty:!Object.keys(store).length,forEach:(f)=>{Object.keys(store).map(k=>({id:k,data:()=>store[k]})).sort((a,b)=>((store[b.id]||{}).ts||0)-((store[a.id]||{}).ts||0)).forEach(f);}})})})});
    const _dbLixNu=g('_db'); setg('_db',{collection:()=>({doc:()=>({collection:(nome)=>colFake(nome==='diario'?nuvemDia:nuvemLix)})})});
    const _emailOrig=g('_userEmail'); setg('_userEmail','laura@gmail.com');
    A('lixeiraGuarda')([{id:'nu1',tipo:'COMPRA',valor:3,cat:'ETB'},{id:'nu2',tipo:'VENDA',valor:9,cat:'ETB'}]); await tick();
    t('lixeira (nuvem): guardar grava {ts,quem,mov} por doc — e QUEM e a pessoa logada (o ponto do diario)', !!nuvemLix.nu1 && nuvemLix.nu1.mov.valor===3 && nuvemLix.nu1.quem==='laura' && !!nuvemLix.nu2, JSON.stringify(nuvemLix.nu1&&[nuvemLix.nu1.quem,nuvemLix.nu1.mov.valor]));
    A('diarioReg')('teste-nuvem','x'); await tick();
    t('diario (nuvem): registro gravado com acao E quem', Object.keys(nuvemDia).length===1 && Object.values(nuvemDia)[0].acao==='teste-nuvem' && Object.values(nuvemDia)[0].quem==='laura', JSON.stringify(Object.values(nuvemDia)));
    let diaNu=null; A('diarioLista')(L=>{diaNu=L;}); await tick(); await tick();
    t('diario (nuvem): a tela le da subcolecao de verdade', !!diaNu && diaNu.length===1 && diaNu[0].acao==='teste-nuvem', JSON.stringify(diaNu));
    setg('_userEmail',_emailOrig);
    nuvemLix.nu1.ts=5; nuvemLix.nu2.ts=9;
    let lidasNu=null; A('lixeiraLista')(L=>{lidasNu=L;}); await tick(); await tick();
    t('lixeira (nuvem): lista mais novo primeiro', !!lidasNu && lidasNu.length===2 && lidasNu[0].id==='nu2', JSON.stringify((lidasNu||[]).map(x=>x.id)));
    let apagouNu=null; A('lixeiraApaga')('nu1',ok=>{apagouNu=ok;}); await tick(); await tick();
    t('lixeira (nuvem): apagar tira o doc e confirma', apagouNu===true && !nuvemLix.nu1, 'ok='+apagouNu);
    setg('_db',{collection:()=>({doc:()=>({collection:()=>({doc:()=>({set:()=>Promise.reject(new Error('regra negou')),delete:()=>Promise.reject(new Error('x'))}),orderBy:()=>({limit:()=>({get:()=>Promise.reject(new Error('offline'))})})})})})});
    let lidasErr=0; A('lixeiraLista')(L=>{lidasErr=L;}); await tick(); await tick();
    t('lixeira (nuvem): leitura que FALHA devolve null (erro nunca vira vazio)', lidasErr===null, String(lidasErr));
    setg('_db',_dbLixNu);
  }
  /* ===== F4: rascunho do Lancar persiste, restaura (sem mexer na tela) e limpa ===== */
  console.log('\n=== F4 (dentro da 21): rascunho persistente do Lancar ===');
  Object.keys(lojas24.rascunho).forEach(k=>delete lojas24.rascunho[k]);
  setg('_rascPronto',true); setg('tela','lancar'); setg('editId',null);
  setg('tipoSel','COMPRA'); setg('compraModo','nota'); setg('notaItens',[{cat:'ETB',valor:10}]); setg('_fotosPend',['NF']); setg('vendaItens',[]); setg('trocaDei',[]); setg('trocaRecebi',[]); setg('trocaDin',0); setg('_fotosItem',[]);
  const _stR=ctx.setTimeout; const timersR=[]; ctx.setTimeout=(fn,ms)=>{timersR.push({fn,ms});return timersR.length;};
  A('agendaRascunho')(); A('agendaRascunho')();
  const tR=timersR.filter(x=>x.ms===400);
  t('F4: mexer no Lancar agenda a gravacao (debounce de 400 ms)', tR.length>=1, 'timers='+JSON.stringify(timersR.map(x=>x.ms)));
  tR[tR.length-1].fn(); await tick();
  t('F4: o rascunho foi pro cofre com listas, baldes e modos', !!lojas24.rascunho.atual && lojas24.rascunho.atual.dados.notaItens.length===1 && lojas24.rascunho.atual.dados._fotosPend.length===1 && lojas24.rascunho.atual.dados.compraModo==='nota', JSON.stringify(lojas24.rascunho.atual&&lojas24.rascunho.atual.dados.compraModo));
  ctx.setTimeout=_stR;
  setg('notaItens',[]); setg('_fotosPend',[]); setg('tipoSel','VENDA'); setg('tela','painel'); setg('_rascPronto',false);
  let toastsR=[]; const _tR=g('toast'); setg('toast',m=>toastsR.push(String(m)));
  A('restauraRascunho')(); for(let i=0;i<5;i++)await tick();
  t('F4: reabrir recupera listas/baldes/modos, avisa, e NUNCA mexe na tela', g('notaItens').length===1 && g('_fotosPend').length===1 && g('tipoSel')==='COMPRA' && g('tela')==='painel' && toastsR.some(x=>/Rascunho recuperado/.test(x)) && g('_rascPronto')===true, JSON.stringify([g('tipoSel'),g('tela'),toastsR.slice(0,1)]));
  A('limpaRascunho')(); for(let i=0;i<3;i++)await tick();
  t('F4: salvar/limpar apaga o rascunho do cofre', !lojas24.rascunho.atual, JSON.stringify(Object.keys(lojas24.rascunho)));
  toastsR=[]; setg('_rascPronto',false); A('restauraRascunho')(); for(let i=0;i<5;i++)await tick();
  t('F4: sem rascunho real, nada acontece (e o gate libera as gravacoes)', toastsR.length===0 && g('_rascPronto')===true && g('notaItens').length===1, 'toasts='+toastsR.length);
  /* gate anti-sobrescrita: sem a restauracao concluida, o render do boot NAO agenda gravacao */
  setg('_rascPronto',false); const timersG=[]; ctx.setTimeout=(fn,ms)=>{timersG.push(ms);return 1;};
  A('agendaRascunho')();
  t('F4 (gate): antes de a restauracao terminar, o render nao grava rascunho nenhum (vazio nao sobrescreve o real)', timersG.filter(m=>m===400).length===0, JSON.stringify(timersG));
  ctx.setTimeout=_stR; setg('_rascPronto',true);
  /* rascunho GRAVADO porem VAZIO (tudo zerado): reabrir nao restaura nem avisa */
  lojas24.rascunho.atual={id:'atual',dados:{tipoSel:'TROCA',compraModo:'item',vendaModo:'item',notaItens:[],vendaItens:[],trocaDei:[],trocaRecebi:[],trocaDin:0,_fotosItem:[],_fotosPend:[],ts:1}};
  const _tV=g('toast'); let toastsV=[]; setg('toast',m=>toastsV.push(String(m))); setg('_rascPronto',false); setg('tipoSel','COMPRA');
  A('restauraRascunho')(); for(let i=0;i<5;i++)await tick();
  t('F4: rascunho vazio gravado nao restaura nada (nem muda o tipo, nem avisa)', toastsV.length===0 && g('tipoSel')==='COMPRA' && g('_rascPronto')===true, JSON.stringify([toastsV.length,g('tipoSel')]));
  setg('toast',_tV); delete lojas24.rascunho.atual;
  /* [re-checagem F4] restaurar NUNCA atropela digitacao em curso nem edicao aberta */
  lojas24.rascunho.atual={id:'atual',dados:{tipoSel:'VENDA',compraModo:'item',vendaModo:'varios',notaItens:[],vendaItens:[{cat:'VELHO',valor:1}],trocaDei:[],trocaRecebi:[],trocaDin:0,_fotosItem:[],_fotosPend:[],ts:1}};
  setg('tipoSel','COMPRA'); setg('notaItens',[{cat:'DIGITADO AGORA',valor:300}]); setg('vendaItens',[]); setg('_rascPronto',false);
  let toastsA=[]; const _tA=g('toast'); setg('toast',m=>toastsA.push(String(m)));
  A('restauraRascunho')(); for(let i=0;i<5;i++)await tick();
  t('F4 (re-checagem): com digitacao em curso, o rascunho velho NAO atropela (nada muda, nada avisa)', g('notaItens').length===1 && g('notaItens')[0].cat==='DIGITADO AGORA' && g('tipoSel')==='COMPRA' && g('vendaItens').length===0 && toastsA.length===0 && g('_rascPronto')===true, JSON.stringify([g('tipoSel'),g('notaItens').length,toastsA.length]));
  setg('notaItens',[]); setg('editId','m77'); setg('_rascPronto',false); toastsA=[];
  A('restauraRascunho')(); for(let i=0;i<5;i++)await tick();
  t('F4 (re-checagem): com EDICAO aberta, o rascunho nao entra', g('vendaItens').length===0 && toastsA.length===0, JSON.stringify(toastsA));
  setg('editId',null); setg('toast',_tA); delete lojas24.rascunho.atual;
  setg('notaItens',[]); setg('_fotosPend',[]); setg('tela','painel');
  /* === 28. 1MB fase 1: miniatura fora do documento === */
  console.log('\n=== 28. 1MB fase 1: miniatura fora do documento ===');
  reset(); setg('_restaurando',false); setg('tela','painel'); setg('editId',null); setg('_syncReady',true); setg('_db',null);
  setg('_pendSeq',0); setg('_pendOk',0); delete store['tcg_pend_nuvem']; setg('excluidos',{}); setg('_baseH',{});
  setg('gravaLocal',_gravaOrig);   /* secoes anteriores trocam o gravaLocal; aqui a pendencia de thumb depende do REAL */
  t('28: hashReg ignora a miniatura (senao todo lancamento com foto pareceria "editado aqui" pra sempre)',
    A('hashReg')({id:'a',valor:5,fotoThumb:'data:x'})===A('hashReg')({id:'a',valor:5}) && A('hashReg')({id:'a',valor:5})!==A('hashReg')({id:'a',valor:6}));
  const mSem={id:'m1',valor:2,fotoThumb:'T',nFotos:1};
  const arrSem=A('semThumbs')([mSem]);
  t('28: semThumbs troca a miniatura pelo MARCADOR de 1px na COPIA (revisor G1: apagar a chave fazia o app velho reverter edicao) e nao encosta no original',
    arrSem[0].fotoThumb===g('TH_MARCA') && mSem.fotoThumb==='T' && arrSem[0].valor===2 && g('TH_MARCA').length<100);
  /* porta principal: snapshot com marcador NAO apaga a miniatura local; foto zerada no outro lado NAO ressuscita;
     marcador sem par local SOME do estado (nunca vira lixo na tela nem no disco) */
  setg('movs',[{id:'t1',tipo:'COMPRA',valor:3,fotoThumb:'TH1',nFotos:1},{id:'t2',tipo:'COMPRA',valor:4,fotoThumb:'TH2',nFotos:1}]);
  A('aplicarNuvem')({_upd:8881,movs:[{id:'t1',tipo:'COMPRA',valor:3,fotoThumb:g('TH_MARCA'),nFotos:1},{id:'t2',tipo:'COMPRA',valor:4,fotoThumb:g('TH_MARCA'),nFotos:0},{id:'t3',tipo:'COMPRA',valor:5,fotoThumb:g('TH_MARCA'),nFotos:1}],excluidos:{}});
  t('28 (porta principal): marcador vira a miniatura local de volta; zerado nao ressuscita; marcador orfao FICA marcador (estavel — revisor G1 rodada 2: apagar fazia o campo oscilar no doc e cada troca era transicao nova pro app velho)',
    (g('movs').find(m=>m.id==='t1')||{}).fotoThumb==='TH1' && !(g('movs').find(m=>m.id==='t2')||{}).fotoThumb && (g('movs').find(m=>m.id==='t3')||{}).fotoThumb===g('TH_MARCA'), JSON.stringify(g('movs').map(m=>[m.id,(m.fotoThumb||'').slice(0,8)])));
  t('28: a tela e cega ao marcador (thumbReal devolve vazio) e enxerga a miniatura real', A('thumbReal')(g('TH_MARCA'))==='' && A('thumbReal')('TH1')==='TH1' && A('thumbReal')(undefined)==='');
  /* o marcador orfao que ficou re-sobe estavel: outro save nao alterna real->marcador->ausente */
  const mvT3=g('movs').find(m=>m.id==='t3');
  t('28: marcador orfao re-sobe ESTAVEL no payload (sem oscilar pra ausente)', A('semThumbs')([mvT3])[0].fotoThumb===g('TH_MARCA'));
  /* porta da pendencia — no ramo em que o REMOTO vence o empate (boot com base confirmada e registro
     NAO editado aqui): sem a reidratacao, o lancamento enxuto do outro lado apagaria a miniatura local */
  setg('movs',[{id:'p1',tipo:'COMPRA',valor:9,fotoThumb:'THP',nFotos:2}]);
  setg('_baseH',{p1:A('hashReg')({id:'p1',tipo:'COMPRA',valor:9,nFotos:2})});
  const fx28=A('fundirComRemoto')({movs:[{id:'p1',tipo:'COMPRA',valor:9,nFotos:2}],excluidos:{},jogos:[],cats:[],cols:[],colsJ:{},colsG:{},pess:[],pgs:[],despCats:[],cadastros:[],contasBanc:[],codigosResolvidos:{}},true);
  t('28 (porta da pendencia): mesmo quando o REMOTO vence o empate (boot), a miniatura local volta', (fx28.movs.find(m=>m.id==='p1')||{}).fotoThumb==='THP' && (fx28.movs.find(m=>m.id==='p1')||{}).valor===9, JSON.stringify(fx28.movs.map(m=>[m.id,m.fotoThumb||''])));
  setg('_baseH',{});
  /* payload sobe enxuto; local mantem */
  let payCap28=null;
  setg('movs',[{id:'s1',tipo:'COMPRA',valor:7,fotoThumb:'TS',nFotos:1}]);
  setg('_db',{collection:()=>({doc:()=>({})}),runTransaction(fn){const tx={get(){return Promise.resolve({exists:false,data:()=>null});},set(r,p){payCap28=p;}};return fn(tx);}});
  A('salvarNuvem')(); for(let i=0;i<6;i++)await tick();
  t('28: o payload sobe com o MARCADOR no lugar da miniatura e o lancamento local mantem a real', !!payCap28 && payCap28.movs[0].fotoThumb===g('TH_MARCA') && g('movs')[0].fotoThumb==='TS' && payCap28.movs[0].valor===7, JSON.stringify(payCap28&&payCap28.movs.map(m=>(m.fotoThumb||'').slice(0,8))));
  t('28: o medidor de 1MB independe do TAMANHO da miniatura real (2KB ou 20KB da o MESMO numero)', (function(){const a=A('medirDocBytes')();const mm=g('movs');mm[0]=Object.assign({},mm[0],{fotoThumb:'X'.repeat(20000)});setg('movs',mm);return a===A('medirDocBytes')();})());
  setg('_db',null);
  if(g('USAR_NUVEM')){
    const thStore={};
    const thCol={doc:(id)=>({set:(v)=>{thStore[id]=v;return Promise.resolve();},delete:()=>{delete thStore[id];return Promise.resolve();}}),
      where:(k,op,v)=>({get:()=>Promise.resolve({forEach:(f)=>{Object.keys(thStore).filter(id=>thStore[id]&&thStore[id][k]===v).forEach(id=>f({id,data:()=>thStore[id]}));}})}),
      get:()=>Promise.resolve({metadata:{fromCache:false},empty:!Object.keys(thStore).length,forEach:(f)=>{Object.keys(thStore).forEach(id=>f({id,data:()=>thStore[id]}));}})};
    const dbTh={collection:()=>({doc:()=>({collection:()=>thCol})})};
    setg('_db',dbTh); delete store['tcg_th_pend']; delete store['tcg_th_bf1']; setg('_thDespachando',false); setg('_thBuscou',false);
    A('thumbNuvem')('mv9','TT9'); for(let i=0;i<4;i++)await tick();
    t('28 (nuvem): a miniatura vira doc th_ na subcolecao de fotos e a pendencia esvazia', !!thStore['th_mv9'] && thStore['th_mv9'].th==='TT9' && thStore['th_mv9'].t===1 && Object.keys(A('thumbPend')()).length===0, JSON.stringify(thStore));
    A('thumbNuvem')('mv9',null); for(let i=0;i<4;i++)await tick();
    t('28 (nuvem): apagar a miniatura apaga o doc th_', !thStore['th_mv9']);
    setg('_db',null);
    A('thumbNuvem')('mv7','TT7');
    t('28 (nuvem): sem conexao a pendencia fica no disco e nada explode', (A('thumbPend')()||{}).mv7==='TT7', store['tcg_th_pend']);
    setg('_db',dbTh);
    A('despachaThumbs')(); for(let i=0;i<4;i++)await tick();
    t('28 (nuvem): quando a conexao volta, a pendencia drena', !!thStore['th_mv7'] && thStore['th_mv7'].th==='TT7' && Object.keys(A('thumbPend')()).length===0, JSON.stringify(thStore));
    thStore['th_q1']={t:1,th:'TQ1',ts:1};
    setg('movs',[{id:'q1',tipo:'COMPRA',valor:1,nFotos:2,fotoThumb:g('TH_MARCA')},{id:'q2',tipo:'COMPRA',valor:1,nFotos:0}]);
    setg('_thBuscou',false);
    A('carregarThumbsNuvem')(); for(let i=0;i<4;i++)await tick();
    t('28 (nuvem): o aparelho com o MARCADOR busca o doc th_ e troca pelo real; quem nao tem foto fica quieto', (g('movs')[0]||{}).fotoThumb==='TQ1' && !(g('movs')[1]||{}).fotoThumb, JSON.stringify(g('movs').map(m=>[m.id,(m.fotoThumb||'').slice(0,8)])));
    delete store['tcg_th_bf1']; Object.keys(thStore).forEach(k=>delete thStore[k]); delete store['tcg_th_pend'];
    setg('movs',[{id:'b1',tipo:'COMPRA',valor:1,nFotos:1,fotoThumb:'TB1'}]);
    A('backfillThumbs')(); for(let i=0;i<4;i++)await tick();
    t('28 (nuvem): as miniaturas legadas deste aparelho sobem 1x (e a marca impede repetir)', !!thStore['th_b1'] && thStore['th_b1'].th==='TB1' && store['tcg_th_bf1']==='1', JSON.stringify(Object.keys(thStore)));
    /* galeria/backup nunca confundem doc th_ com foto */
    const q28={metadata:{fromCache:false},empty:false,forEach:(f)=>{[{id:'th_b1',data:()=>({t:1,th:'x',ts:1})},{id:'f77',data:()=>({movId:'b1',b64:'B64',ts:1})}].forEach(f);}};
    setg('_db',{collection:()=>({doc:()=>({collection:()=>({get:()=>Promise.resolve(q28)})})})});
    let todas28=null; A('todasFotos')(L=>{todas28=L;}); for(let i=0;i<4;i++)await tick();
    t('28 (nuvem): o backup completo traz so FOTOS — o doc th_ (sem b64) fica de fora', Array.isArray(todas28) && todas28.length===1 && todas28[0].id==='f77', JSON.stringify(todas28&&todas28.map(x=>x.id)));
    /* [revisor 1MB, M1] apagar que entra DURANTE o voo do envio nao e engolido pelo fim do envio */
    delete store['tcg_th_pend']; setg('_thDespachando',false);
    const thStore2={}; let capDel28=0;
    const thCol2={doc:(id)=>({set:(v)=>{const q=A('thumbPend')();q[id.slice(3)]=null;A('thumbPendGrava')(q);thStore2[id]=v;return Promise.resolve();},delete:()=>{capDel28++;delete thStore2[id];return Promise.resolve();}})};
    setg('_db',{collection:()=>({doc:()=>({collection:()=>thCol2})})});
    A('thumbNuvem')('r1','AA'); for(let i=0;i<5;i++)await tick();
    const pendMeio28=A('thumbPend')();
    A('despachaThumbs')(); for(let i=0;i<5;i++)await tick();
    t('28 (nuvem, corrida): o apagar que entrou no meio do voo sobrevive na pendencia e o proximo despacho apaga o doc', pendMeio28.r1===null && capDel28===1 && !thStore2['th_r1'] && Object.keys(A('thumbPend')()).length===0, JSON.stringify([pendMeio28,capDel28,Object.keys(thStore2)]));
    /* [revisor 1MB, M2] memoria cheia no backfill: SEM flag — o proximo boot tenta de novo (antes: flag + pendencia perdida = nunca sobe, calado) */
    delete store['tcg_th_bf1']; delete store['tcg_th_pend']; setg('_db',dbTh); Object.keys(thStore).forEach(k=>delete thStore[k]);
    setg('movs',[{id:'bq1',tipo:'COMPRA',valor:1,nFotos:1,fotoThumb:'TBQ'}]);
    const _gvOrig28=g('gravaLocal'); setg('gravaLocal',(k,v)=>k==='tcg_th_pend'?false:_gvOrig28(k,v));
    A('backfillThumbs')(); for(let i=0;i<4;i++)await tick();
    const semFlag28=!store['tcg_th_bf1'];
    setg('gravaLocal',_gvOrig28);
    A('backfillThumbs')(); for(let i=0;i<4;i++)await tick();
    t('28 (nuvem, memoria cheia): backfill sem espaco NAO grava a marca; com espaco, sobe e marca', semFlag28 && store['tcg_th_bf1']==='1' && !!thStore['th_bq1'] && thStore['th_bq1'].th==='TBQ', JSON.stringify([semFlag28,Object.keys(thStore)]));
    /* [fila item 5] todasFotos: nuvem que RECUSA devolve null (erro nunca vira "zero fotos") — era so literal */
    setg('_db',{collection:()=>({doc:()=>({collection:()=>({get:()=>Promise.reject(new Error('regra negou'))})})})});
    let todasErr29='nao-chamou'; A('todasFotos')(L=>{todasErr29=L;}); for(let i=0;i<4;i++)await tick();
    t('29 (nuvem): leitura de todas as fotos que FALHA devolve null, nunca lista vazia', todasErr29===null, String(todasErr29));
    setg('_db',null); delete store['tcg_th_pend']; delete store['tcg_th_bf1'];
  }
  setg('movs',[]); setg('excluidos',{}); setg('_baseH',{});
  /* === 29. provas literal->teste (fila item 5 — divida dos revisores F5a/diario) === */
  console.log('\n=== 29. provas que eram so literal viram comportamento ===');
  /* (1) beforeunload FORTE: contexto novo com captura de listener — o aviso de sair só dispara com foto em risco */
  {
    const c3=Object.assign({},ctx); const paginaEventos={};
    c3.addEventListener=(n,f)=>{paginaEventos[n]=f;};
    c3.window=c3;c3.globalThis=c3;c3.self=c3;
    const st3={'tcg_seed_v1':'1'};
    c3.localStorage={getItem:k=>(k in st3?st3[k]:null),setItem:(k,v)=>{st3[k]=String(v);},removeItem:k=>{delete st3[k];},clear:()=>{}};
    vm.createContext(c3); vm.runInContext(src,c3,{filename:'app-beforeunload.js'});
    const h=paginaEventos['beforeunload'];
    let prev1=0; const e1={preventDefault:()=>{prev1++;},returnValue:''};
    if(h)h(e1);
    vm.runInContext("_fotosFalhadas=[{qid:'x',salva:false}]",c3);
    let prev2=0; const e2={preventDefault:()=>{prev2++;},returnValue:''};
    if(h)h(e2);
    t('29 (beforeunload): sem foto em risco deixa sair calado; com foto sem cofre SEGURA e avisa de perda', !!h && prev1===0 && e1.returnValue==='' && prev2===1 && /perder/.test(String(e2.returnValue)), JSON.stringify([!!h,prev1,prev2,String(e2.returnValue).slice(0,30)]));
  }
  /* (2) f.salva no CAMINHO DE ESCRITA: gravar no cofre confirma a foto (o literal só via o texto do handler) */
  Object.keys(lojas24.fila).forEach(k=>delete lojas24.fila[k]);
  const f29={qid:'q29',movId:'m29',b64:'B',ts:1};
  A('filaFotoGrava')(f29); for(let i=0;i<5;i++)await tick();
  t('29 (fila): gravar no cofre marca a foto como confirmada (f.salva) e o cofre tem a copia', f29.salva===true && !!lojas24.fila.q29 && lojas24.fila.q29.b64==='B', JSON.stringify([f29.salva,Object.keys(lojas24.fila)]));
  /* (3) gesto de CRIAR comportamental (revisor-diario M1: a prova era regex no fonte — guarda-na-frente furava) */
  reset(); setg('_restaurando',false); setg('tela','painel'); setg('editId',null); setg('_db',null); setg('_syncReady',false);
  setg('excluidos',{}); setg('_baseH',{}); setg('movs',[]); setg('_fotosItem',[]); setg('_fotosPend',[]);
  const _dr29=g('diarioReg'); const diarioCap29=[]; setg('diarioReg',(a,alvo)=>{diarioCap29.push([a,String(alvo||'')]);});
  const _cf29=ctx.confirm; ctx.confirm=()=>true;
  setg('notaItens',[{jogo:'Pokémon',cat:'ETB',colecao:'151',idioma:'—',qtd:1,valor:100,destino:'Vender',codigo:'',fotos:[]},{jogo:'Pokémon',cat:'Quad',colecao:'Caos',idioma:'—',qtd:2,valor:50,destino:'Vender',codigo:'',fotos:[]}]);
  setg('notaHead',{frete:0,taxa:0,cp:'Fornecedor29',conta:'',sit:'Em estoque',data:'2026-08-25',num:'77',pg:'A vista',nParc:1,venc1:'',obs:''});
  A('salvarNota')();
  t('29 (diario, criar): lancar a NOTA registra no diario de verdade (nao so regex no fonte)', diarioCap29.some(x=>x[0]==='lançou nota de compra'), JSON.stringify(diarioCap29));
  ctx.confirm=_cf29; setg('diarioReg',_dr29); setg('movs',[]); setg('notaItens',[]);
  /* === 30. F2c: a foto do leitor vira foto da carta (fila item 6; re-feita apos revisor: balde certo por forma + link sobrevive a repintura) === */
  console.log('\n=== 30. F2c: foto do scanner aproveitada na carta ===');
  setg('_fotosItem',[]); setg('_fotosPend',[]); setg('_rascPronto',true);
  const hint30={innerHTML:'',insertAdjacentHTML(p,h){this.innerHTML+=h;},
    querySelector(sel){const id=sel.replace('#','id="')+'"';if(this.innerHTML.indexOf(id)<0)return null;
      const self=this;return {remove(){self.innerHTML=self.innerHTML.replace(/ <span[^>]*id="scanFotoUse"[\s\S]*?<\/span>/,'');}};}};
  const _geb30=ctx.document.getElementById; ctx.document.getElementById=(id)=>id==='h30'?hint30:_elCampo(id);   /* _elCampo: o stub que le _campos (o ativo aqui devolvia elemento vazio) */
  /* COMPRA 1-item (f_cod): o balde certo e _fotosPend — o que salvar() consome (revisor G1) */
  vm.runInContext("window._scanFoto={b64:'data:image/jpeg;FOTO-SCAN',usada:false,form:'f_cod',hintId:'h30'}",ctx);
  A('ligaHint')('245/198','h30');
  t('30 (G2): a repintura do hint (ligaHint, mesma do toque no chip) DEVOLVE o link da foto pendente', /usarFotoScan\('h30'\)/.test(hint30.innerHTML), hint30.innerHTML.slice(0,80));
  A('usarFotoScan')('h30');
  t('30 (G1): na compra 1-item a foto vai pro balde do LANCAMENTO (_fotosPend), que o salvar() consome', g('_fotosPend').length===1 && g('_fotosPend')[0]==='data:image/jpeg;FOTO-SCAN' && g('_fotosItem').length===0, JSON.stringify([g('_fotosPend').length,g('_fotosItem').length]));
  t('30 (M1): usar a foto REMOVE o link da tela e deixa o selo', hint30.innerHTML.indexOf('scanFotoUse')<0 && hint30.innerHTML.indexOf('scanFotoOk')>=0, hint30.innerHTML.slice(-90));
  A('usarFotoScan')('h30');
  t('30: 2o toque NAO duplica (foto ja usada)', g('_fotosPend').length===1);
  A('ligaHint')('245/198','h30');
  t('30: depois de usada, a repintura NAO devolve o link', hint30.innerHTML.indexOf('scanFotoUse')<0);
  /* TROCA (r_cod): balde da carta em digitacao (_fotosItem) */
  vm.runInContext("window._scanFoto={b64:'data:image/jpeg;FOTO-TROCA',usada:false,form:'r_cod',hintId:'h30'}",ctx);
  A('usarFotoScan')('h30');
  t('30: na troca a foto vai pro balde da carta (_fotosItem)', g('_fotosItem').length===1 && g('_fotosItem')[0]==='data:image/jpeg;FOTO-TROCA' && g('_fotosPend').length===1);
  /* identidade: link/toque de OUTRO hint nunca usa a foto deste scan (revisor, residual latente) */
  vm.runInContext("window._scanFoto={b64:'data:image/jpeg;FOTO-X',usada:false,form:'f_cod',hintId:'hOUTRO'}",ctx);
  A('usarFotoScan')('h30');
  t('30: toque num link VELHO (hint diferente) nao guarda a foto do scan novo', g('_fotosPend').length===1 && A('scanFotoLnk')('h30')==='', JSON.stringify(g('_fotosPend').length));
  vm.runInContext("window._scanFoto=null",ctx);
  A('usarFotoScan')('h30');
  t('30: sem foto pendente, nada acontece e nada explode', g('_fotosPend').length===1 && A('scanFotoLnk')('h30')==='');
  /* [rodada 2 do revisor] codigo AMBIGUO: o ramo saia por return ANTES do reanexo — wrapper cobre */
  const _plAmb=g('precoLigaDe'); setg('precoLigaDe',()=>({status:'AMBIGUO',titulo:'X (1/2)',opcoes:[]}));
  hint30.innerHTML=''; vm.runInContext("window._scanFoto={b64:'F-AMB',usada:false,form:'f_cod',hintId:'h30'}",ctx);
  A('ligaHint')('1/2','h30');
  t('30 (rodada 2): repintura com codigo AMBIGUO tambem devolve o link da foto', /usarFotoScan\('h30'\)/.test(hint30.innerHTML) && /mais de uma carta|escolher qual|colar link/.test(hint30.innerHTML), hint30.innerHTML.slice(0,120));
  setg('precoLigaDe',_plAmb); vm.runInContext("window._scanFoto=null",ctx);
  /* [rodada 2 do revisor, G-edicao] EDITAR compra com a foto do leitor no balde: o salvar CONSOME
     (antes: voltarDaEdicao zerava _fotosPend com o toast ja tendo dito "guardada" — perda com confirmacao falsa) */
  reset(); setg('_restaurando',false); setg('tela','lancar'); setg('editId','me1'); setg('tipoSel','COMPRA'); setg('compraModo','item');
  setg('movs',[{id:'me1',tipo:'COMPRA',data:'2026-08-20',jogo:'Pokémon',cat:'ETB',colecao:'151',idioma:'—',qtd:1,valor:50,contraparte:'F',destino:'Vender',situacao:'Em estoque',taxa:0,pgTipo:'À vista',nFotos:2}]);
  setg('_db',null); setg('_syncReady',false); setg('excluidos',{}); setg('_baseH',{}); setg('_fotosItem',[]); setg('_fotosEmVoo',[]); setg('_fotosFalhadas',[]);
  setg('_fotosPend',['data:FOTO-EDIT']);
  Object.keys(_campos).forEach(k=>delete _campos[k]);
  _campos.f_val='55'; _campos.f_data='2026-08-21'; _campos.f_jogo='Pokémon'; _campos.f_cat='ETB'; _campos.f_col='151'; _campos.f_idi='—'; _campos.f_qtd='1'; _campos.f_cp='F'; _campos.f_dest='Vender'; _campos.f_sit='Em estoque'; _campos.f_taxa='0'; _campos.f_pg='À vista';
  const _faEd=g('fotoAdd'); const capEd=[]; setg('fotoAdd',(movId,b64,cb)=>{capEd.push([movId,String(b64)]);cb&&cb(true);});
  const _cfEd=ctx.confirm; ctx.confirm=()=>true;
  const _tEd2=g('toast'); const toastsEd=[]; setg('toast',m=>toastsEd.push(String(m)));
  A('salvar')();
  t('30 (rodada 2, G-edicao): salvar a EDICAO consome a foto do leitor (fotoAdd no id do lancamento) e o balde esvazia',
    capEd.some(x=>x[0]==='me1'&&x[1]==='data:FOTO-EDIT') && g('_fotosPend').length===0 && toastsEd.some(x=>/Alteração salva/.test(x)),
    JSON.stringify([capEd,toastsEd.slice(0,3)]));
  setg('fotoAdd',_faEd); ctx.confirm=_cfEd; setg('toast',_tEd2); setg('editId',null); setg('movs',[]); setg('_fotosPend',[]);
  Object.keys(_campos).forEach(k=>delete _campos[k]);
  ctx.document.getElementById=_geb30; setg('_fotosItem',[]); setg('_fotosPend',[]);
  setg('idbOpen',_idbOrig24); setg('fotoAdd',_faOrig24); setg('_fotosFalhadas',[]); setg('_fotosPend',[]);
  setg('gravaLocal',_gravaOrig);
  setg('_db',null); setg('_syncReady',false); setg('excluidos',{}); setg('_baseH',{}); reset();
})().catch(e=>{fail++;console.log('  FALHOU  secao 18/19/21 explodiu -> '+((e&&e.stack)||e));}).then(async()=>{
  /* ===== 31. PLANILHA EXPORTADA (13/09/2026) =====
     A exportacao nao pode inventar conta: o Resumo e o do Painel com periodo TUDO mesmo com a tela filtrada, a aba Compras fecha
     ate o "comprei" pela ponte (troca, caixa aberta sem pedaco), o lucro real e o do Relatorios, e gerar a planilha nao muda
     nenhum lancamento. Fixture com uma familia de cada caso dificil que os revisores acharam no dado real.
     Rodada 2 dos revisores: a secao ficava verde com 8 de 17 regras quebradas de proposito. Rodada 3: com 42 de 60 (disco) e
     cega a 6a conferencia, a frase do Resultado bruto, ao "(N de M)" e a tolerancia (numero); o rodape, o cabecalho do mes, o
     card da nota e o Relatorio somavam compra cada um de um jeito. Por isso: telas lidas de verdade (card, faixa, verLote,
     rodape, cabecalho, Trocas, aba vazia, Relatorio), 31c/31b/31d/31e com relogio fixo, parcela, nota, Liga, repasse, centavo
     quebrado, conta do Resultado bruto quebrada e "hoje" perto da meia-noite, e o XML de dentro do arquivo. A prova de que cada
     regra deixa esta secao vermelha mora em checks-suite.py (mutacoes da planilha). */
  console.log('');
  console.log('=== 31. planilha exportada: numeros do Painel, ponte das compras, nada gravado ===');
  reset();
  ctx.TextEncoder = TextEncoder;
  const fmt31 = g('fmt'), pct31 = g('pct');
  const aba31 = (P, nome) => P.abas.find(a => a.nome === nome);
  const col31 = (aba, rot) => aba.colunas.findIndex(c => c.t === rot);
  const linha31 = (aba, idm) => aba.linhas.find(l => l[l.length - 1] === idm) || [];
  const cel31 = (aba, idm, rot) => linha31(aba, idm)[col31(aba, rot)];
  const res31 = (P, rot) => { const l = aba31(P, 'Resumo').linhas.find(x => x && x.celulas && x.celulas[0] && x.celulas[0].v === rot);
    return l ? { v: l.celulas[1] ? l.celulas[1].v : null, t: l.celulas[2] ? String(l.celulas[2].v) : '' } : { v: undefined, t: '' }; };
  const zip31 = u => { const B = Buffer.from(Array.prototype.slice.call(u)), out = {}; let i = 0;
    while (i + 30 <= B.length && B.readUInt32LE(i) === 0x04034b50) {
      const tam = B.readUInt32LE(i + 18), nl = B.readUInt16LE(i + 26), xl = B.readUInt16LE(i + 28), ini = i + 30 + nl + xl;
      out[B.slice(i + 30, i + 30 + nl).toString('utf8')] = B.slice(ini, ini + tam).toString('utf8'); i = ini + tam; }
    return out; };
  const ctrlEm31 = s => { for (let i = 0; i < s.length; i++) { const k = s.charCodeAt(i); if (k < 32 && k !== 9 && k !== 10 && k !== 13) return true; } return false; };
  const relogio31 = (ano, mes, dia, hora, min) => vm.runInContext('(function(){const R=globalThis.__DataReal31||Date;globalThis.__DataReal31=R;const T=new R(' + [ano, mes - 1, dia, hora, min, 0].join(',') + ').getTime();function F(...a){if(!new.target)return new R(T).toString();return a.length?new R(...a):new R(T);}F.prototype=R.prototype;F.now=()=>T;F.UTC=R.UTC;F.parse=R.parse;globalThis.Date=F;})()', ctx);
  const semRelogio31 = () => vm.runInContext('if(globalThis.__DataReal31)globalThis.Date=globalThis.__DataReal31;', ctx);
  const telaCons31 = (f, ver, q, expand) => { setg('tela', 'consultar'); setg('consMenu', false); setg('perSel', 'tudo'); setg('perDe', ''); setg('perAte', '');
    setg('consJogo', 'todos'); setg('consCol', ''); setg('consPess', ''); setg('consConta', ''); setg('consCat', ''); setg('expandId', expand || null);
    setg('consF', f); setg('consVer', ver); setg('consQ', q || ''); return A('vConsultar')(); };
  const rodape31 = h => { const m = h.match(/(\d+) lançamentos? · ([^<]+)<\/span><span style="text-align:right"><b style="font-size:15px">([^<]*)<\/b>(?:<span[^>]*>([^<]*)<\/span>)?/);
    return m ? { n: +m[1], rot: m[2], v: m[3], nota: m[4] || '' } : {}; };
  const C31 = (id, x) => Object.assign({ id, tipo:'COMPRA', data:'2026-08-01', jogo:'Pokémon', idioma:'—', qtd:1, taxa:0, pgTipo:'À vista', destino:'Vender', contraparte:'F1' }, x);
  const fx31 = [
    C31('pA', { cat:'ETB', colecao:'151', valor:100, situacao:'Em estoque', obs:'caixa amassada' }),
    C31('pB', { cat:'Booster Box', colecao:'Caos', qtd:2, valor:150, situacao:'Em estoque' }),
    C31('pB1', { cat:'Booster Box', colecao:'Caos', qtd:2, valor:150, situacao:'Vendido', loteOrigem:'pB' }),
    C31('pC', { cat:'Mini BB', colecao:'Pitch', valor:100, valorOrig:200, situacao:'Coleção' }),
    C31('pC1', { cat:'Mini BB', colecao:'Pitch', valor:150, situacao:'Vendido', loteOrigem:'pC' }),
    C31('pD', { cat:'ETB', colecao:'Fagulhas', valor:300, valorOrig:300, situacao:'Aberto' }),
    C31('pD1', { cat:'Single/Carta', colecao:'Fagulhas', codigo:'Pikachu (160/159)', valor:120, situacao:'Em estoque', loteOrigem:'pD', origem:'ABERTURA' }),
    C31('pD2', { cat:'Single/Carta', colecao:'Fagulhas', codigo:'Mew (151/165)', valor:180, situacao:'Coleção', loteOrigem:'pD', origem:'ABERTURA' }),
    C31('pE', { cat:'Sleeved', colecao:'Caos', valor:23.09, situacao:'Aberto' }),
    C31('pF', { cat:'Booster Box', colecao:'151', qtd:2, valor:400, situacao:'Em estoque' }),
    C31('pF1', { cat:'Booster Box', colecao:'151', qtd:1, valor:200, situacao:'Trocado', loteOrigem:'pF' }),
    C31('pG', { cat:'Single/Carta', codigo:'Charizard (199/165)', valor:180, situacao:'Em estoque', origem:'TROCA', obs:'Charizard (🔄 troca: dei 151 · Booster Box (1 un))' }),
    C31('pH', { cat:'Booster', colecao:'Ninja', valor:50, situacao:'Vendido', loteOrigem:'naoExisteMais' }),
    C31('pH2', { cat:'Booster', colecao:'Ninja', valor:30, situacao:'Em estoque', loteOrigem:'naoExisteMais' }),
    C31('pN', { cat:'Booster Box', colecao:'Abbys', valor:400, situacao:'Aberto', notaId:'N30', notaNum:'30' }),
    C31('pN2', { cat:'ETB', colecao:'Abbys', valor:100, situacao:'Em estoque', notaId:'N30', notaNum:'30' }),
    C31('pN1', { cat:'Booster', colecao:'Abbys', qtd:9, valor:200, situacao:'Em estoque', loteOrigem:'pN', origem:'ABERTURA' }),
    C31('pN3', { cat:'Booster', colecao:'Abbys', qtd:9, valor:200, situacao:'Coleção', loteOrigem:'pN', origem:'ABERTURA' }),
    { id:'v1', tipo:'VENDA', data:'2026-08-05', jogo:'Pokémon', cat:'Booster Box', qtd:2, valor:200, canal:'App', taxa:10, recDias:14, origemId:'pB1', custoOrigem:150, contraparte:'Cli' },
    { id:'v2', tipo:'VENDA', data:'2026-09-02', jogo:'Pokémon', cat:'Outro', qtd:1, valor:1000, canal:'Pix', taxa:0, contraparte:'Cli' },
    { id:'v3', tipo:'VENDA', data:'2026-08-07', jogo:'Pokémon', cat:'Booster', qtd:1, valor:80, canal:'Pix', taxa:0, origemId:'pH', contraparte:'Cli' },
    { id:'d1', tipo:'DESPESA', data:'2026-08-02', cat:'Embalagens', valor:30, status:'pago', natureza:'material' },
    { id:'d2', tipo:'DESPESA', data:'2099-01-01', cat:'Aluguel', valor:70, status:'apagar', natureza:'ordinaria' }
  ];
  setg('movs', JSON.parse(JSON.stringify(fx31)));
  setg('contasBanc', []);
  setg('perDe', '2026-08-14'); setg('perAte', '2026-08-31');
  const antes31 = JSON.stringify(g('movs'));
  /* save e const no app (nao da pra trocar por um espiao): a prova de "nada gravado" e a memoria local (store)
     e os lancamentos identicos antes e depois — que e o que o save mudaria */
  const loja31 = JSON.stringify(store);
  const P31 = A('montarPlanilhaTCG')(), R31 = P31.resumo;
  t('31: o Resumo e TUDO mesmo com a tela filtrada de 14/08 a 31/08 (comprei 2110, nao o do periodo)', R31.comprei === 2110, JSON.stringify({ comprei:R31.comprei }));
  t('31: o periodo da tela (de e ate) volta como estava depois de gerar', g('perDe') === '2026-08-14' && g('perAte') === '2026-08-31', g('perDe') + ' ' + g('perAte'));
  t('31: gerar a planilha nao muda nenhum lancamento nem grava nada na memoria local', JSON.stringify(g('movs')) === antes31 && JSON.stringify(store) === loja31, 'memoria local mudou: ' + (JSON.stringify(store) !== loja31));
  t('31: a ponte da aba Compras fecha no comprei (dinheiro + troca - saiu em troca - aberta sem pedaco)',
    R31.ponte.resultado === 2110 && R31.ponte.dinheiro === 2153.09 && R31.ponte.saiuTroca === 200 && R31.ponte.abertoFora === 23.09 && R31.ponte.troca === 180, JSON.stringify(R31.ponte));
  t('31: aba Compras com 1 linha por compra (caixa da nota com os pedacos numa linha; 2 pedacos de compra apagada numa linha): 10, somando 2333,09',
    R31.linhas.find(x => x.aba === 'Compras').n === 10 && R31.somaCompras === 2333.09, JSON.stringify([R31.linhas, R31.somaCompras]));
  t('31: so a compra com valor registrado diferente da soma das partes vai para conferir', R31.nConferir === 1, String(R31.nConferir));
  t('31: lucro real = o do Relatorios (receita de todas - custo das ligadas), com o das ligadas separado',
    R31.lucroReal === 1110 && R31.lucroVinculadas === 30 && R31.vendasSemVinculo === 2, JSON.stringify([R31.lucroReal, R31.lucroVinculadas, R31.vendasSemVinculo]));
  const tituloLucro31 = aba31(P31, 'Resumo').linhas.filter(x => x && x.celulas && x.celulas[0]).map(x => String(x.celulas[0].v)).filter(x => /^Lucro real —/.test(x));
  t('31h: o bloco Lucro real do Resumo diz "pela conta do Relatório" (não promete igualdade de centavo com o card, que arredonda grupo por grupo) e a linha explica a diferença de centavos',
    JSON.stringify(tituloLucro31) === JSON.stringify(['Lucro real — pela conta do Relatório'])
    && /não pela data da compra\. O card Lucro real do Relatório pode diferir em centavos: ele arredonda grupo por grupo \(coleção, jogo…\) e aqui o arredondamento é um só\.$/.test(res31(P31, 'Lucro real').t),
    JSON.stringify([tituloLucro31, res31(P31, 'Lucro real').t]));
  t('31: despesa a pagar com data futura nao entra no Resumo', R31.despesas === 30, String(R31.despesas));
  t('31: todas as conferencias que a planilha escreve no Resumo fecham', R31.conferencia.every(c => c.ok), JSON.stringify(R31.conferencia.filter(c => !c.ok)));
  const u31 = P31.dados; let bin31 = ''; for (let i = 0; i < u31.length; i++) bin31 += String.fromCharCode(u31[i]);
  t('31: o arquivo e um .xlsx (zip) com as 6 abas', bin31.slice(0, 2) === 'PK' && bin31.indexOf('xl/worksheets/sheet6.xml') >= 0 && bin31.indexOf('xl/worksheets/sheet7.xml') < 0, bin31.slice(0, 2));
  const cmp31 = aba31(P31, 'Compras'), tod31 = aba31(P31, 'Todos os lançamentos'), ven31 = aba31(P31, 'Vendas');
  const amarelos31 = cmp31.linhas.map((l, i) => cmp31.destacar[i] ? l[l.length - 1] : '').filter(Boolean).sort();
  t('31: as linhas amarelas da aba Compras sao as 3 que pedem conferencia (valor divergente, aberta sem pedaco, compra apagada)',
    amarelos31.join() === 'pC,pE,pH' && R31.nAmarelas === 3 && R31.nOrfas === 1 && R31.nAbertoSemPedaco === 1,
    JSON.stringify([amarelos31, R31.nAmarelas, R31.nOrfas, R31.nAbertoSemPedaco]));
  t('31: a linha da compra apagada comeca pelo problema e conta os pedacos', cel31(cmp31, 'pH', 'Conferir') === 'Compra não existe mais no app, mas 2 pedaços dela ainda estão lançados', String(cel31(cmp31, 'pH', 'Conferir')));
  t('31: em Todos os lancamentos, as caixas abertas com pedacos (fora e dentro de nota) e a aberta sem pedaco dizem por que nao entram',
    cel31(tod31, 'pD', 'Entra no Resumo?') === 'não — o que saiu de dentro entra no lugar' && cel31(tod31, 'pN', 'Entra no Resumo?') === 'não — o que saiu de dentro entra no lugar'
    && cel31(tod31, 'pE', 'Entra no Resumo?') === 'não — item aberto sem nada lançado dentro (conferir)',
    JSON.stringify([cel31(tod31, 'pD', 'Entra no Resumo?'), cel31(tod31, 'pN', 'Entra no Resumo?'), cel31(tod31, 'pE', 'Entra no Resumo?')]));
  t('31: situacao hoje com seta so depois de "aberto"; troca sem Pagamento repetido e com a troca toda na coluna dela',
    cel31(cmp31, 'pD', 'Situação hoje') === '1 aberto → saíram 2 Single/Carta (1 no estoque · 1 na coleção)' && cel31(cmp31, 'pG', 'Pagamento') === ''
    && cel31(cmp31, 'pG', 'Na troca você deu (a troca toda)') === '1 151 · Booster Box' && cel31(tod31, 'pF1', 'Situação') === 'Saiu em troca',
    JSON.stringify([cel31(cmp31, 'pD', 'Situação hoje'), cel31(cmp31, 'pG', 'Pagamento'), cel31(cmp31, 'pG', 'Na troca você deu (a troca toda)'), cel31(tod31, 'pF1', 'Situação')]));
  t('31: em Todos, pedaco de item aberto e item recebido em troca ficam sem Pagamento (o app grava "À vista" neles); compra normal mantem',
    cel31(tod31, 'pD1', 'Pagamento') === '' && cel31(tod31, 'pN1', 'Pagamento') === '' && cel31(tod31, 'pG', 'Pagamento') === '' && cel31(tod31, 'pA', 'Pagamento') === 'À vista',
    JSON.stringify(['pD1', 'pN1', 'pG', 'pA'].map(x => cel31(tod31, x, 'Pagamento'))));
  t('31: sem codigo divergente nem custo por unidade diferente, o Resumo nao mostra a linha do codigo e nenhuma compra pinta por unidade',
    res31(P31, 'Código a conferir').v === undefined && R31.nUnidDif === 0,
    JSON.stringify([res31(P31, 'Código a conferir'), R31.nUnidDif]));
  t('31: o comprei do Resumo conta os lancamentos pela regra do Painel (14 dos 18: sem as 2 caixas abertas, o item aberto e o que saiu em troca)',
    res31(P31, 'comprei (mercadoria)').t.indexOf('14 lançamentos de compra (') === 0, res31(P31, 'comprei (mercadoria)').t);
  /* o comparativo do Relatorio agora e provado pela CONTA, na 31f (revisor fiacao r5, M1: esta busca no texto do fonte era enganada por um
     comentario com o texto certo e a lista crua na linha) */
  t('31: carta sai "Nome (código)"; lacrado sem nome sai "Coleção · Tipo — texto" sem repetir a observação',
    cel31(cmp31, 'pG', 'Item') === 'Charizard (199/165)' && cel31(cmp31, 'pA', 'Item') === '151 · ETB — caixa amassada' && cel31(cmp31, 'pA', 'Observação') === '',
    JSON.stringify([cel31(cmp31, 'pG', 'Item'), cel31(cmp31, 'pA', 'Item'), cel31(cmp31, 'pA', 'Observação')]));
  t('31: venda do app: taxa como fracao, recebe na data do repasse; aba Todos sem total',
    cel31(ven31, 'v1', 'Taxa do app %') === 0.1 && cel31(ven31, 'v1', 'Recebe em') === '2026-08-19' && tod31.total === false,
    JSON.stringify([cel31(ven31, 'v1', 'Taxa do app %'), cel31(ven31, 'v1', 'Recebe em'), tod31.total]));
  setg('perDe', ''); setg('perAte', '');
  const rM31 = A('motor')(false);
  t('31: textos do Resumo: amarelas com os motivos, vendas sem vinculo, margem do Painel, a conta do Resultado bruto e o Investido total',
    res31(P31, 'Compras em amarelo').t === '3 na aba Compras: 1 com os pedaços somando diferente do valor registrado na compra · 1 compra que não existe mais no app, mas ainda tem pedaços lançados · 1 item aberto sem nada lançado dentro. A coluna Conferir diz o quê.'
    && res31(P31, 'Vendas sem vínculo').t.indexOf('2 na aba Vendas') === 0
    && res31(P31, 'Resultado bruto').t.indexOf('Margem do que já saiu: ' + pct31(rM31.lucro / rM31.cmv) + ' sobre o custo.') >= 0
    && res31(P31, 'Resultado bruto').t.indexOf('Dá o mesmo que vendi (líquido) − custo do que já vendeu − despesas.') >= 0
    && res31(P31, 'Investido total').v === 2140,
    JSON.stringify([res31(P31, 'Compras em amarelo').t, res31(P31, 'Resultado bruto').t, res31(P31, 'Investido total').v]));
  t('31: o ✓ das compras diz o que NAO confere e conta as compras divididas com valor registrado (2 das 5); os outros ✓ nomeiam so abas',
    res31(P31, '✓ = comprei (mercadoria)').t.indexOf('quem diz é a coluna Conferir, que soma os pedaços contra o valor registrado (só 2 das 5 compras divididas em pedaços têm esse valor) e compara o custo por unidade entre eles.') >= 0
    && res31(P31, '✓ Vendas, Estoque e coleção, Despesas').t === 'Fecham com o Painel: o líquido das vendas, o custo e o Vale do que está com você, as despesas e a conta do Resultado bruto.'
    && /a planilha não volta para o app/.test(String(aba31(P31, 'Resumo').linhas[2].celulas[0].v)),
    JSON.stringify([res31(P31, '✓ = comprei (mercadoria)').t, res31(P31, '✓ Vendas, Estoque e coleção, Despesas').t]));
  /* os textos que o PROPRIO app escreve na observacao nao podem virar nome de item — casos tirados do backup real
     (13/09: "· aberto em boosters" sobrava porque o emoji opcional na regex, sem o flag u, exigia metade dele) */
  const limpa31 = A('_plObsLimpa');
  const casos31 = [
    ['Gem pack 5 (🔄 troca: dei Caos ascendente · Booster Box) · aberto em boosters · 🔓 aberto em 1 item(ns)', 'Gem pack 5'],
    ['Mega chandelur (🔓 de Booster Box)', 'Mega chandelur'],
    ['Maioria bulk · 🔓', 'Maioria bulk'],
    ['nota · +R$ 2.427,32 frete/taxa', ''],
    ['nota · Starter Deck 01 - One Piece', 'Starter Deck 01 - One Piece'],
    ['Sar mega greninja ex (🔄 troca: dei Caos ascendente · ETB (1 un) + Caos ascendente · Triple (2 un) + Caos ascendente · Sleeved (6 un))', 'Sar mega greninja ex'],
    ['aberto em boosters', ''],
    ['Goldeen (087/084) (🔓 de ETB)', 'Goldeen (087/084)']];
  const erradas31 = casos31.filter(([e, s]) => limpa31(e) !== s).map(([e]) => e + ' -> ' + limpa31(e));
  t('31: textos do app saem do nome do item (troca com parenteses dentro, caixa aberta, nota)', erradas31.length === 0, JSON.stringify(erradas31));
  const cnn31 = A('_plCodigoNoNome'), casosCod31 = [
    ['Goldeen (087/084)', 'Goldeen|087/084'], ['Kecleon(213/191)', 'Kecleon|213/191'], ['Pikachu (Promo) (160/159)', 'Pikachu (Promo)|160/159'],
    ['Charmander (168jp/165)', 'Charmander|168jp/165'], ['Gardevoir (TG05/TG30)', 'Gardevoir|TG05/TG30'], ['Lote (12/08)', ''], ['Book (10/2025)', ''],
    ['Carta (1/3)', ''], ['151 (151/165)', ''], ['Promo (SVP 053)', ''], ['Treecko (055/∞)', 'Treecko|055/∞']];
  const errCod31 = casosCod31.filter(([e, s]) => { const k = cnn31(e); return (k ? k.nome + '|' + k.cod : '') !== s; }).map(([e]) => e + ' -> ' + JSON.stringify(cnn31(e)));
  t('31: codigo escrito junto do nome so e lido com formato de codigo de carta (data, ano, 1/3 e nome so de numero ficam de fora)', errCod31.length === 0, JSON.stringify(errCod31));
  /* controle negativo: sem a exclusao da caixa aberta a ponte TEM de acusar — senao este teste nao mede nada */
  const _co31 = g('compraOriginalDe');
  setg('compraOriginalDe', function(id, c){ const r = _co31(id, c); if (r) r.custo = Math.round(r.fam.reduce((s, x) => s + (+x.valor || 0), 0) * 100) / 100; return r; });
  const Rn31 = A('montarPlanilhaTCG')().resumo;
  setg('compraOriginalDe', _co31);
  t('31 (controle negativo): contando a caixa aberta de novo, a conferencia da aba Compras acusa', Rn31.conferencia[0].ok === false, JSON.stringify(Rn31.ponte));
  /* controle negativo da celula (revisor numero r4, M3): 1 centavo a mais so na celula de Custo total, com a soma sem arredondar certa,
     passava na folga antiga (o proprio centavo entrava na folga) e a planilha escrevia "✓ Fecha com o Painel" */
  setg('compraOriginalDe', function(id, c){ const r = _co31(id, c); if (r) r.custo = Math.round((r.custo + 0.01) * 100) / 100; return r; });
  let Rc1c31; try { Rc1c31 = A('montarPlanilhaTCG')().resumo; } finally { setg('compraOriginalDe', _co31); }
  t('31 (controle negativo): 1 centavo a mais numa celula de Custo total, com a soma sem arredondar certa, faz a conferencia de Compras acusar',
    Rc1c31.conferencia[0].ok === false, JSON.stringify(Rc1c31.conferencia[0]));
  /* controle negativo da folga: sem fracao de centavo nenhuma, 1 centavo de diferenca real TEM de acusar (a folga antiga, 0,005 por
     linha, aceitava ate R$ 0,62 no backup — revisor numero r3, M1) */
  const _motF31 = g('motor');
  setg('motor', function (f) { const r = _motF31(f); r.vendasLiq = r.vendasLiq + 0.01; return r; });
  let Rv31; try { Rv31 = A('montarPlanilhaTCG')().resumo; } finally { setg('motor', _motF31); }
  t('31 (controle negativo): 1 centavo a mais no vendi do Painel faz a conferencia de Vendas acusar', Rv31.conferencia[1].ok === false, JSON.stringify(Rv31.conferencia[1]));

  /* ---- as TELAS com a mesma conta: rodape, cabecalho do mes, barra de Todos, card da nota, card dos pedacos, faixa, verLote, aba
     Trocas, aba vazia e o card Comprei do Relatorio (revisores disco r2 G1, disco r3 G1/M1/M2/L1/L2, numero r3 G1) ---- */
  const hN31 = telaCons31('COMPRA', 'notas', ''), rN31 = rodape31(hN31);
  t('31: Compras por nota: o rodape da o comprei do Painel (2110), diz quantas das 18 compras entram nele (14) e o que ficou fora, depois do valor',
    rN31.n === 18 && rN31.rot === '14 entram no total comprado' && rN31.v === fmt31(2110) && /caixa aberta conta pelo que saiu dela/.test(rN31.nota)
    && rN31.nota === 'como no Painel: caixa aberta conta pelo que saiu dela, e o que saiu em troca (' + fmt31(200) + ') conta pelo que você recebeu, na data em que cada um foi lançado · item aberto sem nada lançado dentro (' + fmt31(23.09) + ') fica fora', JSON.stringify(rN31));
  const iNota31 = hN31.indexOf("abrirNota('N30')"), cardNota31 = iNota31 >= 0 ? hN31.slice(iNota31, iNota31 + 2500) : '';
  t('31: o card da nota tira a caixa aberta (R$ 100 na nota; a caixa de R$ 400 conta pelos pedacos) e o card dos pedacos diz de onde sairam',
    cardNota31.indexOf('<div style="font-weight:700">' + fmt31(100) + '</div>') >= 0 && cardNota31.indexOf('sem a caixa aberta (' + fmt31(400) + '), que conta pelo que saiu dela') >= 0
    && hN31.indexOf('o que saiu de Booster Box aberto · 2 partes') >= 0 && hN31.indexOf('compra de 0 ') < 0, cardNota31.slice(0, 300));
  const hF31 = telaCons31('COMPRA', 'notas', 'Fagulhas'), rF31 = rodape31(hF31);
  t('31: buscando a compra, o card do lote e o rodape dizem o mesmo total (300) e a caixa nao soma de novo',
    rF31.n === 3 && rF31.v === fmt31(300) && /caixa aberta conta pelo que saiu dela/.test(rF31.nota) && hF31.indexOf(fmt31(600)) < 0
    && hF31.indexOf('<div style="font-weight:700">' + fmt31(300) + '</div>') >= 0, JSON.stringify(rF31));
  const hI31 = telaCons31('COMPRA', 'itens', '', 'pD1');
  t('31: a faixa do pedaco diz o custo total da compra sem a caixa aberta', hI31.indexOf('custo total ' + fmt31(300) + ' em 3 parte') >= 0,
    (hI31.match(/custo total[^·<]*/) || ['(faixa nao apareceu)'])[0]);
  const cap31 = [], _ins31 = ctx.document.body.insertAdjacentHTML;
  ctx.document.body.insertAdjacentHTML = (pos, h) => { cap31.push(String(h)); };
  try { A('verLote')('pD1'); } finally { ctx.document.body.insertAdjacentHTML = _ins31; }
  const hV31 = cap31.join('');
  t('31: o verLote soma a compra sem a caixa aberta e diz por que', hV31.indexOf('Custo total do lote: <b>' + fmt31(300) + '</b>') >= 0 && /a caixa aberta não soma de novo/.test(hV31),
    (hV31.match(/Custo total do lote:[^<]*<b>[^<]*/) || ['(verLote nao desenhou nada)'])[0]);
  const capE31 = [];
  ctx.document.body.insertAdjacentHTML = (pos, h) => { capE31.push(String(h)); };
  try { A('verLote')('pE'); } finally { ctx.document.body.insertAdjacentHTML = _ins31; }
  const hVE31 = capE31.join('');
  t('31h: o verLote do item aberto SEM nada lançado dentro (Sleeved de R$ 23,09) diz que nada de dentro foi lançado e que o valor não entra no comprei do Painel, e soma no custo do lote; o aberto COM pedaços (ETB) segue "foi aberto em itens"',
    hVE31.indexOf('foi aberto, mas nada de dentro foi lançado: esse valor não entra no comprei do Painel') >= 0 && hVE31.indexOf('foi aberto em itens') < 0
    && hVE31.indexOf('Custo total do lote: <b>' + fmt31(23.09) + '</b>') >= 0 && hV31.indexOf('foi aberto em itens') >= 0 && hV31.indexOf('nada de dentro foi lançado') < 0,
    JSON.stringify([(hVE31.match(/<div class="meta">[^<]*<\/div>/) || [''])[0], (hVE31.match(/Custo total do lote:[^<]*<b>[^<]*/) || [''])[0], (hV31.match(/<div class="meta">foi aberto[^<]*/) || [''])[0]]));
  const hT31 = telaCons31('TROCA', 'itens', ''), rT31 = rodape31(hT31);
  t('31: a aba Trocas soma tudo o que se movimentou (380), sem a conta do Painel e sem a frase',
    rT31.v === fmt31(380) && rT31.rot === 'movimentado em trocas (custo)' && !rT31.nota && hT31.indexOf('como no Painel') < 0, JSON.stringify(rT31));
  const hA31 = telaCons31('tudo', 'itens', '');
  t('31: em Todos, a barra e o cabecalho do mes dao o comprei do Painel (2110, nao 3033,09) e a frase aparece',
    hA31.indexOf('🛒 comprado <b>' + fmt31(2110) + '</b>') >= 0 && hA31.indexOf('🛒 ' + fmt31(2110)) >= 0 && hA31.indexOf(fmt31(3033.09)) < 0
    && /<span style="display:block;font-size:10px;color:var\(--mut\)">como no Painel: /.test(hA31), (hA31.match(/🛒[^<]*<b>[^<]*/) || [''])[0]);
  const hE31 = telaCons31('PEDIDO', 'notas', '');
  t('31: aba vazia na vista por nota diz "Nada nesse filtro." e mantem o botao da planilha', hE31.indexOf('Nada nesse filtro.') >= 0 && hE31.indexOf('onclick="exportarPlanilha()"') >= 0, hE31.slice(-300));
  setg('tela', 'relatorios'); setg('relDet', true); setg('relCompView', 'lista'); setg('relJogo', ''); setg('relCol', ''); setg('relPess', ''); setg('relCat', '');
  const hR31 = A('vRelatorios')(), iR31 = hR31.indexOf('📥 Comprei'), fR31 = hR31.indexOf('📤 Vendi', iR31), tR31 = iR31 >= 0 ? hR31.slice(iR31, fR31 > iR31 ? fR31 : undefined) : '';
  setg('relDet', false);
  t('31: o card Comprei do Relatorio usa a conta do Painel (sem a caixa aberta, o item aberto e o que saiu em troca)',
    iR31 >= 0 && ['pD', 'pE', 'pF1', 'pN'].every(x => tR31.indexOf("abrir('" + x + "')") < 0) && ['pD1', 'pN1', 'pG'].every(x => tR31.indexOf("abrir('" + x + "')") >= 0),
    tR31.slice(0, 240));
  t('31: o Comprei do Relatorio diz como caixa aberta, troca e item aberto sem nada dentro contam, na data de cada lancamento',
    hR31.indexOf('no período · como no Painel: caixa aberta conta pelo que saiu dela, e o que saiu em troca pelo que você recebeu, na data em que cada um foi lançado; item aberto sem nada lançado dentro fica fora') >= 0,
    (hR31.match(/no período · como no Painel:[^<]*/) || [''])[0]);
  t('31: a faixa da vista por nota diz "menos a caixa aberta" so quando uma nota da tela tem caixa aberta',
    hN31.indexOf('O valor do card é a nota inteira, menos a caixa aberta, mesmo quando esta aba mostra só parte dela.') >= 0
    && hF31.indexOf('O valor do card é a nota inteira, mesmo quando esta aba mostra só parte dela.') >= 0 && hF31.indexOf('menos a caixa aberta') < 0,
    JSON.stringify([(hN31.match(/O valor do card[^<]*/) || [''])[0], (hF31.match(/O valor do card[^<]*/) || [''])[0]]));
  setg('consQ', ''); setg('expandId', null); setg('consF', 'tudo'); setg('consVer', 'itens');
  setg('_provaCache', null);
  const lista31 = (A('provaReal')() || {}).A || [];
  t('31: diagLote e a prova real nao acusam a caixa aberta com pedacos (registrado 300 = pedacos 120 + 180)',
    A('diagLote')('pD') === null && !lista31.some(x => x.sev === 'vermelho' && /Fagulhas/.test(x.titulo)) && lista31.some(x => /Pitch/.test(x.titulo)),
    JSON.stringify(lista31.map(x => x.sev + ': ' + x.titulo)));
  const _cf31 = ctx.confirm, _apr31 = g('abrirProvaReal');
  ctx.confirm = () => true; setg('abrirProvaReal', () => {});
  g('movs').find(x => x.id === 'pD').valorOrig = 1;
  try { A('aceitarConservacao')('pD'); } finally { ctx.confirm = _cf31; setg('abrirProvaReal', _apr31); }
  t('31: aceitar a soma como referencia grava 300 (os pedacos), nao 600 (caixa + pedacos)', g('movs').find(x => x.id === 'pD').valorOrig === 300,
    String(g('movs').find(x => x.id === 'pD').valorOrig));
  /* nota PARCELADA com caixa aberta (le-como-felype r4): o card da nota diz que a parcela e da nota inteira; o card dos pedacos nao
     repete a parcela e mostra so o que saiu ("Abbys · 18 Booster", sem "· ·" e sem "(aberto)"); compra avulsa com uma caixa aberta
     diz "saíram 18 Booster" depois da situacao; nota com item aberto SEM pedacos continua inteira (so a caixa redistribuida sai); e o
     toque no Relatorio abre a Consulta pela colecao, nao por busca de texto (revisores numero r4 M2 e disco r4 M2) */
  const PK31 = { pgTipo:'Parcelado', nParc:3, venc1:'2026-09-10' };
  setg('movs', [
    C31('kN', Object.assign({ cat:'Booster Box', colecao:'Abbys', valor:300, situacao:'Aberto', notaId:'N40', notaNum:'40' }, PK31)),
    C31('kN2', Object.assign({ cat:'ETB', colecao:'Abbys', valor:90, situacao:'Em estoque', notaId:'N40', notaNum:'40' }, PK31)),
    C31('kN1', { cat:'Booster', colecao:'Abbys', qtd:9, valor:150, situacao:'Em estoque', loteOrigem:'kN', origem:'ABERTURA' }),
    C31('kN3', { cat:'Booster', colecao:'Abbys', qtd:9, valor:150, situacao:'Coleção', loteOrigem:'kN', origem:'ABERTURA' }),
    C31('kS', { cat:'Booster Box', valor:100, situacao:'Aberto', notaId:'N41', notaNum:'41' }),
    C31('kS1', { cat:'Booster', qtd:5, valor:50, situacao:'Em estoque', loteOrigem:'kS', origem:'ABERTURA' }),
    C31('kS2', { cat:'Booster', qtd:5, valor:50, situacao:'Em estoque', loteOrigem:'kS', origem:'ABERTURA' }),
    C31('kE', { cat:'Sleeved', valor:23, situacao:'Aberto', notaId:'N42', notaNum:'42' }),
    C31('kE2', { cat:'ETB', valor:77, situacao:'Em estoque', notaId:'N42', notaNum:'42' }),
    C31('kM', { cat:'Booster Box', colecao:'Caos', valor:100, situacao:'Em estoque' }),
    C31('kM1', { cat:'Booster Box', colecao:'Caos', valor:100, situacao:'Aberto', loteOrigem:'kM' }),
    C31('kM2', { cat:'Booster', colecao:'Caos', qtd:18, valor:100, situacao:'Em estoque', loteOrigem:'kM1', origem:'ABERTURA' }),
    C31('kC', { cat:'ETB', colecao:'Caos ascendente', valor:70, situacao:'Em estoque' }),
    C31('kP', { cat:'ETB', colecao:'Caos ascendente', valor:30, situacao:'Em estoque', contraparte:'' })]);
  const hK31 = telaCons31('COMPRA', 'notas', '');
  const trecho31 = (h, marca) => { const i = h.indexOf(marca); if (i < 0) return ''; const j = h.indexOf('class="item"', i); return h.slice(i, j > i ? j : i + 1600); };
  const cN40 = trecho31(hK31, "abrirNota('N40')"), cN42 = trecho31(hK31, "abrirNota('N42')"), cLN = trecho31(hK31, "verLote('kN')"), cLS = trecho31(hK31, "verLote('kS')"), cLM = trecho31(hK31, "verLote('kM')");
  t('31: nota parcelada com caixa aberta: o negrito sai sem a caixa e a parcela diz "nota inteira"; nota com item aberto sem pedacos fica inteira',
    cN40.indexOf('<div style="font-weight:700">' + fmt31(90) + '</div>') >= 0 && cN40.indexOf('3× ' + fmt31(130) + ' · nota inteira') >= 0
    && cN42.indexOf('<div style="font-weight:700">' + fmt31(100) + '</div>') >= 0 && cN42.indexOf('sem a caixa aberta') < 0, JSON.stringify([cN40.slice(0, 900), cN42.slice(0, 600)]));
  t('31: card dos pedacos de caixa numa nota parcelada: "3× — na nota" sem repetir a parcela, e so o que saiu ("Abbys · 18 Booster"; sem colecao, "10 Booster")',
    cLN.indexOf('3× — na nota') >= 0 && cLN.indexOf('🧩 Abbys · 18 Booster') >= 0 && cLN.indexOf('(aberto)') < 0 && cLN.indexOf('· ·') < 0 && cLN.indexOf('3× ' + fmt31(100)) < 0
    && cLS.indexOf('🧩 10 Booster') >= 0 && cLS.indexOf('à vista') >= 0, JSON.stringify([cLN.slice(0, 900), cLS.slice(0, 600)]));
  t('31: compra avulsa com uma caixa aberta: "compra de 2 Booster Box", a situacao e "saíram 18 Booster" (nunca somado, nunca "(aberto)")',
    cLM.indexOf('compra de 2 Booster Box · 3 partes') >= 0 && cLM.indexOf('🧩 Caos · Booster Box · 📦 1 em estoque · 🔓 1 aberto · saíram 18 Booster') >= 0
    && cLM.indexOf('<div style="font-weight:700">' + fmt31(200) + '</div>') >= 0, cLM.slice(0, 900));
  setg('tela', 'relatorios'); setg('relDimAll', 'colecao'); setg('relCompView', 'lista'); setg('relDet', false); setg('relJogo', ''); setg('relCol', ''); setg('relPess', ''); setg('relCat', '');
  const hRK31 = A('vRelatorios')();
  const _renderK31 = g('render'); let colK31 = '', qK31 = '?', hCK31 = '', hSK31 = '';
  setg('render', () => {});
  try {
    A('abrirConsultaPorDim')('Caos'); colK31 = g('consCol'); qK31 = g('consQ'); hCK31 = A('vConsultar')();
    A('abrirConsultaPorDim')('(sem coleção)'); hSK31 = A('vConsultar')();
  } finally { setg('render', _renderK31); setg('consCol', ''); setg('consQ', ''); setg('consF', 'tudo'); }
  t('31: toque numa colecao do Relatorio abre a Consulta filtrada por ela (Caos = 200, sem o "Caos ascendente"); o vazio abre o "(sem coleção)"',
    hRK31.indexOf("abrirConsultaPorDim('Caos','tudo')") >= 0 && hRK31.indexOf("consQ='") < 0 && colK31 === 'Caos' && qK31 === ''
    && hCK31.indexOf('🛒 comprado <b>' + fmt31(200) + '</b>') >= 0 && hSK31.indexOf('🛒 comprado <b>' + fmt31(177) + '</b>') >= 0,
    JSON.stringify([colK31, qK31, (hCK31.match(/🛒 comprado <b>[^<]*/) || [''])[0], (hSK31.match(/🛒 comprado <b>[^<]*/) || [''])[0]]));
  /* o vazio de pessoa tem nome no Relatorio, no campo do filtro e na barra "filtrando" (le-como-felype r5: o campo mostrava "todos" com a
     lista filtrada, e "—" num filtro se le como nenhum filtro) */
  setg('relDimAll', 'pessoa'); setg('tela', 'relatorios');
  const hRP31 = A('vRelatorios')();
  let hPK31 = '', pessK31 = '?';
  setg('render', () => {});
  try { A('abrirConsultaPorDim')('(sem cliente/fornecedor)'); pessK31 = g('consPess'); setg('consFOpen', true); hPK31 = A('vConsultar')(); }
  finally { setg('render', _renderK31); setg('consFOpen', false); setg('consPess', ''); setg('consQ', ''); setg('consF', 'tudo'); setg('relDimAll', 'colecao'); }
  t('31: o vazio de pessoa tem nome ("(sem cliente/fornecedor)") no Relatorio, no campo do filtro da Consulta e na barra, e abre com o mesmo valor',
    hRP31.indexOf("abrirConsultaPorDim('(sem cliente/fornecedor)','tudo')") >= 0 && hRP31.indexOf("abrirConsultaPorDim('—'") < 0 && pessK31 === '(sem cliente/fornecedor)'
    && hPK31.indexOf('<option selected>(sem cliente/fornecedor)</option>') >= 0 && hPK31.indexOf('filtrando: (sem cliente/fornecedor)') >= 0 && hPK31.indexOf('🛒 comprado <b>' + fmt31(30) + '</b>') >= 0,
    JSON.stringify([pessK31, (hPK31.match(/filtrando: [^<]*/) || [''])[0], (hPK31.match(/🛒 comprado <b>[^<]*/) || [''])[0]]));
  const ordAnt31 = g('consOrd'); let hGP31 = '';
  setg('consOrd', 'pessoa');
  try { hGP31 = telaCons31('tudo', 'itens', ''); } finally { setg('consOrd', ordAnt31); }
  t('31: na Consulta agrupada por pessoa, o grupo sem cliente/fornecedor tem o mesmo nome do filtro e do Relatorio',
    hGP31.indexOf('(sem cliente/fornecedor)') >= 0, (hGP31.match(/.{0,80}sem cliente.{0,40}/) || [hGP31.slice(0, 200)])[0]);
  /* a regra da caixa aberta pede as 3 coisas: caixa em Aberto, filho que e COMPRA e filho com origem ABERTURA, com e sem o mapa */
  setg('movs', [C31('zA', { cat:'ETB', valor:50, situacao:'Aberto' }), { id:'zV', tipo:'VENDA', data:'2026-08-02', valor:10, loteOrigem:'zA', origem:'ABERTURA' },
    C31('zB', { cat:'ETB', valor:50, situacao:'Aberto' }), C31('zB1', { cat:'Booster', valor:50, situacao:'Em estoque', loteOrigem:'zB' }),
    C31('zC', { cat:'ETB', valor:50, situacao:'Em estoque' }), C31('zC1', { cat:'Booster', valor:50, situacao:'Em estoque', loteOrigem:'zC', origem:'ABERTURA' }),
    C31('zD', { cat:'ETB', valor:50, situacao:'Aberto' }), C31('zD1', { cat:'Booster', valor:50, situacao:'Em estoque', loteOrigem:'zD', origem:'ABERTURA' })]);
  const cr31 = A('caixaRedistribuida'), mapa31 = A('mapaFilhosCompra')(), mv31 = idm => g('movs').find(x => x.id === idm);
  const regra31 = ['zA', 'zB', 'zC', 'zD'].map(idm => [cr31(mv31(idm)), cr31(mv31(idm), mapa31)]);
  t('31: caixa aberta so conta como redistribuida com filho que e COMPRA, com origem ABERTURA e caixa em Aberto (com e sem o mapa)',
    JSON.stringify(regra31) === JSON.stringify([[false, false], [false, false], [false, false], [true, true]]), JSON.stringify(regra31));
  /* 31d: compra fora das situacoes do app quebra a conta do Resultado bruto — a 6a conferencia acusa e a frase some */
  setg('movs', [C31('zX', { cat:'ETB', valor:10, situacao:'Esquisita' })]);
  const Pd31 = A('montarPlanilhaTCG')();
  t('31d: com a conta do Resultado bruto quebrada, a 6a conferencia acusa e a frase "Da o mesmo" some',
    Pd31.resumo.conferencia[5].ok === false && res31(Pd31, 'Resultado bruto').t.indexOf('Dá o mesmo') < 0, JSON.stringify([Pd31.resumo.conferencia[5], res31(Pd31, 'Resultado bruto').t]));

  /* ---- 31c: parcela, nota parcelada, preco da Liga, repasse, venda ligada sem nome, codigo escrito junto do nome, codigo cadastrado
     diferente do escrito, carta sem nome, caractere de controle, compra de um pedaco so com valor registrado diferente, referencia
     com frete e taxa, caixa vendida que virou boosters e venda de R$ 0,00 — com o RELOGIO FIXO em 20/08/2026 12h ---- */
  relogio31(2026, 8, 20, 12, 0);
  const _pl31 = g('_precosLiga');
  try {
    const Q31 = (id, x) => Object.assign({ id, tipo:'COMPRA', data:'2026-08-10', jogo:'Pokémon', idioma:'—', qtd:1, taxa:0, pgTipo:'À vista', destino:'Vender', contraparte:'Loja' }, x);
    const PARC31 = { pgTipo:'Parcelado', nParc:3, venc1:'2026-09-10' }, NOTA31 = { notaId:'N31', notaNum:'77', pgTipo:'Parcelado', nParc:2, venc1:'2026-09-05' };
    const CTRL31 = String.fromCharCode(1) + String.fromCharCode(11) + String.fromCharCode(12);
    setg('movs', [
      Q31('qP', Object.assign({ cat:'Booster Box', colecao:'Surto', qtd:2, valor:200, situacao:'Em estoque' }, PARC31)),
      Q31('qP1', Object.assign({ cat:'Booster Box', colecao:'Surto', qtd:1, valor:100, situacao:'Vendido', loteOrigem:'qP' }, PARC31)),
      Q31('qN1', Object.assign({ cat:'ETB', colecao:'Rivais', valor:60, situacao:'Em estoque' }, NOTA31)),
      Q31('qN2', Object.assign({ cat:'Booster', colecao:'Rivais', valor:40, situacao:'Coleção' }, NOTA31)),
      Q31('qL', { cat:'Single/Carta', codigo:'Umbreon (215/203)', valor:120, situacao:'Em estoque' }),
      /* a observacao passa por limpeza de espaco (tab vertical e form feed sao espaco para a regex), entao o caractere de controle
         que so o filtro do XML tira vai tambem no fornecedor, que chega cru a planilha (revisor: mutacao sem VT/FF passava verde) */
      Q31('qV', { cat:'Single/Carta', codigo:'Espeon (214/203)', valor:90, situacao:'Vendido', obs:'veio com' + CTRL31 + ' marca', contraparte:'Loja' + CTRL31 + 'Centro' }),
      Q31('qX', { cat:'Single/Carta', valor:30, situacao:'Coleção', obs:'Goldeen (087/084) (🔓 de ETB)' }),
      Q31('qR', { data:'2026-08-12', cat:'Booster', colecao:'Surto', valor:150, valorOrig:300, situacao:'Em estoque' }),
      Q31('qB', { data:'2026-08-02', cat:'Booster Box', colecao:'Abbys', valor:300, situacao:'Vendido' }),
      Q31('qB1', { data:'2026-08-02', cat:'Booster', colecao:'Abbys', qtd:18, valor:150, situacao:'Vendido', loteOrigem:'qB' }),
      Q31('qF', { cat:'ETB', colecao:'Rivais', valor:110, valorProduto:100, freteRateio:7, taxaRateio:3, situacao:'Em estoque' }),
      Q31('qM', { cat:'Single/Carta', codigo:'217/217', valor:116.57, situacao:'Coleção', obs:'Mega dragonite ex (271/271)' }),
      Q31('qS', { data:'2026-08-05', cat:'Single/Carta', valor:5, situacao:'Coleção' }),
      Q31('qY', { cat:'Single/Carta', codigo:'Psyduck (226/217)', valor:40, situacao:'Coleção', obs:'psyduck  (226/217)' }),
      Q31('qK', { cat:'Single/Carta', codigo:'Pikachu (025/165)', valor:10, situacao:'Coleção', obs:'Pikachu (026/165)' }),
      Q31('qS2', { data:'2026-08-05', cat:'Single/Carta', codigo:'123/200', valor:4, situacao:'Coleção' }),
      Q31('qT', { cat:'Booster', codigo:'Falinks (123/200)', valor:15, situacao:'Coleção' }),
      Q31('qW', { cat:'Single/Carta', codigo:'Mew (052', valor:8, situacao:'Coleção' }),
      Q31('qU', { cat:'Single/Carta', codigo:'Jolteon (135/165)', valor:50, situacao:'Coleção' }),
      Q31('qC', { cat:'Single/Carta', codigo:'Charmander (004/165)', valor:20, situacao:'Vendido' }),
      Q31('qJ', { cat:'Single/Carta', codigo:'Jolteon', valor:12, situacao:'Coleção' }),
      Q31('qBk', { cat:'Single/Carta', codigo:'Bulk', qtd:15, valor:30, situacao:'Coleção' }),
      { id:'w1', tipo:'VENDA', data:'2026-08-18', jogo:'Pokémon', cat:'Single/Carta', qtd:1, valor:130, canal:'App', taxa:10, recDias:14, origemId:'qV', custoOrigem:90, contraparte:'Cli', conta:'Nubank' },
      { id:'w4', tipo:'VENDA', data:'2026-08-15', jogo:'Pokémon', cat:'Single/Carta', qtd:1, valor:30, canal:'Pix', taxa:0, origemId:'qC', custoOrigem:20, contraparte:'Cli', obs:'Charmander' },
      { id:'w2', tipo:'VENDA', data:'2026-08-12', jogo:'Pokémon', cat:'Booster Box', qtd:1, valor:150, canal:'Pix', taxa:0, origemId:'qP1', custoOrigem:100, contraparte:'Cli' },
      { id:'w3', tipo:'VENDA', data:'2026-08-19', jogo:'Pokémon', cat:'Booster', qtd:1, valor:0, canal:'Pix', taxa:0, contraparte:'Brinde' },
      { id:'e1', tipo:'DESPESA', data:'2026-08-15', cat:'Frete', valor:25, status:'apagar', natureza:'ordinaria' },
      { id:'e2', tipo:'DESPESA', data:'2026-09-15', cat:'Aluguel', valor:70, status:'apagar', natureza:'ordinaria' },
      { id:'e3', tipo:'DESPESA', data:'2026-08-20', cat:'Luz', valor:10, status:'apagar', natureza:'ordinaria' }
    ]);
    setg('contasBanc', [{ nome:'Nubank', saldoIni:0 }]);
    /* o 217/217 tem preco na Liga (como o codigo de energia da Mega dragonite ex no backup real): e ele que da o Vale de R$ 1,74.
       O Jolteon so tem historico: vale o ultimo preco visto */
    setg('_precosLiga', { atualizadoEm:'2026-08-20T10:00:00Z', cartas:{ 'Umbreon (215/203)':{ codigo:'215/203', status:'OK', titulo:'Umbreon (215/203)', versoes:[{ v:'Normal', mn:150, md:175, mx:250 }] }, '217/217':{ codigo:'217/217', status:'OK', titulo:'Energia (217/217)', versoes:[{ v:'Normal', mn:1, md:1.74, mx:3 }] } },
      historico:{ 'Jolteon (135/165)':{ 'Normal':[{ d:'2026-08-01', md:60 }] } } });
    const Pc = A('montarPlanilhaTCG')(), Rc = Pc.resumo;
    const cmpC = aba31(Pc, 'Compras'), venC = aba31(Pc, 'Vendas'), estC = aba31(Pc, 'Estoque e coleção (hoje)');
    t('31c: compra parcelada dividida em pedacos: "3× de" o custo da compra inteira (200 + 100) ÷ 3; itens de nota parcelada dizem "nota inteira"',
      cel31(cmpC, 'qP', 'Pagamento') === '3× de ' + fmt31(100) && cel31(cmpC, 'qN1', 'Pagamento') === '2× — nota inteira' && cel31(cmpC, 'qN2', 'Pagamento') === '2× — nota inteira',
      JSON.stringify([cel31(cmpC, 'qP', 'Pagamento'), cel31(cmpC, 'qN1', 'Pagamento'), cel31(cmpC, 'qN2', 'Pagamento')]));
    t('31c: A pagar = parcelas (200 + 100 da compra dividida, 100 da nota) + despesas a pagar (25 com data passada, 10 com a data de hoje, 70 com data futura)',
      Rc.aPagar === 505 && Rc.despesasFuturasAPagar === 70, JSON.stringify([Rc.aPagar, Rc.despesasFuturasAPagar]));
    t('31c: a frase do A pagar diz o que ainda vence no mes e quanto de cada parte ja esta no caixa (com o que ja passou dentro) e ainda nao esta',
      res31(Pc, 'A pagar (parcelas e despesas)').t === fmt31(10) + ' vence até o fim do mês. Já está descontado no caixa acima: as parcelas de compra que ainda vão vencer (' + fmt31(400) + ') e as despesas com data até hoje (' + fmt31(35) + '), inclusive ' + fmt31(25) + ' que já passaram da data e continuam como a pagar. ' + fmt31(70) + ' de despesas com data futura ainda não.',
      res31(Pc, 'A pagar (parcelas e despesas)').t);
    t('31c: A receber = repasse do app que ainda vai cair (130 com 10% de taxa = 117), fora deste mes',
      Rc.aReceber === 117 && res31(Pc, 'A receber (app)').t === 'Nada cai este mês. Já está somado no caixa acima.', JSON.stringify([Rc.aReceber, res31(Pc, 'A receber (app)').t]));
    t('31c: carta com preco na Liga vale o preco medio da Liga, nao o custo (Vale 175, "Liga, hoje", 55 acima); a pelo custo deixa a diferenca em branco',
      cel31(estC, 'qL', 'Vale') === 175 && cel31(estC, 'qL', 'De onde veio o valor') === 'Liga, hoje' && cel31(estC, 'qL', 'Vale − custo R$') === 55
      && cel31(estC, 'qN1', 'Vale − custo R$') === '' && Rc.valeEstoque === 695
      && res31(Pc, '+ no estoque (a custo)').t === 'Vale ~' + fmt31(695) + ' · 1/5 com preço da Liga, 4 pelo custo.',
      JSON.stringify([cel31(estC, 'qL', 'Vale'), cel31(estC, 'qL', 'De onde veio o valor'), cel31(estC, 'qN1', 'Vale − custo R$'), Rc.valeEstoque, res31(Pc, '+ no estoque (a custo)').t]));
    t('31c: venda ligada sem nome proprio leva o nome e o codigo da carta de onde saiu',
      cel31(venC, 'w1', 'Item') === 'Espeon (214/203)' && cel31(venC, 'w1', 'Código') === '214/203', JSON.stringify([cel31(venC, 'w1', 'Item'), cel31(venC, 'w1', 'Código')]));
    t('31c: codigo escrito junto do nome vai para a coluna Codigo; a observacao que so repete o nome some, a que traz outro codigo fica',
      cel31(estC, 'qX', 'Item') === 'Goldeen (087/084)' && cel31(estC, 'qX', 'Código') === '087/084' && cel31(estC, 'qX', 'Observação') === ''
      && cel31(estC, 'qY', 'Item') === 'Psyduck (226/217)' && cel31(estC, 'qY', 'Observação') === ''
      && cel31(estC, 'qM', 'Item') === 'Mega dragonite ex (217/217)' && cel31(estC, 'qM', 'Observação') === 'Mega dragonite ex (271/271)'
      && cel31(estC, 'qS', 'Item') === 'Single/Carta (sem nome)' && cel31(estC, 'qS2', 'Item') === 'Single/Carta (sem nome, 123/200)'
      && cel31(estC, 'qW', 'Item') === 'Mew' && cel31(estC, 'qT', 'Item') === 'Falinks',
      JSON.stringify(['qX', 'qY', 'qM', 'qS', 'qS2', 'qW', 'qT'].map(x => [cel31(estC, x, 'Item'), cel31(estC, x, 'Código'), cel31(estC, x, 'Observação')])));
    t('31c: codigo a conferir ja na 1a tela: pela observacao diferente (Liga ou custo) e pelo nome no campo Codigo (carta de 1 unidade); o lote de cartas fica de fora; o Resumo conta os 4',
      cel31(estC, 'qM', 'De onde veio o valor') === 'Liga, código a conferir' && cel31(estC, 'qM', 'Vale') === 1.74 && cel31(estC, 'qK', 'De onde veio o valor') === 'custo, código a conferir'
      && cel31(estC, 'qY', 'De onde veio o valor') === 'custo (sem preço na Liga)' && estC.colunas[col31(estC, 'De onde veio o valor')].larg === 24
      && cel31(estC, 'qW', 'De onde veio o valor') === 'custo, código a conferir' && cel31(estC, 'qJ', 'De onde veio o valor') === 'custo, código a conferir' && cel31(estC, 'qBk', 'De onde veio o valor') === 'custo (sem preço na Liga)'
      && res31(Pc, 'Código a conferir').t === '4 na aba Estoque e coleção (coluna De onde veio o valor): 2 com o código da Observação diferente do que está no Item (o Vale sai pelo código do Item) e 2 com o nome da carta no campo Código (o Vale sai pelo custo). Confira o código no app.',
      JSON.stringify([cel31(estC, 'qM', 'De onde veio o valor'), cel31(estC, 'qM', 'Vale'), cel31(estC, 'qK', 'De onde veio o valor'), cel31(estC, 'qY', 'De onde veio o valor'), cel31(estC, 'qW', 'De onde veio o valor'), cel31(estC, 'qJ', 'De onde veio o valor'), cel31(estC, 'qBk', 'De onde veio o valor'), res31(Pc, 'Código a conferir').t]));
    t('31c: carta so com historico na Liga vale o ultimo preco visto e diz "Liga, último visto"',
      cel31(estC, 'qU', 'Vale') === 60 && cel31(estC, 'qU', 'De onde veio o valor') === 'Liga, último visto', JSON.stringify([cel31(estC, 'qU', 'Vale'), cel31(estC, 'qU', 'De onde veio o valor')]));
    t('31c: carta vendida com nome e sem codigo leva o codigo da carta de onde saiu no Item e na coluna Codigo',
      cel31(venC, 'w4', 'Item') === 'Charmander (004/165)' && cel31(venC, 'w4', 'Código') === '004/165', JSON.stringify([cel31(venC, 'w4', 'Item'), cel31(venC, 'w4', 'Código')]));
    const todC31 = aba31(Pc, 'Todos os lançamentos');
    t('31c: em Todos, a venda sai com o mesmo Item e o mesmo Codigo da aba Vendas (sem nome leva o da origem; com nome e sem codigo leva o codigo da origem)',
      cel31(todC31, 'w1', 'Item') === cel31(venC, 'w1', 'Item') && cel31(todC31, 'w1', 'Código') === '214/203' && cel31(todC31, 'w4', 'Item') === 'Charmander (004/165)' && cel31(todC31, 'w4', 'Código') === '004/165',
      JSON.stringify(['w1', 'w4'].map(x => [cel31(todC31, x, 'Item'), cel31(todC31, x, 'Código')])));
    const cbN31 = g('contasBanc')[0], sC31 = Math.round(g('saldoConta')(cbN31) * 100) / 100, sF31 = Math.round(g('saldoFisicoConta')(cbN31) * 100) / 100;
    t('31c: Saldo em contas e Nas contas (físico hoje) do Resumo sao os dois do Painel, e aqui sao diferentes (repasse do app que ainda vai cair)',
      res31(Pc, 'Saldo em contas').v === sC31 && res31(Pc, 'Nas contas (físico hoje)').v === sF31 && sC31 !== sF31,
      JSON.stringify([res31(Pc, 'Saldo em contas').v, res31(Pc, 'Nas contas (físico hoje)').v, sC31, sF31]));
    let hP31 = '';
    try { setg('tela', 'painel'); hP31 = A('vPainel')(); } catch (e) { hP31 = 'ERRO: ' + (e && e.message); }
    t('31c: o card A pagar do Painel diz o que vence ate o fim do mes e, a parte, o que ja passou da data, como a planilha',
      hP31.indexOf(fmt31(10) + ' vence até o fim do mês · ' + fmt31(25) + ' já passou da data') >= 0, (hP31.match(/A pagar \(parcelas e despesas\)[\s\S]{0,260}/) || [hP31.slice(0, 200)])[0]);
    let sN31 = '';
    try { sN31 = zip31(g('XLSX_MIN').montar([{ nome:'T', colunas:[{ t:'Valor', tipo:'moeda', larg:10, soma:false }], linhas:[[NaN], [Infinity], [5]] }], { quando:'' }))['xl/worksheets/sheet1.xml'] || ''; }
    catch (e) { sN31 = 'ERRO: ' + (e && e.message); }
    t('31c: numero que nao e finito vira texto no arquivo, nunca <v>NaN</v> (o Excel pediria reparo)',
      sN31.indexOf('<sheetData') >= 0 && !/<v>(NaN|-?Infinity)<\/v>/.test(sN31) && sN31.indexOf('<v>5</v>') >= 0, sN31.slice(0, 400));
    const iR = cmpC.linhas.indexOf(linha31(cmpC, 'qR'));
    t('31c: so a compra de um pedaco com valor registrado diferente pede conferencia; referencia com frete e taxa confere',
      cmpC.destacar[iR] === true && String(cel31(cmpC, 'qR', 'Conferir')).indexOf(fmt31(150) + ' a menos') === 0 && Rc.nConferir === 1 && Rc.nAmarelas === 1,
      JSON.stringify([cmpC.destacar[iR], cel31(cmpC, 'qR', 'Conferir'), Rc.nConferir, Rc.nAmarelas]));
    t('31c: caixa vendida que virou boosters: situacao sem seta e sem custo por unidade que nao multiplica; mais recente em cima',
      cel31(cmpC, 'qB', 'Situação hoje') === '1 vendido · saíram 18 Booster (18 vendidos)' && cel31(cmpC, 'qB', 'Custo por unidade') === '' && cel31(cmpC, 'qP', 'Custo por unidade') === 100
      && cmpC.linhas[0][0] === '2026-08-12' && cmpC.linhas[cmpC.linhas.length - 1][0] === '2026-08-02',
      JSON.stringify([cel31(cmpC, 'qB', 'Situação hoje'), cel31(cmpC, 'qB', 'Custo por unidade'), cel31(cmpC, 'qP', 'Custo por unidade'), cmpC.linhas[0][0], cmpC.linhas[cmpC.linhas.length - 1][0]]));
    t('31c: todas as conferencias fecham com parcela, nota, Liga e despesa vencida; venda de R$ 0,00 aparece no topo do Resumo',
      Rc.conferencia.every(c => c.ok) && res31(Pc, 'Vendas de R$ 0,00').t.indexOf('1 na aba Vendas') === 0, JSON.stringify(Rc.conferencia.filter(c => !c.ok)));
    const zipC = zip31(Pc.dados), folhasC = Object.keys(zipC).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    const nF = folhasC.reduce((s, n) => s + (zipC[n].match(/<\/f>/g) || []).length, 0), nFV = folhasC.reduce((s, n) => s + (zipC[n].match(/<\/f><v>/g) || []).length, 0);
    t('31c: dentro do arquivo, todo total com formula traz o valor ja calculado', folhasC.length >= 5 && nF > 0 && nF === nFV, JSON.stringify({ folhas:folhasC.length, nF, nFV }));
    const ctrlC = Object.keys(zipC).filter(n => /\.xml$/.test(n) && ctrlEm31(zipC[n]));
    t('31c: nenhum caractere de controle dentro do XML (a observacao tinha tres)', Object.keys(zipC).length >= 8 && ctrlC.length === 0, JSON.stringify([Object.keys(zipC).length, ctrlC]));
    const s2 = zipC['xl/worksheets/sheet2.xml'] || '';
    t('31c: formato do arquivo: total por SUBTOTAL que segue o filtro, filtro no cabecalho, impressao deitada e moeda com o negativo em vermelho',
      folhasC.some(n => zipC[n].indexOf('SUBTOTAL(109,') >= 0) && !folhasC.some(n => zipC[n].indexOf('SUM(') >= 0) && s2.indexOf('<autoFilter ref=') >= 0
      && s2.indexOf('orientation="landscape"') >= 0 && (zipC['xl/styles.xml'] || '').indexOf('numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"') >= 0,
      s2.slice(0, 160));

    /* ---- 31b: centavo quebrado. 6 vendas de R$ 11,37 com 12% de taxa e 6 cartas de R$ 1,005 na Liga: somar celulas arredondadas
       nao da o total arredondado, e a conferencia nao pode acusar diferenca que so existe no arredondamento ---- */
    const fxB = [], cartasB = {};
    for (let i = 1; i <= 6; i++) {
      const cod = 'Carta' + i + ' (00' + i + '/100)';
      fxB.push(Q31('rC' + i, { cat:'Single/Carta', codigo:cod, valor:1, situacao:'Em estoque' }));
      fxB.push({ id:'rV' + i, tipo:'VENDA', data:'2026-08-01', jogo:'Pokémon', cat:'Booster', qtd:1, valor:11.37, canal:'App', taxa:12, recDias:0, contraparte:'Cli' });
      cartasB[cod] = { codigo:'00' + i + '/100', status:'OK', titulo:cod, versoes:[{ v:'Normal', mn:1, md:1.005, mx:2 }] };
    }
    setg('movs', fxB); setg('_precosLiga', { atualizadoEm:'2026-08-20T10:00:00Z', cartas:cartasB });
    const Pb = A('montarPlanilhaTCG')(), Rb = Pb.resumo;
    t('31b: com centavo quebrado, as conferencias de Vendas e do Vale nao acusam diferenca falsa',
      Rb.conferencia.every(c => c.ok) && Rb.valeEstoque === 6.03, JSON.stringify(Rb.conferencia.filter(c => !c.ok).concat([{ vale:Rb.valeEstoque }])));
    /* tres vendas de R$ 1,02 com 12%: a diferenca de arredondamento (0,01) e o erro real somado ficam separados so pelo ponto
       flutuante (0,010000000000000231 contra 0,010000000000000009) — e para isso que existe a folga de 1e-9 */
    setg('movs', [1, 2, 3].map(i => ({ id:'fV' + i, tipo:'VENDA', data:'2026-08-01', jogo:'Pokémon', cat:'Booster', qtd:1, valor:1.02, canal:'App', taxa:12, recDias:0, contraparte:'Cli' })));
    const Rf31 = A('montarPlanilhaTCG')().resumo;
    setg('movs', fxB);
    t('31b: no limite do ponto flutuante (3 vendas de R$ 1,02 com 12%), a conferencia de Vendas nao acusa diferenca falsa', Rf31.conferencia[1].ok === true, JSON.stringify(Rf31.conferencia[1]));
    t('31b: com R$ 0,00 a pagar e a receber, a frase nao fala de desconto no caixa; sem despesa, sem aba Despesas',
      res31(Pb, 'A pagar (parcelas e despesas)').t === 'Nada vence este mês.' && res31(Pb, 'A receber (app)').t === 'Nada cai este mês.' && !Pb.abas.some(a => a.nome === 'Despesas'),
      JSON.stringify([res31(Pb, 'A pagar (parcelas e despesas)').t, res31(Pb, 'A receber (app)').t, Pb.abas.map(a => a.nome)]));
    /* controle negativo: com o Painel dizendo R$ 1,00 a mais de estoque, a conferencia de Estoque TEM de acusar com a diferenca de
       verdade, e o aviso do download tem de dizer que uma conferencia nao fechou */
    const _mot31 = g('motor'), toasts31 = [], alertas31 = [], _toast31 = g('toast'), _al31 = ctx.alert, _desc31 = g('descargaBinaria'), _tent31 = g('_precosTentado');
    setg('motor', function (f) { const r = _mot31(f); r.estoque = r.estoque + 1; return r; });
    let Rbn;
    try {
      Rbn = A('montarPlanilhaTCG')().resumo;
      setg('toast', m => { toasts31.push(String(m)); }); ctx.alert = m => { alertas31.push(String(m)); }; setg('descargaBinaria', () => {}); setg('_precosTentado', true);
      await A('exportarPlanilha')();
    } finally { setg('motor', _mot31); setg('toast', _toast31); ctx.alert = _al31; setg('descargaBinaria', _desc31); setg('_precosTentado', _tent31); }
    /* v2.6f (le-como-felype r9, L1): o aviso de erro e a janela com OK, sem contagem, e nenhum balao de "baixada ✓" junto */
    t('31b (controle negativo): Painel com R$ 1,00 a mais de estoque faz a conferencia de Estoque acusar -1,00, e o aviso ao baixar e a janela com OK que manda para a linha com ✗',
      Rbn.conferencia[2].ok === false && Rbn.conferencia[2].dif === -1 && alertas31.length === 1 && alertas31[0] === 'A planilha foi baixada, mas saiu com erro: veja a linha com ✗ no começo do Resumo.' && !toasts31.some(x => /baixada/.test(x)),
      JSON.stringify([Rbn.conferencia[2], toasts31, alertas31]));

    /* o ✓ das compras com 0 e com 1 compra dividida em pedacos: nada de "0 das 0" nem "1 das 1" */
    setg('movs', [Q31('sA', { cat:'Booster Box', colecao:'Surto', qtd:2, valor:100, valorOrig:200, situacao:'Em estoque' }), Q31('sA1', { cat:'Booster Box', colecao:'Surto', qtd:2, valor:100, situacao:'Vendido', loteOrigem:'sA' })]);
    const Ps31 = A('montarPlanilhaTCG')();
    setg('movs', fxB);
    t('31b: o ✓ das compras sem compra dividida nao conta nada; com uma so, diz se ela tem o valor registrado',
      res31(Pb, '✓ = comprei (mercadoria)').t.endsWith('que soma os pedaços contra o valor registrado e compara o custo por unidade entre eles.')
      && res31(Ps31, '✓ = comprei (mercadoria)').t.endsWith('que soma os pedaços contra o valor registrado (a única compra dividida em pedaços tem esse valor) e compara o custo por unidade entre eles.'),
      JSON.stringify([res31(Pb, '✓ = comprei (mercadoria)').t, res31(Ps31, '✓ = comprei (mercadoria)').t]));
    /* custo por unidade diferente entre os pedacos com os valores fechando (le-como-felype r2, r3 e r4: Parceiro inicial) pinta e diz a faixa;
       o centavo que a divisao deixa no pai (52,78 contra 52,785) nao pinta, e o Custo por unidade dele aparece (Qtd x unidade erra 1 centavo) */
    setg('movs', [
      Q31('uA', { cat:'Box da Coleção', colecao:'Parceiro', qtd:30, valor:1207.69, valorOrig:2415.31, situacao:'Em estoque' }),
      Q31('uA1', { cat:'Box da Coleção', colecao:'Parceiro', qtd:18, valor:1207.62, situacao:'Vendido', loteOrigem:'uA' }),
      Q31('uB', { cat:'ETB', colecao:'Surto', qtd:1, valor:52.78, valorOrig:158.35, situacao:'Em estoque' }),
      Q31('uB1', { cat:'ETB', colecao:'Surto', qtd:2, valor:105.57, situacao:'Vendido', loteOrigem:'uB' }),
      /* o Maioria bulk do backup: item aberto sem nada dentro E custo por unidade diferente na mesma compra (dois avisos numa linha) */
      Q31('uC', { cat:'Sleeved', qtd:15, valor:323.26, situacao:'Aberto' }),
      Q31('uC1', { cat:'Sleeved', qtd:1, valor:23.09, situacao:'Aberto', loteOrigem:'uC' }),
      Q31('uC2', { cat:'Single/Carta', qtd:15, valor:323.26, situacao:'Coleção', loteOrigem:'uC', origem:'ABERTURA' })]);
    const Pu31 = A('montarPlanilhaTCG')(), cmpU31 = aba31(Pu31, 'Compras');
    setg('movs', fxB);
    const iU31 = cmpU31.linhas.indexOf(linha31(cmpU31, 'uA')), iB31 = cmpU31.linhas.indexOf(linha31(cmpU31, 'uB'));
    t('31b: valores fechando e custo por unidade diferente entre os pedacos: a linha pinta e diz a faixa; o centavo da divisao nao pinta',
      cmpU31.destacar[iU31] === true && cel31(cmpU31, 'uA', 'Conferir') === 'Custo por unidade diferente entre os pedaços (' + fmt31(40.26) + ' a ' + fmt31(67.09) + '): a quantidade ou o valor de um deles mudou depois de dividir'
      && cmpU31.destacar[iB31] === false && cel31(cmpU31, 'uB', 'Custo por unidade') === 52.78 && Pu31.resumo.nUnidDif === 2
      && String(cel31(cmpU31, 'uC', 'Conferir')).indexOf(fmt31(23.09) + ' fora da conta') === 0 && String(cel31(cmpU31, 'uC', 'Conferir')).indexOf('Custo por unidade diferente entre os pedaços (' + fmt31(21.55) + ' a ' + fmt31(23.09) + ')') > 0
      && res31(Pu31, 'Compras em amarelo').t === '2 na aba Compras: 1 item aberto sem nada lançado dentro · 2 com o custo por unidade diferente entre os pedaços (1 compra tem dois desses avisos). A coluna Conferir diz o quê.',
      JSON.stringify([cmpU31.destacar[iU31], cel31(cmpU31, 'uA', 'Conferir'), cmpU31.destacar[iB31], cel31(cmpU31, 'uB', 'Custo por unidade'), Pu31.resumo.nUnidDif, res31(Pu31, 'Compras em amarelo').t]));
    /* centavo quebrado nas compras e no estoque (6 de R$ 1,005 e 1 de R$ 2,675): celula arredondada + soma sem arredondar = nenhum ✗ falso (revisor disco r4, M1) */
    setg('movs', [1, 2, 3, 4, 5, 6].map(i => Q31('cQ' + i, { cat:'Booster', valor:1.005, situacao:'Em estoque' })).concat([Q31('cQ7', { cat:'ETB', valor:2.675, situacao:'Coleção' })]));
    const Rq31 = A('montarPlanilhaTCG')().resumo;
    t('31b: com centavo quebrado nas compras e no estoque, nenhuma conferencia acusa diferenca falsa', Rq31.conferencia.every(c => c.ok), JSON.stringify(Rq31.conferencia.filter(c => !c.ok)));
    /* controles negativos com as mesmas 7 linhas de centavo quebrado: 1 centavo a mais no comprei, no estoque, no Vale ou nas despesas do Painel tem de acusar */
    const _vm31 = g('valorMercadoDe');
    const neg31 = mexe => { let R; setg('motor', function (f) { const r = _mot31(f); mexe(r); return r; }); try { R = A('montarPlanilhaTCG')().resumo; } finally { setg('motor', _mot31); } return R; };
    const Rni31 = neg31(r => { r.investido += 0.01; }), Rne31 = neg31(r => { r.estoque += 0.01; }), Rnd31 = neg31(r => { r.despTotal += 0.01; });
    setg('valorMercadoDe', function (l) { const v = _vm31(l); if (l && l.length > 1) { v.bruto = (v.bruto != null ? v.bruto : v.val) + 0.01; v.val = Math.round(v.bruto * 100) / 100; } return v; });
    let Rnv31; try { Rnv31 = A('montarPlanilhaTCG')().resumo; } finally { setg('valorMercadoDe', _vm31); }
    setg('movs', fxB);
    t('31b (controle negativo): 1 centavo a mais no comprei, no estoque, no Vale ou nas despesas do Painel faz a conferencia certa acusar, mesmo com centavo quebrado',
      Rni31.conferencia[0].ok === false && Rne31.conferencia[2].ok === false && Rnv31.conferencia[3].ok === false && Rnd31.conferencia[4].ok === false,
      JSON.stringify([Rni31.conferencia[0], Rne31.conferencia[2], Rnv31.conferencia[3], Rnd31.conferencia[4]]));
    /* o download espera o catalogo da Liga (ate 6 s) antes de montar: sem isso o Vale saia pelo custo na primeira abertura (revisor disco r4, M1) */
    const toastsE31 = [], _stE31 = ctx.setTimeout; let voltasE31 = 0, baixouE31 = 0;
    setg('toast', m => { toastsE31.push(String(m)); }); setg('descargaBinaria', () => { baixouE31++; }); setg('_precosTentado', false);
    ctx.setTimeout = f => { if (++voltasE31 === 3) setg('_precosTentado', true); f(); return 0; };
    try { await A('exportarPlanilha')(); } finally { ctx.setTimeout = _stE31; setg('toast', _toast31); setg('descargaBinaria', _desc31); setg('_precosTentado', _tent31); }
    t('31b: o download espera o catalogo da Liga antes de montar a planilha (avisa, espera e so depois baixa)',
      toastsE31[0] === 'Buscando os preços da Liga…' && voltasE31 >= 3 && baixouE31 === 1, JSON.stringify([toastsE31, voltasE31, baixouE31]));

    /* ---- 31e: "hoje" perto da meia-noite. Um relogio so (o local, o de Sao Paulo): as 23h30 de 20/08 ainda e 20/08 — a despesa de hoje entra no
       Resumo pelo motor, a de amanha (que o "hoje" em UTC deixava entrar) ainda nao, e a aba Despesas diz o mesmo ---- */
    relogio31(2026, 8, 20, 23, 30);
    const hojeL31 = vm.runInContext('(function(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");})()', ctx);
    setg('movs', [{ id:'eT', tipo:'DESPESA', data:hojeL31, cat:'Luz', valor:40, status:'apagar', natureza:'ordinaria' },
      { id:'eA', tipo:'DESPESA', data:'2026-08-21', cat:'Agua', valor:15, status:'apagar', natureza:'ordinaria' }]);
    const Pe = A('montarPlanilhaTCG')();
    t('31e: perto da meia-noite (23h30 de 20/08) a despesa de HOJE entra no Resumo e a de amanha (que em UTC seria "hoje") nao — e a aba Despesas diz o mesmo',
      hojeL31 === '2026-08-20' && Pe.resumo.despesas === 40 && cel31(aba31(Pe, 'Despesas'), 'eT', 'Entra no Resumo?') === 'sim'
      && String(cel31(aba31(Pe, 'Despesas'), 'eA', 'Entra no Resumo?')).indexOf('não') === 0 && Pe.resumo.conferencia[4].ok,
      JSON.stringify([hojeL31, Pe.resumo.despesas, cel31(aba31(Pe, 'Despesas'), 'eT', 'Entra no Resumo?'), cel31(aba31(Pe, 'Despesas'), 'eA', 'Entra no Resumo?')]));
    t('31e: perto da meia-noite a frase do A pagar diz "ate hoje" (nunca "ate amanha"), com o valor das despesas de hoje, e a de amanha aparece como data futura',
      res31(Pe, 'A pagar (parcelas e despesas)').t === fmt31(55) + ' vence até o fim do mês. Já está descontado no caixa acima: as despesas com data até hoje (' + fmt31(40) + '). ' + fmt31(15) + ' de despesas com data futura ainda não.',
      res31(Pe, 'A pagar (parcelas e despesas)').t);
    setg('movs', [Q31('pP', Object.assign({ cat:'Booster Box', qtd:1, valor:300, situacao:'Em estoque' }, PARC31))]);
    const Pp31 = A('montarPlanilhaTCG')();
    t('31e: so parcela de compra a pagar: a frase diz que todas as parcelas ja estao no caixa, com o valor',
      res31(Pp31, 'A pagar (parcelas e despesas)').t === 'Nada vence este mês. Já está descontado no caixa acima: as parcelas de compra que ainda vão vencer (' + fmt31(300) + ').',
      res31(Pp31, 'A pagar (parcelas e despesas)').t);
  } finally {
    semRelogio31();
    setg('_precosLiga', _pl31);
    setg('contasBanc', []);
  }
  /* ---- 31f: achados de numero, disco e fiacao da rodada 5 — a conferencia le a celula ja montada (controle negativo DEPOIS da linha
     montada), teto da tolerancia, Resultado bruto com fracao, toque do Relatorio pela aba do cartao, rodape das vendas com o liquido,
     bordas do custo por unidade, nota e lote parcelados sem caixa, frase da Consulta, codigo sem digito, 1a parcela no pedaco, A pagar
     depois das 21h e com parcela vencida, comparativo pela conta, faixa com o valor escondido e aviso de arredondamento ---- */
  {
    const _plF31 = g('_precosLiga'), _renderF31 = g('render'), _gcF31 = g('graficoCompSvg'), _tcF31 = g('tabelaComp');
    const F31f = (id, x) => Object.assign({ id, tipo:'COMPRA', data:'2026-08-10', jogo:'Pokémon', idioma:'—', qtd:1, taxa:0, pgTipo:'À vista', destino:'Vender', contraparte:'Loja' }, x);
    const copiaF = l => l.map(x => Object.assign({}, x));
    relogio31(2026, 8, 20, 12, 0);
    try {
      setg('render', () => {});
      setg('perSel', 'tudo'); setg('perDe', ''); setg('perAte', '');
      setg('_precosLiga', { atualizadoEm:'2026-08-20T10:00:00Z', cartas:{ 'Umbreon (215/203)':{ codigo:'215/203', status:'OK', titulo:'Umbreon (215/203)', versoes:[{ v:'Normal', mn:150, md:175, mx:250 }] } } });
      setg('movs', copiaF([
        F31f('fU', { cat:'Single/Carta', colecao:'Prisma', codigo:'Umbreon (215/203)', valor:90, situacao:'Em estoque' }),
        F31f('fB', { cat:'Booster', colecao:'Caos', valor:30, situacao:'Coleção' }),
        F31f('fV', { cat:'Single/Carta', colecao:'Prisma', codigo:'Latios (100/203)', valor:40, situacao:'Vendido' }),
        { id:'fW', tipo:'VENDA', data:'2026-08-12', jogo:'Pokémon', cat:'Single/Carta', colecao:'Prisma', qtd:1, valor:130, canal:'App', taxa:10, recDias:14, origemId:'fV', custoOrigem:40, contraparte:'Cli' },
        { id:'fX', tipo:'VENDA', data:'2026-08-15', jogo:'Pokémon', cat:'Booster', colecao:'Caos', qtd:1, valor:50, canal:'Pix', taxa:0, contraparte:'Cli2' },
        { id:'fD', tipo:'DESPESA', data:'2026-08-05', cat:'Frete', valor:25, status:'pago', natureza:'ordinaria' }]));
      const PF0 = A('montarPlanilhaTCG')(), movsPF0 = copiaF(g('movs'));
      const celF = mexe => { let R; setg('_plDepoisDeMontar', mexe); try { R = A('montarPlanilhaTCG')().resumo; } finally { setg('_plDepoisDeMontar', undefined); } return R; };
      /* cada negativo mexe numa linha em que so a conferencia dele ve a mudanca: o Liquido na venda sem vinculo (sem a conta do Lucro) e o Vale
         na linha pelo custo (sem a conta do Vale − custo). Na linha com as duas contas, a outra acusava e escondia a conferencia desligada
         (a suite pegou 213 de 215 com o negativo na linha errada) */
      const RcC = celF(ab => { ab.compras[0][4] += 0.01; }), RvL = celF(ab => { ab.vendas.find(l => l[8] === '')[7] += 0.01; }), RvU = celF(ab => { ab.vendas.find(l => l[8] !== '')[9] += 100; });
      const ReC = celF(ab => { ab.estoque[0][4] += 0.01; }), ReV = celF(ab => { ab.estoque.find(l => l[8] === '')[6] += 0.01; }), RdV = celF(ab => { ab.despesas[0][2] += 0.01; });
      const ReD = celF(ab => { const l = ab.estoque.find(x => x[8] !== ''); l[8] += 100; });
      const cf = (R, i) => R.conferencia[i];
      t('31f: sem mexer, as seis conferencias fecham (preco da Liga, venda do app com vinculo e despesa paga)', PF0.resumo.conferencia.every(c => c.ok), JSON.stringify(PF0.resumo.conferencia.filter(c => !c.ok)));
      /* o ✗ diz a coluna e a linha do Excel (cabecalho na 3, dados a partir da 4; revisor numero r6, L1). Com a conta do Custo por unidade na
         mesma linha, e o motivo que separa a celula de Custo desligada (a outra conta tambem acusa) */
      const lnF = (aba, ach) => aba31(PF0, aba).linhas.findIndex(ach) + 4;
      t('31f (controle negativo): 1 centavo numa celula JA MONTADA de Compras, Vendas, Estoque, Vale ou Despesas faz a conferencia certa acusar, com a diferenca de 1 centavo e o motivo com a coluna e a linha',
        cf(RcC, 0).ok === false && cf(RcC, 0).dif === 0.01 && cf(RvL, 1).ok === false && cf(RvL, 1).dif === 0.01 && cf(ReC, 2).ok === false && cf(ReC, 2).dif === 0.01
        && cf(ReV, 3).ok === false && cf(ReV, 3).dif === 0.01 && cf(RdV, 4).ok === false && cf(RdV, 4).dif === 0.01
        && cf(RcC, 0).motivo === 'a coluna Custo total da linha 4 da aba Compras não é o custo da compra' && cf(RvL, 1).motivo === 'a coluna Líquido da linha ' + lnF('Vendas', l => l[8] === '') + ' não é o líquido da venda'
        && cf(ReC, 2).motivo === 'a coluna Custo da linha 4 não é o custo do lançamento' && cf(ReC, 3).motivo === 'a coluna Custo da linha 4 não é o custo do lançamento' && cf(ReV, 3).motivo === 'a coluna Vale da linha ' + lnF('Estoque e coleção (hoje)', l => l[8] === '') + ' não é o Vale que o app dá a esse item'
        && cf(RdV, 4).motivo === 'a coluna Valor da linha 4 não é o valor da despesa',
        JSON.stringify([cf(RcC, 0), cf(RvL, 1), cf(ReC, 2), cf(ReC, 3), cf(ReV, 3), cf(RdV, 4)]));
      t('31f (controle negativo): Lucro da venda e Vale − custo que nao sao a conta das celulas da linha fazem Vendas e Vale acusarem',
        cf(RvU, 1).ok === false && cf(ReD, 3).ok === false && cf(RvU, 1).dif === 0 && cf(ReD, 3).dif === 0, JSON.stringify([cf(RvU, 1), cf(ReD, 3)]));

      const ms = A('_plMesmaSoma');
      t('31f: a soma sem arredondar aceita so erro de ponto flutuante, com teto de R$ 0,004: 1 centavo acusa tambem acima de R$ 10 milhoes',
        ms(10100000, 10100000.01) === false && ms(50000000, 50000000.005) === false && ms(0.1 + 0.2, 0.3) === true && ms(1e9 + 1e-6, 1e9) === true,
        JSON.stringify([ms(10100000, 10100000.01), ms(50000000, 50000000.005), ms(0.1 + 0.2, 0.3), ms(1e9 + 1e-6, 1e9)]));

      setg('movs', copiaF([F31f('fa', { cat:'Booster', valor:0.1, situacao:'Em estoque' }), F31f('fb', { cat:'Booster', valor:0.2, situacao:'Em estoque' }), F31f('fc', { cat:'Booster', valor:0.3, situacao:'Vendido' })]));
      const rFr = A('motor')(false), PFr = A('montarPlanilhaTCG')();
      t('31f: Resultado bruto com fracao que o ponto flutuante nao fecha exato (0,1 + 0,2 + 0,3) nao acusa diferenca falsa',
        (rFr.investido - rFr.cmv) !== (rFr.estoque + rFr.colCusto + rFr.pedido) && PFr.resumo.conferencia[5].ok === true,
        JSON.stringify([rFr.investido - rFr.cmv, rFr.estoque + rFr.colCusto + rFr.pedido, PFr.resumo.conferencia[5]]));

      setg('movs', copiaF([
        F31f('kA', { cat:'ETB', colecao:'Caos', contraparte:'Ana', valor:100, situacao:'Em estoque' }),
        F31f('kE', { cat:'ETB', colecao:'Caos', contraparte:'Ana', valor:50, situacao:'Em estoque', data:'2026-06-15' }),
        F31f('kB', { cat:'Booster', colecao:'Caos', contraparte:'Bia', jogo:'Magic', valor:40, situacao:'Coleção', data:'2026-06-01' }),
        F31f('kC', { cat:'', colecao:'Prisma', contraparte:'', valor:15, situacao:'Em estoque' }),
        F31f('kD', { cat:'ETB', colecao:'Prisma', contraparte:'Ana', valor:60, situacao:'Vendido' }),
        { id:'kW', tipo:'VENDA', data:'2026-08-12', jogo:'Pokémon', cat:'ETB', colecao:'Prisma', qtd:1, valor:200, canal:'App', taxa:10, recDias:14, origemId:'kD', custoOrigem:60, contraparte:'Cli' }]));
      setg('tela', 'relatorios'); setg('relDimAll', 'colecao'); setg('relDet', false); setg('relJogo', ''); setg('relCol', ''); setg('relPess', ''); setg('relCat', '');
      setg('perSel', 'custom'); setg('perDe', '2026-08-01'); setg('perAte', '2026-08-31');
      setg('relCompView', 'lista'); const hLK = A('vRelatorios')();
      setg('relCompView', 'tab'); const hTK = A('vRelatorios')();
      setg('relCompView', 'graf'); const hGK = A('vRelatorios')();
      setg('relCompView', 'lista');
      const conta = (h, s) => h.split(s).length - 1;
      t('31f: no Relatorio o toque abre a aba do numero do cartao — Estoque parado e Na colecao sem o periodo, Vendi nas vendas, Comprei em Todos (lista e tabela); lista, tabela e grafico nunca voltam para a busca de texto',
        hLK.indexOf("abrirConsultaPorDim('Caos','ESTOQUE',1)") >= 0 && hLK.indexOf("abrirConsultaPorDim('Caos','COLECAO',1)") >= 0 && hLK.indexOf("abrirConsultaPorDim('Caos','tudo')") >= 0
        && hLK.indexOf("margin-bottom:9px;cursor:pointer\" onclick=\"abrirConsultaPorDim('Prisma','VENDA')\"") >= 0
        && hTK.indexOf("abrirConsultaPorDim('Caos','ESTOQUE',1)") >= 0 && hTK.indexOf("abrirConsultaPorDim('Caos','COLECAO',1)") >= 0 && conta(hTK, "abrirConsultaPorDim('Prisma','VENDA')") === 2
        && hGK.indexOf("abrirConsultaPorDim('Caos')") >= 0 && hGK.indexOf('toque na coluna pra ver os lançamentos dela em Todos, no período') >= 0 && (hLK + hTK + hGK).indexOf("consQ='") < 0,
        JSON.stringify([conta(hTK, "abrirConsultaPorDim('Prisma','VENDA')"), (hLK.match(/abrirConsultaPorDim\([^)]*\)/g) || []).slice(0, 12), (hTK.match(/abrirConsultaPorDim\([^)]*\)/g) || []).slice(0, 12)]));

      vm.runInContext('navHist.length=0', ctx); setg('consQ', 'busca velha'); setg('consConta', 'Nubank');
      A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1);
      const eK = { f:g('consF'), col:g('consCol'), q:g('consQ'), conta:g('consConta'), de:g('perDe'), ate:g('perAte'), tela:g('tela'), hist:g('navHist.length') }, rK = rodape31(A('vConsultar')());
      A('voltar')();
      const vK = { tela:g('tela'), de:g('perDe'), ate:g('perAte'), sel:g('perSel') };
      /* o periodo so e emprestado: sair da Consulta pela barra de baixo (go), pelo Consultar ou pelo voltar devolve o periodo do Relatorio;
         escolher periodo na propria Consulta fica; o vinculo (verMov) empresta do mesmo jeito (le-como-felype r6, G2) */
      A('abrirConsultaPorDim')('Caos', 'COLECAO', 1);
      const bK1 = { de:g('perDe'), sel:g('perSel'), res:(A('vConsultar')().match(/Tudo só nesta tela \(Na coleção é o de hoje\)/) || [''])[0] };
      A('go')('relatorios'); const bK2 = { tela:g('tela'), de:g('perDe'), ate:g('perAte'), sel:g('perSel') };
      A('voltar')(); const bK3 = { tela:g('tela'), de:g('perDe'), emp:!!g('_perEmprestado') };
      A('go')('painel'); const bK4 = { de:g('perDe'), ate:g('perAte') };
      setg('tela', 'relatorios'); A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1); A('irConsultar')(); const bK5 = { de:g('perDe') };
      setg('tela', 'relatorios'); A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1); A('setPer')('d90'); A('go')('relatorios'); const bK6 = { sel:g('perSel') };
      setg('perSel', 'custom'); setg('perDe', '2026-08-01'); setg('perAte', '2026-08-31');
      const _fmK = g('fecharModal'), _stK = ctx.setTimeout; setg('fecharModal', () => {}); ctx.setTimeout = () => 0;
      try { setg('tela', 'relatorios'); A('verMov')('kA'); } finally { setg('fecharModal', _fmK); ctx.setTimeout = _stK; }
      const bK7 = { tela:g('tela'), de:g('perDe'), emp:!!g('_perEmprestado') }; A('go')('relatorios'); const bK8 = { de:g('perDe') };
      setg('relDimAll', 'pessoa'); setg('relCol', 'Caos'); A('abrirConsultaPorDim')('Ana', 'tudo');
      const eP = [g('consPess'), g('consCol'), g('consCat'), g('consJogo')].join('|');
      setg('relDimAll', 'cat'); setg('relCol', ''); setg('relPess', 'Ana'); A('abrirConsultaPorDim')('ETB', 'tudo');
      const eC = [g('consCat'), g('consPess'), g('consCol')].join('|');
      setg('relDimAll', 'jogo'); setg('relPess', ''); A('abrirConsultaPorDim')('Magic', 'tudo');
      const eJ = [g('consJogo'), g('consCol'), g('consPess')].join('|');
      t('31f: o toque filtra pela dimensao do Relatorio (fornecedor, tipo e jogo), leva o filtro que o Relatorio ja tinha, limpa a busca e a conta e abre o estoque de hoje sem o periodo, que so e emprestado: voltar, barra de baixo, Consultar e o vinculo devolvem; escolher outro periodo na Consulta fica',
        eK.f === 'ESTOQUE' && eK.col === 'Caos' && eK.q === '' && eK.conta === '' && eK.de === '' && eK.ate === '' && eK.tela === 'consultar' && eK.hist === 1 && rK.v === fmt31(150)
        && vK.tela === 'relatorios' && vK.de === '2026-08-01' && vK.ate === '2026-08-31' && vK.sel === 'custom'
        && bK1.de === '' && bK1.sel === 'tudo' && bK1.res !== '' && bK2.tela === 'relatorios' && bK2.de === '2026-08-01' && bK2.ate === '2026-08-31' && bK2.sel === 'custom'
        && bK3.tela === 'consultar' && bK3.de === '' && bK3.emp === true && bK4.de === '2026-08-01' && bK4.ate === '2026-08-31' && bK5.de === '2026-08-01' && bK6.sel === 'd90'
        && bK7.tela === 'consultar' && bK7.de === '' && bK7.emp === true && bK8.de === '2026-08-01'
        && eP === 'Ana|Caos||todos' && eC === 'ETB|Ana|' && eJ === 'Magic||',
        JSON.stringify([eK, rK, vK, bK1, bK2, bK3, bK4, bK5, bK6, bK7, bK8, eP, eC, eJ]));
      /* o botao diz "Tudo só nesta tela"; o motivo so na aba que o toque abriu (o "ver venda" leva para Vendas); a barra nao repete o
         parentese (le-como-felype r7, 3) */
      setg('tela', 'relatorios'); setg('perSel', 'custom'); setg('perDe', '2026-08-01'); setg('perAte', '2026-08-31'); setg('relDimAll', 'colecao'); setg('relCol', ''); setg('relPess', ''); setg('relCat', ''); setg('relJogo', '');
      A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1); setg('consFOpen', true);
      let hEm = '', hVv = '';
      let hMn = '';
      try { hEm = A('vConsultar')(); setg('consMenu', true); hMn = A('vConsultar')(); setg('consMenu', false); setg('consF', 'VENDA'); hVv = A('vConsultar')(); } finally { setg('consMenu', false); setg('consFOpen', false); A('go')('relatorios'); }
      t('31f: com o periodo emprestado o botao diz "Tudo só nesta tela", o motivo so aparece na aba que o toque abriu, e a barra do filtro diz "período Tudo" sem repetir o parentese',
        hEm.indexOf('Tudo só nesta tela (Estoque parado é o de hoje)') >= 0 && hEm.indexOf('· período Tudo — limpar ✕') >= 0 && hEm.indexOf('período Tudo (') < 0
        && hVv.indexOf('Tudo só nesta tela') >= 0 && hVv.indexOf('é o de hoje') < 0 && g('perDe') === '2026-08-01'
        && hMn.indexOf('O que você quer consultar?') >= 0 && hMn.indexOf('Tudo só nesta tela') >= 0 && hMn.indexOf('é o de hoje') < 0,
        JSON.stringify([(hEm.match(/Tudo só nesta tela[^<·]*/) || [''])[0], (hEm.match(/filtrando:[^<]*/) || [''])[0], (hVv.match(/Tudo só nesta tela[^<·]*/) || [''])[0], g('perDe')]));
      /* v2.6f (revisor disco r9, L5): o "‹ voltar" a partir do Fluxo de caixa devolve o menu que a pessoa tinha aberto na Consulta emprestada */
      setg('tela', 'relatorios'); setg('perSel', 'custom'); setg('perDe', '2026-08-01'); setg('perAte', '2026-08-31'); setg('relDimAll', 'colecao'); setg('relCol', ''); setg('relPess', ''); setg('relCat', ''); setg('relJogo', '');
      A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1);
      let vMn = '', vMenu = null, vEmp = null;
      try { setg('consMenu', true); A('go')('contas'); A('voltar')(); vMenu = g('consMenu'); vEmp = !!g('_perEmprestado'); vMn = A('vConsultar')(); } finally { setg('consMenu', false); A('go')('relatorios'); }
      t('31f: o "‹ voltar" a partir do Fluxo de caixa devolve o menu da Consulta emprestada, com o botão só "Tudo só nesta tela"',
        vMenu === true && vEmp === true && vMn.indexOf('O que você quer consultar?') >= 0 && vMn.indexOf('Tudo só nesta tela') >= 0 && vMn.indexOf('é o de hoje') < 0,
        JSON.stringify([vMenu, vEmp, (vMn.match(/Tudo só nesta tela[^<·]*/) || [''])[0]]));
      /* saidas do emprestimo que nenhum teste mexia (revisor disco r7, M1), rodando o codigo que a propria tela poe no campo: a data De ou Ate
         escolhida na Consulta desfaz o emprestimo e fica; o vinculo aberto dentro da Consulta emprestada nao troca o periodo guardado; o
         "limpar ✕" da barra devolve o periodo */
      const perRel = () => { setg('tela', 'relatorios'); setg('perSel', 'custom'); setg('perDe', '2026-08-01'); setg('perAte', '2026-08-31'); };
      const onDe = h => (h.match(/>De<\/label><input type="date" value="[^"]*" onchange="([^"]*)"/) || ['', ''])[1];
      const onAte = h => (h.match(/>Até<\/label><input type="date" value="[^"]*" onchange="([^"]*)"/) || ['', ''])[1];
      const onLimpar = h => (h.match(/onclick="([^"]*)">filtrando:/) || ['', ''])[1];
      const rodaCampo = (codigo, valor) => vm.runInContext('(function(){' + codigo + '}).call({value:' + JSON.stringify(valor) + '})', ctx);
      perRel(); A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1); setg('consFOpen', true);
      let cDe = '', cAte = '', cLimpa = '';
      try { const hS = A('vConsultar')(); cDe = onDe(hS); cAte = onAte(hS); cLimpa = onLimpar(hS); } finally { setg('consFOpen', false); }
      if (cDe) rodaCampo(cDe, '2026-05-01');
      A('go')('relatorios'); const sDe = { de:g('perDe'), emp:!!g('_perEmprestado') };
      perRel(); A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1); if (cAte) rodaCampo(cAte, '2026-05-31');
      A('go')('relatorios'); const sAte = { ate:g('perAte'), emp:!!g('_perEmprestado') };
      perRel(); A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1);
      const _fmS = g('fecharModal'), _stS = ctx.setTimeout; setg('fecharModal', () => {}); ctx.setTimeout = () => 0;
      try { A('verMov')('kA'); } finally { setg('fecharModal', _fmS); ctx.setTimeout = _stS; }
      A('go')('relatorios'); const sVin = { de:g('perDe'), ate:g('perAte') };
      perRel(); A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1); if (cLimpa) rodaCampo(cLimpa, '');
      const sLim = { de:g('perDe'), emp:!!g('_perEmprestado'), col:g('consCol') };
      A('go')('relatorios');
      t('31f: na Consulta emprestada, a data De ou Até escolhida desfaz o empréstimo e fica; o vínculo aberto ali não troca o período guardado; o "limpar ✕" da barra devolve o período',
        cDe !== '' && cAte !== '' && cLimpa !== '' && sDe.de === '2026-05-01' && sDe.emp === false && sAte.ate === '2026-05-31' && sAte.emp === false
        && sVin.de === '2026-08-01' && sVin.ate === '2026-08-31' && sLim.de === '2026-08-01' && sLim.emp === false && sLim.col === '',
        JSON.stringify([cDe, cAte, cLimpa, sDe, sAte, sVin, sLim]));
      /* sem emprestimo o botao diz o periodo e a barra nao diz "período Tudo"; o vinculo aberto dentro da Consulta emprestada nao apaga o
         motivo, que volta com a aba do toque (revisor disco r8, M1: A2, A7 e A8 mudavam a tela com a secao 31 verde) */
      perRel(); A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1); if (cDe) rodaCampo(cDe, '2026-05-01');
      setg('consFOpen', true); let hSe = ''; try { hSe = A('vConsultar')(); } finally { setg('consFOpen', false); }
      A('go')('relatorios');
      perRel(); A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1);
      const _fmA8 = g('fecharModal'), _stA8 = ctx.setTimeout; setg('fecharModal', () => {}); ctx.setTimeout = () => 0;
      try { A('verMov')('kA'); } finally { setg('fecharModal', _fmA8); ctx.setTimeout = _stA8; }
      A('verFiltro')('ESTOQUE'); const hA8 = A('vConsultar')(); A('go')('relatorios');
      t('31f: sem empréstimo o botão diz o período escolhido e a barra do filtro não diz "período Tudo"; depois do vínculo aberto dentro da Consulta emprestada, de volta à aba do toque, o motivo volta',
        hSe.indexOf('Tudo só nesta tela') < 0 && hSe.indexOf('01/05/2026') >= 0 && hSe.indexOf('filtrando:') >= 0 && hSe.indexOf('período Tudo') < 0
        && hA8.indexOf('Tudo só nesta tela (Estoque parado é o de hoje)') >= 0,
        JSON.stringify([(hSe.match(/Filtros[^<]*/) || [''])[0], (hSe.match(/filtrando:[^<]*/) || [''])[0], (hA8.match(/Tudo só nesta tela[^<·]*/) || [''])[0]]));
      /* gerar a planilha dentro da Consulta emprestada nao desfaz o emprestimo: a planilha so guarda e devolve as datas (revisor fiacao r7, M1:
         com o finally zerando o emprestimo, sair deixava o app em Tudo) */
      perRel(); A('abrirConsultaPorDim')('Caos', 'ESTOQUE', 1); A('montarPlanilhaTCG')();
      const sPl = { emp:!!g('_perEmprestado'), de:g('perDe') };
      A('go')('relatorios'); const sPl2 = { de:g('perDe'), ate:g('perAte') };
      t('31f: gerar a planilha dentro da Consulta emprestada mantém o empréstimo, e a saída devolve o período do Relatório',
        sPl.emp === true && sPl.de === '' && sPl2.de === '2026-08-01' && sPl2.ate === '2026-08-31', JSON.stringify([sPl, sPl2]));

      setg('perSel', 'tudo'); setg('perDe', ''); setg('perAte', ''); setg('relJogo', ''); setg('relCol', ''); setg('relPess', ''); setg('relCat', '');
      setg('relDimAll', 'pessoa'); A('abrirConsultaPorDim')('(sem cliente/fornecedor)', 'tudo'); const hVP = A('vConsultar')();
      setg('relDimAll', 'cat'); A('abrirConsultaPorDim')('(sem tipo)', 'tudo'); const hVT = A('vConsultar')();
      setg('relDimAll', 'colecao');
      t('31f: o vazio de fornecedor e de tipo abre a Consulta com a compra sem fornecedor e sem tipo ("(sem cliente/fornecedor)" e "(sem tipo)")',
        hVP.indexOf('🛒 comprado <b>' + fmt31(15) + '</b>') >= 0 && hVT.indexOf('🛒 comprado <b>' + fmt31(15) + '</b>') >= 0,
        JSON.stringify([(hVP.match(/🛒 comprado <b>[^<]*/) || [''])[0], (hVT.match(/🛒 comprado <b>[^<]*/) || [''])[0]]));

      const rVL = rodape31(telaCons31('VENDA', 'itens', ''));
      t('31f: o rodape das vendas diz tambem o liquido quando ha taxa do app (o cartao Vendi e o Lucro real sao liquidos)',
        rVL.rot === 'total vendido' && rVL.v === fmt31(200) && rVL.nota === 'líquido ' + fmt31(180) + ', sem a taxa do app', JSON.stringify(rVL));

      setg('movs', copiaF([
        F31f('uA', { cat:'Booster', colecao:'A', valor:2.00, situacao:'Em estoque' }), F31f('uA1', { cat:'Booster', colecao:'A', valor:2.06, situacao:'Vendido', loteOrigem:'uA' }),
        F31f('uB', { cat:'Booster', colecao:'B', valor:2.00, situacao:'Em estoque' }), F31f('uB1', { cat:'Booster', colecao:'B', valor:2.04, situacao:'Vendido', loteOrigem:'uB' }),
        F31f('uC', { cat:'ETB', colecao:'C', valor:10.00, situacao:'Em estoque' }), F31f('uC1', { cat:'ETB', colecao:'C', valor:10.22, situacao:'Vendido', loteOrigem:'uC' }),
        F31f('uD', { cat:'ETB', colecao:'D', valor:10.00, situacao:'Em estoque' }), F31f('uD1', { cat:'ETB', colecao:'D', valor:10.19, situacao:'Vendido', loteOrigem:'uD' }),
        F31f('uE', { cat:'Booster', colecao:'E', qtd:10, valor:100, situacao:'Aberto' }), F31f('uE1', { cat:'Booster', colecao:'E', qtd:9, valor:90, situacao:'Em estoque', loteOrigem:'uE' }),
        F31f('uE2', { cat:'Booster', colecao:'E', qtd:1, valor:7, situacao:'Em estoque', loteOrigem:'uE', origem:'ABERTURA' })]));
      const PU = A('montarPlanilhaTCG')(), cmpU = aba31(PU, 'Compras'), pinta = idm => cmpU.destacar[cmpU.linhas.findIndex(l => l[l.length - 1] === idm)];
      t('31f: bordas do custo por unidade: pinta com R$ 0,06 e 2,9% (2,00 × 2,06) e com R$ 0,22 e 2,2% (10,00 × 10,22); nao pinta com R$ 0,04 nem com 1,9%; pedaco que saiu de item aberto fica fora da conta',
        pinta('uA') === true && pinta('uB') === false && pinta('uC') === true && pinta('uD') === false && pinta('uE') === false && PU.resumo.nUnidDif === 2,
        JSON.stringify(['uA', 'uB', 'uC', 'uD', 'uE'].map(pinta).concat([PU.resumo.nUnidDif])));

      setg('movs', copiaF([
        F31f('nA', { cat:'ETB', colecao:'N', valor:90, situacao:'Em estoque', notaId:'N40', notaNum:'40', pgTipo:'Parcelado', nParc:3, venc1:'2026-09-10' }),
        F31f('nB', { cat:'ETB', colecao:'N', valor:60, situacao:'Em estoque', notaId:'N40', notaNum:'40', pgTipo:'Parcelado', nParc:3, venc1:'2026-09-10' }),
        F31f('lA', { cat:'Booster Box', colecao:'L', valor:120, situacao:'Em estoque', pgTipo:'Parcelado', nParc:2, venc1:'2026-09-10' }),
        F31f('lA1', { cat:'Booster Box', colecao:'L', valor:120, situacao:'Vendido', loteOrigem:'lA', pgTipo:'Parcelado', nParc:2, venc1:'2026-09-10' })]));
      const hNN = telaCons31('COMPRA', 'notas', ''), iN = hNN.indexOf("abrirNota('N40')"), cardN = iN >= 0 ? hNN.slice(iN, iN + 2000) : '';
      const iL = hNN.indexOf("verLote('lA')"), cardL = iL >= 0 ? hNN.slice(iL, iL + 1500) : '';
      setg('tela', 'relatorios'); setg('relCompView', 'lista'); const hRN = A('vRelatorios')();
      t('31f: nota parcelada sem caixa aberta: "3× R$ 50,00" sem "nota inteira"; compra avulsa parcelada dividida: "2× R$ 120,00", nunca "— na nota"; faixa e subtitulo sem caixa nem item aberto que nao existem',
        cardN.indexOf('3× ' + fmt31(50)) >= 0 && cardN.indexOf('nota inteira') < 0 && cardL.indexOf('2× ' + fmt31(120)) >= 0 && cardL.indexOf('na nota') < 0
        && hNN.indexOf('menos a caixa aberta') < 0 && hRN.indexOf('item aberto sem nada lançado dentro fica fora') < 0,
        JSON.stringify([cardN.slice(0, 700), cardL.slice(0, 600)]));

      setg('movs', copiaF([F31f('xC', { cat:'Booster Box', colecao:'X', valor:300, situacao:'Aberto' }), F31f('xC1', { cat:'Booster', colecao:'X', qtd:18, valor:300, situacao:'Em estoque', loteOrigem:'xC', origem:'ABERTURA' })]));
      const rXN = rodape31(telaCons31('COMPRA', 'notas', '')), rXI = rodape31(telaCons31('COMPRA', 'itens', ''));
      t('31f: frase da Consulta so com caixa aberta: por nota sem o valor da caixa, no detalhado com o valor, e nas duas "na data em que cada um foi lançado"',
        rXN.nota === 'como no Painel: caixa aberta conta pelo que saiu dela, na data em que cada um foi lançado'
        && rXI.nota === 'como no Painel: caixa aberta (' + fmt31(300) + ') conta pelo que saiu dela, na data em que cada um foi lançado', JSON.stringify([rXN, rXI]));

      setg('movs', copiaF([F31f('gM', { cat:'Single/Carta', colecao:'G', codigo:'Mega greninja ex', valor:12, situacao:'Coleção' }),
        F31f('gP', { cat:'Booster Box', colecao:'G', valor:300, situacao:'Aberto', pgTipo:'Parcelado', nParc:3, venc1:'2026-09-10' }),
        F31f('gP1', { cat:'Booster', colecao:'G', qtd:18, valor:300, situacao:'Em estoque', loteOrigem:'gP', origem:'ABERTURA', pgTipo:'Parcelado', nParc:3, venc1:'2026-09-10' })]));
      const PG = A('montarPlanilhaTCG')(), todG = aba31(PG, 'Todos os lançamentos');
      t('31f: codigo sem digito nao vai para o nome da carta ("Mega greninja ex", nunca repetido entre parenteses); em Todos o pedaco de item aberto fica sem a 1a parcela e a compra de onde saiu mantem',
        cel31(aba31(PG, 'Compras'), 'gM', 'Item') === 'Mega greninja ex' && cel31(todG, 'gP1', '1ª parcela vence em') === '' && cel31(todG, 'gP', '1ª parcela vence em') === '2026-09-10',
        JSON.stringify([cel31(aba31(PG, 'Compras'), 'gM', 'Item'), cel31(todG, 'gP1', '1ª parcela vence em'), cel31(todG, 'gP', '1ª parcela vence em')]));

      relogio31(2026, 8, 20, 21, 30);
      setg('movs', copiaF([{ id:'hD', tipo:'DESPESA', data:'2026-08-20', cat:'Luz', valor:10, status:'apagar', natureza:'ordinaria' },
        F31f('hP', { cat:'Booster Box', colecao:'H', valor:300, situacao:'Em estoque', pgTipo:'Parcelado', nParc:3, venc1:'2026-07-10', data:'2026-07-01' })]));
      const tH = res31(A('montarPlanilhaTCG')(), 'A pagar (parcelas e despesas)').t;
      relogio31(2026, 8, 20, 12, 0);
      /* lote parcelado em 2 pedacos, com as 3 parcelas de cada um ja vencidas: 6 entradas no aPagar, que a frase conta como 3 parcelas de 1 compra
         (le-como-felype r6, G1; revisor numero r6, M1: a mesma parcela repetida em cada pedaco do lote nao e outra parcela) */
      setg('movs', copiaF([F31f('vL', { cat:'Booster Box', colecao:'V', qtd:2, valor:150, situacao:'Em estoque', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-10', data:'2026-05-01' }),
        F31f('vL1', { cat:'Booster Box', colecao:'V', qtd:2, valor:150, situacao:'Vendido', loteOrigem:'vL', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-10', data:'2026-05-01' })]));
      const tV = res31(A('montarPlanilhaTCG')(), 'A pagar (parcelas e despesas)').t;
      t('31f: as 21h30 a despesa de hoje nao "ja passou da data" (a meia-noite e a local); as parcelas vencidas saem contadas por compra e por parcela (6 entradas de 2 pedacos de lote = 3 parcelas de 1 compra) e dizem o que isso muda no dinheiro',
        tH === fmt31(10) + ' vence até o fim do mês. Já está descontado no caixa acima: as parcelas de compra que ainda vão vencer (' + fmt31(100) + ') e as despesas com data até hoje (' + fmt31(10) + '). As 2 parcelas já vencidas de 1 compra (' + fmt31(200) + ') não entram: o app as conta como pagas. Se alguma não foi paga, este A pagar está menor do que devia.'
        && tV === 'Nada vence este mês. As 3 parcelas já vencidas de 1 compra (' + fmt31(300) + ') não entram: o app as conta como pagas, e o caixa acima já as descontou. Se alguma não foi paga, este A pagar está menor do que devia.',
        JSON.stringify([tH, tV]));

      setg('movs', copiaF([F31f('cA', { cat:'ETB', colecao:'Caos', valor:100, situacao:'Em estoque' }), F31f('cT', { cat:'ETB', colecao:'Caos', valor:80, situacao:'Trocado' }),
        F31f('cR', { cat:'Booster', colecao:'Caos', valor:50, situacao:'Em estoque', origem:'TROCA' }),
        F31f('cX', { cat:'Booster Box', colecao:'Prisma', valor:300, situacao:'Aberto' }), F31f('cX1', { cat:'Booster', colecao:'Prisma', qtd:18, valor:300, situacao:'Em estoque', loteOrigem:'cX', origem:'ABERTURA' }),
        F31f('cY', { cat:'Sleeved', colecao:'Prisma', valor:20, situacao:'Aberto' })]));
      let serC = null; const tabC = [];
      setg('graficoCompSvg', s => { serC = JSON.parse(JSON.stringify(s)); return _gcF31(s); });
      setg('tabelaComp', (o, M, f, h) => { tabC.push(JSON.parse(JSON.stringify(o))); return _tcF31(o, M, f, h); });
      try {
        setg('tela', 'relatorios'); setg('relDimAll', 'colecao'); setg('perSel', 'tudo'); setg('perDe', ''); setg('perAte', '');
        setg('relCompView', 'graf'); A('vRelatorios')(); setg('relCompView', 'tab'); A('vRelatorios')();
      } finally { setg('graficoCompSvg', _gcF31); setg('tabelaComp', _tcF31); setg('relCompView', 'lista'); }
      t('31f: o comparativo do Relatorio soma o comprei como o cartao Comprei (caixa aberta pelos pedacos, troca pelo recebido, item aberto sem pedaco fora), provado pela conta',
        !!serC && JSON.stringify(serC[2].o) === '{"Caos":150,"Prisma":300}' && tabC.length === 4 && JSON.stringify(tabC[2]) === '{"Caos":150,"Prisma":300}',
        JSON.stringify([serC && serC[2], tabC]));

      setg('movs', copiaF([F31f('zA', { cat:'ETB', colecao:'Caos', valor:90, situacao:'Em estoque', notaId:'N50', notaNum:'50' }), F31f('zB', { cat:'Booster', colecao:'Prisma', valor:60, situacao:'Em estoque', notaId:'N50', notaNum:'50' })]));
      const hZ = telaCons31('COMPRA', 'notas', 'Caos'), rZ = rodape31(hZ), hZ0 = telaCons31('COMPRA', 'notas', '');
      t('31f: vista por nota com busca: o card mostra a nota inteira e a faixa diz quanto do valor dos cards ficou fora da lista e do total (150 nos cards − 90 no total = 60)',
        rZ.v === fmt31(90) && hZ.indexOf('o filtro atual mostra 1 de 2 lançamentos desta nota') >= 0
        && hZ.indexOf('O valor do card é a nota inteira. Com o filtro atual, ' + fmt31(60) + ' do valor dos cards são de lançamentos escondidos, que o total embaixo não soma.') >= 0 && hZ0.indexOf('Com o filtro atual') < 0 && hZ0.indexOf('O valor do card é a nota inteira, mesmo quando esta aba mostra só parte dela.') >= 0,
        JSON.stringify([rZ, (hZ.match(/<div class="ctx">🧾[^]*?<\/div>/) || [''])[0].slice(0, 500)]));

      setg('movs', copiaF([1, 2, 3].map(i => ({ id:'rv' + i, tipo:'VENDA', data:'2026-08-1' + i, jogo:'Pokémon', cat:'Booster', colecao:'R', qtd:1, valor:1.02, canal:'App', taxa:12, recDias:14, contraparte:'Cli' }))));
      const PR = A('montarPlanilhaTCG')(), tR = res31(PR, '✓ Vendas, Estoque e coleção, Despesas').t, tR0 = res31(PF0, '✓ Vendas, Estoque e coleção, Despesas').t;
      t('31f: quando a soma das celulas arredondadas fica 1 centavo longe do Painel so por arredondamento, a linha do ✓ diz quanto e onde; sem diferenca, nao diz nada',
        PR.resumo.conferencia.every(c => c.ok) && tR.endsWith('Resultado bruto. Diferença só de arredondamento de centavo: a coluna Líquido da aba Vendas soma ' + fmt31(0.01) + ' a mais que o Painel.') && tR0.indexOf('arredondamento') < 0,
        JSON.stringify([tR, tR0]));

      /* ---- 31f, rodada 6 (revisores numero r6 M1, M2, M3 e L1; disco r6 M1): o ✗ diz o motivo com a coluna e a linha do Excel; os rotulos
         que escolhem o que entra em cada soma (Situação, Como entrou, Entra no Resumo?) e as colunas de conta (Lucro %, Custo por unidade,
         Vale − custo %) sao conferidos contra o lancamento; diferenca acima de meio centavo por linha nao e arredondamento; parcelas vencidas
         por parcela, com nota parcelada, marca de paga, vencimento hoje e singular; rodape das vendas com venda sem taxa; faixa com caixa
         aberta e lote avulso; arredondamento a menos, nas compras e no ramo com ✗ ---- */
      setg('movs', copiaF(movsPF0));
      const celP = mexe => { let P; setg('_plDepoisDeMontar', mexe); try { P = A('montarPlanilhaTCG')(); } finally { setg('_plDepoisDeMontar', undefined); } return P; };
      const achaId = (l, idm) => l.findIndex(x => x[x.length - 1] === idm);
      const nU = lnF('Estoque e coleção (hoje)', l => l[l.length - 1] === 'fU'), nB = lnF('Compras', l => l[l.length - 1] === 'fB'), nW = lnF('Vendas', l => l[l.length - 1] === 'fW');
      const PsE = celP(ab => { ab.estoque[achaId(ab.estoque, 'fU')][0] = 'Na coleção'; });
      const PcT = celP(ab => { ab.compras[achaId(ab.compras, 'fB')][3] = 'Troca'; });
      const PdR = celP(ab => { ab.despesas[0][4] = 'não — a pagar com data futura'; });
      const xDesp = '✗ aba Despesas: linhas que entram no Resumo = despesas';
      t('31f (controle negativo): Situação, Como entrou e "Entra no Resumo?" trocados na linha montada acusam, e o ✗ diz a coluna e a linha do Excel (a soma e a mesma, so o rotulo mudou)',
        PsE.resumo.conferencia[2].ok === false && PsE.resumo.conferencia[3].ok === false && PsE.resumo.conferencia[2].motivo === 'a coluna Situação da linha ' + nU + ' não é a do lançamento'
        && PcT.resumo.conferencia[0].ok === false && res31(PcT, '✗ = comprei (mercadoria)').t === 'NÃO fecha — a coluna Como entrou da linha ' + nB + ' da aba Compras não é a do lançamento.'
        && PdR.resumo.conferencia[4].ok === false && res31(PdR, xDesp).t === 'NÃO fecha — a coluna "Entra no Resumo?" da linha 4 diz o contrário do app.',
        JSON.stringify([PsE.resumo.conferencia[2], PsE.resumo.conferencia[3], res31(PcT, '✗ = comprei (mercadoria)').t, res31(PdR, xDesp).t]));
      const PlP = celP(ab => { ab.vendas[achaId(ab.vendas, 'fW')][10] += 0.001; });
      const PcU = celP(ab => { ab.estoque[achaId(ab.estoque, 'fU')][5] += 1; });
      const PvP = celP(ab => { ab.estoque[achaId(ab.estoque, 'fU')][9] += 0.001; });
      const PcV = celP(ab => { const l = ab.vendas[achaId(ab.vendas, 'fW')]; l[8] += 0.01; l[9] -= 0.01; });
      t('31f (controle negativo): Lucro %, Custo por unidade e Vale − custo % que nao sao a conta das celulas da linha acusam; o Custo da venda mudado junto com o Lucro (a conta da linha fecha) acusa pela propria celula',
        PlP.resumo.conferencia[1].ok === false && PlP.resumo.conferencia[1].motivo === 'a coluna Lucro % da linha ' + nW + ' não é Lucro ÷ Custo'
        && PcU.resumo.conferencia[2].ok === false && PcU.resumo.conferencia[2].motivo === 'a coluna Custo por unidade da linha ' + nU + ' não é Custo ÷ Qtd'
        && PvP.resumo.conferencia[3].ok === false && PvP.resumo.conferencia[3].motivo === 'a coluna Vale − custo % da linha ' + nU + ' não é (Vale − custo) ÷ custo'
        && PcV.resumo.conferencia[1].ok === false && PcV.resumo.conferencia[1].motivo === 'a coluna Custo da linha ' + nW + ' não é o custo da venda',
        JSON.stringify([PlP.resumo.conferencia[1], PcU.resumo.conferencia[2], PvP.resumo.conferencia[3], PcV.resumo.conferencia[1]]));
      const PdL = celP(ab => { ab.despesas[0][4] = 'não — a pagar com data futura'; ab.brutos.despesas[0].entra = false; });
      const PcL = celP(ab => { const i = achaId(ab.compras, 'fB'); ab.compras.splice(i, 1); ab.brutos.compras.splice(i, 1); });
      t('31f (controle negativo): diferenca acima de meio centavo por linha nao e arredondamento: vira ✗ com o motivo nas Despesas e no comprei (antes a planilha chamava R$ 25,00 de arredondamento)',
        res31(PdL, xDesp).t === 'NÃO fecha — a coluna Valor das despesas com "sim" em "Entra no Resumo?" soma ' + fmt31(25) + ' a menos que o Painel, e isso não é arredondamento de centavo.'
        && res31(PcL, '✗ = comprei (mercadoria)').t === 'NÃO fecha — a conta acima soma ' + fmt31(130) + ', ' + fmt31(30) + ' a menos que o Painel, e isso não é arredondamento de centavo.',
        JSON.stringify([res31(PdL, xDesp).t, res31(PcL, '✗ = comprei (mercadoria)').t]));
      /* o valor do limite fica preso: R$ 0,05 fora da soma, com 1 linha somada, passa de meio centavo por linha (R$ 0,025) e fica abaixo de um
         limite 10 vezes maior (revisor disco r7, M1) */
      setg('movs', copiaF(movsPF0).concat([{ id:'fD2', tipo:'DESPESA', data:'2026-08-06', cat:'Taxa', valor:0.05, status:'pago', natureza:'ordinaria' }]));
      const PdP = celP(ab => { const i = achaId(ab.despesas, 'fD2'); ab.despesas[i][4] = 'não — a pagar com data futura'; ab.brutos.despesas[i].entra = false; });
      setg('movs', copiaF(movsPF0));
      t('31f (controle negativo): R$ 0,05 fora da soma das despesas, com 1 linha somada, já não é arredondamento (o limite é meio centavo por linha, não 10 vezes isso)',
        res31(PdP, xDesp).t === 'NÃO fecha — a coluna Valor das despesas com "sim" em "Entra no Resumo?" soma ' + fmt31(0.05) + ' a menos que o Painel, e isso não é arredondamento de centavo.',
        res31(PdP, xDesp).t);
      /* o limite da aba Compras conta os numeros arredondados de cada compra (Custo total e o que saiu em troca): 5 compras com pedaco trocado e
         valores de 4 casas ficam a R$ 0,05 do Painel so por arredondamento (revisor numero r7, L2: antes dava ✗ falso) */
      setg('movs', copiaF([1, 2, 3, 4, 5].reduce((l, i) => l.concat([F31f('tR' + i, { cat:'ETB', colecao:'T', valor:1.0002, situacao:'Em estoque' }),
        F31f('tR' + i + 'x', { cat:'ETB', colecao:'T', valor:1.0049, situacao:'Trocado', loteOrigem:'tR' + i })]), [])));
      const PT5 = A('montarPlanilhaTCG')(), tT5 = res31(PT5, '✓ = comprei (mercadoria)').t;
      setg('movs', copiaF(movsPF0));
      t('31f: 5 compras com pedaço trocado e valores de 4 casas: a diferença de R$ 0,05 é arredondamento na aba Compras (o limite conta o Custo total e o que saiu em troca de cada compra)',
        PT5.resumo.conferencia[0].ok === true && tT5.endsWith('Diferença só de arredondamento de centavo: a conta acima soma ' + fmt31(0.05) + ' a mais que o Painel.'),
        JSON.stringify([PT5.resumo.conferencia[0], tT5.slice(-170)]));
      /* dois erros na mesma aba: o ✗ diz o primeiro e avisa que ha mais (revisor numero r7, L3) */
      const PmM = celP(ab => { ab.estoque[achaId(ab.estoque, 'fU')][0] = 'Na coleção'; ab.estoque[achaId(ab.estoque, 'fB')][4] += 1; });
      t('31f (controle negativo): com erro em duas linhas da mesma aba, o ✗ diz o primeiro e avisa que outras linhas dessa aba também têm erro',
        PmM.resumo.conferencia[2].ok === false && PmM.resumo.conferencia[2].motivo === 'a coluna Situação da linha ' + nU + ' não é a do lançamento; outras linhas dessa aba também têm erro',
        JSON.stringify(PmM.resumo.conferencia[2]));
      /* ---- 31f, rodada 8 (le-como-felype r8, 1, 2 e 5; revisor numero r8, L1; revisor disco r8, M1): "outras linhas" conta linhas, com o
         Custo e o Vale do estoque na mesma aba, tambem em Compras, Vendas e Despesas; a soma que nao bate (linha que faltou ou entrou duas
         vezes) diz o nome, o lado e, na aba Compras, o total; com erro de celula ela entra no fim do motivo; o Resultado bruto diz o lado; o ✗
         sobe para o topo do Resumo; o limite da aba Compras fica preso e diz "a mais"; e os nomes do Custo e do Vale do estoque ---- */
      const nCU = lnF('Compras', l => l[l.length - 1] === 'fU'), nCV = lnF('Compras', l => l[l.length - 1] === 'fV'), nX = lnF('Vendas', l => l[l.length - 1] === 'fX');
      const PeV = celP(ab => { ab.estoque[achaId(ab.estoque, 'fU')][4] += 1; ab.estoque[achaId(ab.estoque, 'fB')][6] += 1; });
      const PcC2 = celP(ab => { ab.compras[achaId(ab.compras, 'fU')][4] += 1; ab.compras[achaId(ab.compras, 'fV')][4] += 1; });
      const PvL2 = celP(ab => { ab.vendas[achaId(ab.vendas, 'fW')][8] += 1; ab.vendas[achaId(ab.vendas, 'fX')][7] += 1; });
      const mV2 = nX < nW ? 'a coluna Líquido da linha ' + nX + ' não é o líquido da venda' : 'a coluna Custo da linha ' + nW + ' não é o custo da venda';
      setg('movs', copiaF(movsPF0).concat([{ id:'fD3', tipo:'DESPESA', data:'2026-08-07', cat:'Taxa', valor:7, status:'pago', natureza:'ordinaria' }]));
      const PdD2 = celP(ab => { ab.despesas.forEach(l => { l[2] += 1; }); });
      setg('movs', copiaF(movsPF0));
      t('31f (controle negativo): "outras linhas" também no Custo e no Vale do estoque (a mesma aba), nas Compras, nas Vendas e nas Despesas, com o primeiro erro de cada uma',
        PeV.resumo.conferencia[2].motivo === 'a coluna Custo da linha ' + nU + ' não é o custo do lançamento; outras linhas dessa aba também têm erro'
        && PeV.resumo.conferencia[3].motivo === 'a coluna Custo da linha ' + nU + ' não é o custo do lançamento; outras linhas dessa aba também têm erro'
        && PcC2.resumo.conferencia[0].motivo === 'a coluna Custo total da linha ' + Math.min(nCU, nCV) + ' da aba Compras não é o custo da compra; outras linhas dessa aba também têm erro'
        && PvL2.resumo.conferencia[1].motivo === mV2 + '; outras linhas dessa aba também têm erro'
        && PdD2.resumo.conferencia[4].motivo === 'a coluna Valor da linha 4 não é o valor da despesa; outras linhas dessa aba também têm erro',
        JSON.stringify([PeV.resumo.conferencia[2], PeV.resumo.conferencia[3], PcC2.resumo.conferencia[0], PvL2.resumo.conferencia[1], PdD2.resumo.conferencia[4]]));
      const _motS = g('motor');
      const comMotor = (ajuste, mexe) => { let P; setg('motor', function () { const r0 = _motS.apply(this, arguments); const r1 = Object.assign({}, r0); ajuste(r1); return r1; });
        if (mexe) setg('_plDepoisDeMontar', mexe); try { P = A('montarPlanilhaTCG')(); } finally { setg('motor', _motS); setg('_plDepoisDeMontar', undefined); } return P; };
      const PsV = comMotor(r1 => { r1.vendasLiq += 50; }), PsC = comMotor(r1 => { r1.investido += 30; }), PsB = comMotor(r1 => { r1.cmv -= 12; });
      const PsVc = comMotor(r1 => { r1.vendasLiq += 50; }, ab => { ab.vendas[achaId(ab.vendas, 'fW')][9] += 1; });
      const xV = '✗ aba Vendas: soma do Líquido = vendi (líquido)', xB = '✗ Resultado bruto = vendi (líquido) − custo do que já vendeu − despesas';
      const temTopo = P => aba31(P, 'Resumo').linhas.some(x => x && x.celulas && x.celulas[0] && /^✗ Conferências? que não fech/.test(String(x.celulas[0].v)));
      /* v2.6f (le-como-felype r9, M1 e M2): a soma que nao bate diz a causa do lado do app, e o topo diz o que fazer */
      const causa31 = ': algum lançamento do app ficou fora dessa aba ou entrou nela duas vezes';
      t('31f (controle negativo): a soma que não bate com o Painel diz o nome da soma e o lado (Vendas), o total da conta acima (Compras), a causa do lado do app e o lado do Resultado bruto; com erro de célula, entra no fim do motivo; e o ✗ sobe para o topo do Resumo com o que fazer',
        res31(PsV, xV).t === 'NÃO fecha — a coluna Líquido da aba Vendas soma ' + fmt31(50) + ' a menos que o Painel, e isso não é arredondamento de centavo' + causa31 + '.'
        && res31(PsC, '✗ = comprei (mercadoria)').t === 'NÃO fecha — a conta acima soma ' + fmt31(160) + ', ' + fmt31(30) + ' a menos que o Painel, e isso não é arredondamento de centavo' + causa31 + '.'
        && res31(PsB, xB).t === 'NÃO fecha — o Resultado bruto dá ' + fmt31(12) + ' a menos que essa conta.'
        && PsVc.resumo.conferencia[1].motivo === 'a coluna Lucro da linha ' + nW + ' não é Líquido − Custo; e a soma da aba também não bate com o Painel' + causa31
        && res31(PsV, '✗ Conferência que não fecha').t === 'aba Vendas: a planilha saiu com erro nessa aba. Não some por ela nem use os valores dela: confira no app e avise o Felype. O motivo está em "Conferência das abas", no fim do Resumo.'
        && res31(PsC, '✗ Conferências que não fecham').t === 'aba Compras: a planilha saiu com erro nessa aba. Não some por ela nem use os valores dela: confira no app. O Resultado bruto também não bate com a conta dele: não decida por esse número antes de avisar o Felype. O motivo está em "Conferência das abas", no fim do Resumo.'
        && temTopo(PsV) && !temTopo(PF0),
        JSON.stringify([res31(PsV, xV).t, res31(PsC, '✗ = comprei (mercadoria)').t, res31(PsB, xB).t, PsVc.resumo.conferencia[1].motivo, temTopo(PsV) && res31(PsV, '✗ Conferência que não fecha').t, temTopo(PsC) && res31(PsC, '✗ Conferências que não fecham').t, temTopo(PF0)]));
      const PcLim = celP(ab => { const i = achaId(ab.compras, 'fU'); ab.compras[i][4] += 0.04; ab.brutos.compras[i].custo += 0.04; });
      const PeL = celP(ab => { const i = ab.estoque.findIndex(l => l[8] === ''); ab.estoque[i][4] += 1; ab.estoque[i][5] += 1; ab.brutos.estoque[i].custo += 1; ab.estoque[i][6] += 1; ab.brutos.estoque[i].vale += 1; });
      t('31f (controle negativo): o limite da aba Compras conta 1 número por compra sem troca (R$ 0,04 com 3 compras já não é arredondamento) e diz "a mais"; o ✗ do limite no Custo e no Vale do estoque diz o nome de cada soma',
        PcLim.resumo.conferencia[0].ok === false && PcLim.resumo.conferencia[0].motivo === 'a conta acima soma ' + fmt31(160.04) + ', ' + fmt31(0.04) + ' a mais que o Painel, e isso não é arredondamento de centavo'
        && PeL.resumo.conferencia[2].motivo === 'a coluna Custo da aba Estoque e coleção soma ' + fmt31(1) + ' a mais que o Painel, e isso não é arredondamento de centavo'
        && PeL.resumo.conferencia[3].motivo === 'a coluna Vale das linhas No estoque e Na coleção soma ' + fmt31(1) + ' a mais que o Painel, e isso não é arredondamento de centavo',
        JSON.stringify([PcLim.resumo.conferencia[0], PeL.resumo.conferencia[2], PeL.resumo.conferencia[3]]));
      /* ---- 31f, rodada 9 (le-como-felype r9, M1 a M3 e L1 a L3; revisores disco r9 M1 e L1, numero r9 L1): o topo conta conferencias e diz qual
         soma do estoque nao fecha; 2 abas e o Resultado bruto com o "e" no ultimo e o que fazer; o Resultado bruto "a mais"; abaixo de meio centavo
         a conta bate ate o centavo e fica fora do topo e do aviso; a soma que nao bate no fim do motivo de celula em Compras, Estoque e Despesas;
         e, ao baixar, a janela com OK so quando algo nao fecha de verdade ---- */
      const topoDe = P => { const x = aba31(P, 'Resumo').linhas.find(y => y && y.celulas && y.celulas[0] && /^✗ Conferências? que não fech/.test(String(y.celulas[0].v)));
        return x ? { r: String(x.celulas[0].v), s: x.celulas[0].s, t: String(x.celulas[2].v) } : null; };
      const PtS = celP(ab => { ab.estoque[achaId(ab.estoque, 'fU')][0] = 'Na coleção'; });
      const PtV = celP(ab => { ab.estoque[achaId(ab.estoque, 'fB')][6] += 1; });
      const Pt3 = comMotor(r1 => { r1.vendasLiq += 50; r1.investido += 30; }), PtB = comMotor(r1 => { r1.investido -= 30; }), PtSub = comMotor(r1 => { r1.investido += 0.0049; });
      const PtC7 = comMotor(r1 => { r1.investido += 7; }, ab => { ab.compras[achaId(ab.compras, 'fU')][4] += 1; });
      const PtE7 = comMotor(r1 => { r1.estoque += 7; }, ab => { ab.estoque[achaId(ab.estoque, 'fU')][4] += 1; });
      const PtD7 = comMotor(r1 => { r1.despTotal += 7; }, ab => { ab.despesas[0][2] += 1; });
      const sufixo31 = '; e a soma da aba também não bate com o Painel' + causa31;
      const tpS = topoDe(PtS), tpV = topoDe(PtV), tp3 = topoDe(Pt3), tpB = topoDe(PtB);
      t('31f (controle negativo): o topo do Resumo conta conferências e diz qual soma do estoque não fecha (Custo e Vale, só o Vale); com 2 abas e o Resultado bruto, os nomes com o "e" no último e o que fazer; o rótulo leva o ✗ e o negrito',
        !!tpS && tpS.r === '✗ Conferências que não fecham' && tpS.s === 'negrito' && tpS.t === 'aba Estoque e coleção (Custo e Vale): a planilha saiu com erro nessa aba. Não some por ela nem use os valores dela: confira no app e avise o Felype. O motivo está em "Conferência das abas", no fim do Resumo.'
        && !!tpV && tpV.r === '✗ Conferência que não fecha' && tpV.t.indexOf('aba Estoque e coleção (Vale): a planilha saiu com erro nessa aba.') === 0
        && !!tp3 && tp3.r === '✗ Conferências que não fecham' && tp3.t === 'aba Compras e aba Vendas: a planilha saiu com erro nessas abas. Não some por elas nem use os valores delas: confira no app. O Resultado bruto também não bate com a conta dele: não decida por esse número antes de avisar o Felype. O motivo está em "Conferência das abas", no fim do Resumo.',
        JSON.stringify([tpS, tpV, tp3]));
      t('31f (controle negativo): o Resultado bruto diz "a mais"; abaixo de meio centavo a conta bate até o centavo, nas Compras e no Resultado bruto, e fica fora do topo; a soma que não bate entra no fim do motivo de célula também em Compras, Estoque e Despesas',
        res31(PtB, xB).t === 'NÃO fecha — o Resultado bruto dá ' + fmt31(30) + ' a mais que essa conta.' && !!tpB && tpB.t.indexOf('. O Resultado bruto também não bate') > 0
        && res31(PtSub, '✗ = comprei (mercadoria)').t === 'NÃO fecha — a conta acima bate com o Painel até o centavo; a diferença é menor que um centavo e não muda soma nenhuma, mas avise o Felype.'
        && res31(PtSub, xB).t === 'NÃO fecha — o Resultado bruto bate com essa conta até o centavo; a diferença é menor que um centavo e não muda o resultado, mas avise o Felype.'
        && topoDe(PtSub) === null
        && PtC7.resumo.conferencia[0].motivo === 'a coluna Custo total da linha ' + nCU + ' da aba Compras não é o custo da compra' + sufixo31
        && PtE7.resumo.conferencia[2].motivo === 'a coluna Custo da linha ' + nU + ' não é o custo do lançamento' + sufixo31
        && PtD7.resumo.conferencia[4].motivo === 'a coluna Valor da linha 4 não é o valor da despesa' + sufixo31,
        JSON.stringify([res31(PtB, xB).t, tpB, res31(PtSub, '✗ = comprei (mercadoria)').t, res31(PtSub, xB).t, topoDe(PtSub), PtC7.resumo.conferencia[0].motivo, PtE7.resumo.conferencia[2].motivo, PtD7.resumo.conferencia[4].motivo]));
      const exporta31 = async ajuste => { const toasts = [], alertas = [], _t = g('toast'), _a = ctx.alert, _d = g('descargaBinaria'), _p = g('_precosTentado');
        if (ajuste) setg('motor', function () { const r0 = _motS.apply(this, arguments); const r1 = Object.assign({}, r0); ajuste(r1); return r1; });
        try { setg('toast', m => { toasts.push(String(m)); }); ctx.alert = m => { alertas.push(String(m)); }; setg('descargaBinaria', () => {}); setg('_precosTentado', true); await A('exportarPlanilha')(); }
        finally { setg('motor', _motS); setg('toast', _t); ctx.alert = _a; setg('descargaBinaria', _d); setg('_precosTentado', _p); }
        return { toasts, alertas }; };
      const eOk = await exporta31(null), eSub = await exporta31(r1 => { r1.investido += 0.0049; }), e3 = await exporta31(r1 => { r1.vendasLiq += 50; r1.investido += 30; });
      t('31f (controle negativo): ao baixar, sem erro sai o balão "baixada ✓"; abaixo de meio centavo também; com conferência que não fecha de verdade, a janela com OK, uma vez só e sem contagem',
        eOk.alertas.length === 0 && eOk.toasts.some(x => /^Planilha baixada ✓ — \d abas$/.test(x)) && eSub.alertas.length === 0 && eSub.toasts.some(x => /^Planilha baixada ✓/.test(x))
        && e3.alertas.length === 1 && e3.alertas[0] === 'A planilha foi baixada, mas saiu com erro: veja a linha com ✗ no começo do Resumo.' && !e3.toasts.some(x => /baixada/.test(x)),
        JSON.stringify([eOk, eSub, e3]));
      /* rodada 10 (revisor disco r10, M4 e L1): com UMA so conferencia que nao fecha a janela com OK tambem sai (Vendas, Despesas, Resultado bruto: com
         `falhou>1` a planilha com erro saia com o balao verde); com 3 abas o topo junta "A, B e C" (com ', ' trocado por ' e ' no primeiro, saia "A e B, C");
         e a soma do Vale que nao bate diz a causa, sozinha e no fim do motivo de celula (a mutacao soma:true do Vale ficava verde) */
      const e1V = await exporta31(r1 => { r1.vendasLiq += 50; }), e1D = await exporta31(r1 => { r1.despTotal += 7; }), e1B = await exporta31(r1 => { r1.cmv -= 12; });
      const janela1 = x => x.alertas.length === 1 && x.alertas[0] === 'A planilha foi baixada, mas saiu com erro: veja a linha com ✗ no começo do Resumo.' && !x.toasts.some(y => /baixada/.test(y));
      t('31h: com UMA só conferência que não fecha (Vendas, Despesas ou o Resultado bruto) o aviso ao baixar é a janela com OK, uma vez, e não o balão verde',
        janela1(e1V) && janela1(e1D) && janela1(e1B), JSON.stringify([e1V, e1D, e1B]));
      const Pt3a = celP(ab => { ab.vendas[achaId(ab.vendas, 'fW')][9] += 1; ab.estoque[achaId(ab.estoque, 'fU')][0] = 'Na coleção'; ab.despesas[0][2] += 1; }), tp3a = topoDe(Pt3a);
      t('31h: com 3 abas com erro (Vendas, Estoque e coleção com Custo e Vale, Despesas) o topo do Resumo junta os nomes "A, B e C"',
        !!tp3a && tp3a.r === '✗ Conferências que não fecham'
        && tp3a.t === 'aba Vendas, aba Estoque e coleção (Custo e Vale) e aba Despesas: a planilha saiu com erro nessas abas. Não some por elas nem use os valores delas: confira no app e avise o Felype. O motivo está em "Conferência das abas", no fim do Resumo.',
        JSON.stringify(tp3a));
      const _vmS31 = g('valorMercadoDe');
      /* a 1a chamada de valorMercadoDe dentro da planilha e a do Painel (o "vale ~" do estoque); as outras sao uma por item, as que somam as celulas */
      const comVale7 = mexe => { let P, n = 0; setg('valorMercadoDe', function () { const r0 = _vmS31.apply(this, arguments); if (n++ !== 0) return r0;
          const r1 = Object.assign({}, r0); r1.val = (r1.val || 0) + 7; if (r1.bruto != null) r1.bruto += 7; return r1; });
        try { P = mexe ? celP(mexe) : A('montarPlanilhaTCG')(); } finally { setg('valorMercadoDe', _vmS31); } return P; };
      const PvS = comVale7(null), PvC = comVale7(ab => { ab.estoque[achaId(ab.estoque, 'fU')][6] += 1; });
      t('31h: a soma do Vale que não bate com o Painel diz a causa do lado do app, sozinha e no fim do motivo de célula (a mesma frase da soma de Vendas, Estoque, Despesas e Compras)',
        PvS.resumo.conferencia[3].ok === false
        && PvS.resumo.conferencia[3].motivo === 'a coluna Vale das linhas No estoque e Na coleção soma ' + fmt31(7) + ' a menos que o Painel, e isso não é arredondamento de centavo' + causa31
        && PvC.resumo.conferencia[3].motivo === 'a coluna Vale da linha ' + nU + ' não é o Vale que o app dá a esse item' + sufixo31,
        JSON.stringify([PvS.resumo.conferencia[3], PvC.resumo.conferencia[3]]));

      setg('movs', copiaF([F31f('vL', { cat:'Booster Box', colecao:'V', qtd:2, valor:150, situacao:'Em estoque', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-10', data:'2026-05-01' }),
        F31f('vL1', { cat:'Booster Box', colecao:'V', qtd:2, valor:150, situacao:'Vendido', loteOrigem:'vL', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-10', data:'2026-05-01' }),
        F31f('vN1', { cat:'ETB', colecao:'W', valor:40, situacao:'Em estoque', notaId:'N60', notaNum:'60', pgTipo:'Parcelado', nParc:2, venc1:'2026-06-10', data:'2026-06-01' }),
        F31f('vN2', { cat:'ETB', colecao:'W', valor:60, situacao:'Em estoque', notaId:'N60', notaNum:'60', pgTipo:'Parcelado', nParc:2, venc1:'2026-06-10', data:'2026-06-01' })]));
      const tVN = res31(A('montarPlanilhaTCG')(), 'A pagar (parcelas e despesas)').t;
      setg('movs', copiaF([F31f('uV', { cat:'ETB', colecao:'U', valor:100, situacao:'Em estoque', pgTipo:'Parcelado', nParc:2, venc1:'2026-07-25' }),
        F31f('uP', { cat:'ETB', colecao:'U', valor:100, situacao:'Em estoque', pgTipo:'Parcelado', nParc:2, venc1:'2026-07-25', pgParcelas:{ 1:'2026-07-25' } }),
        F31f('uH', { cat:'ETB', colecao:'U', valor:30, situacao:'Em estoque', pgTipo:'Parcelado', nParc:1, venc1:'2026-08-20' })]));
      const tVU = res31(A('montarPlanilhaTCG')(), 'A pagar (parcelas e despesas)').t;
      t('31f: as parcelas vencidas contam a nota parcelada (1 compra) junto com o lote; a parcela com a marca de paga nao conta; a que vence hoje fica so no que vai vencer; 1 parcela sai no singular',
        tVN === 'Nada vence este mês. As 5 parcelas já vencidas de 2 compras (' + fmt31(400) + ') não entram: o app as conta como pagas, e o caixa acima já as descontou. Se alguma não foi paga, este A pagar está menor do que devia.'
        && tVU === fmt31(130) + ' vence até o fim do mês. Já está descontado no caixa acima: as parcelas de compra que ainda vão vencer (' + fmt31(130) + '). A parcela já vencida de 1 compra (' + fmt31(50) + ') não entra: o app a conta como paga. Se ela não foi paga, este A pagar está menor do que devia.',
        JSON.stringify([tVN, tVU]));
      /* chave das vencidas pela familia da aba Compras e pela data de vencimento (revisor numero r7, L1): pedaco com outra 1a parcela conta os 4
         vencimentos; dois pedacos orfaos da mesma compra apagada contam 1 compra, como a aba Compras mostra */
      setg('movs', copiaF([F31f('dL', { cat:'Booster Box', colecao:'D', qtd:2, valor:150, situacao:'Em estoque', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-10', data:'2026-05-01' }),
        F31f('dL1', { cat:'Booster Box', colecao:'D', qtd:2, valor:150, situacao:'Vendido', loteOrigem:'dL', pgTipo:'Parcelado', nParc:3, venc1:'2026-06-10', data:'2026-05-01' })]));
      const tVD = res31(A('montarPlanilhaTCG')(), 'A pagar (parcelas e despesas)').t;
      setg('movs', copiaF([F31f('oR1', { cat:'Booster Box', colecao:'O', qtd:2, valor:150, situacao:'Em estoque', loteOrigem:'compraApagada31', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-10', data:'2026-05-01' }),
        F31f('oR2', { cat:'Booster Box', colecao:'O', qtd:2, valor:150, situacao:'Vendido', loteOrigem:'compraApagada31', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-10', data:'2026-05-01' })]));
      const tVO = res31(A('montarPlanilhaTCG')(), 'A pagar (parcelas e despesas)').t;
      t('31f: as vencidas contam os vencimentos de verdade (pedaço do mesmo lote com outra 1ª parcela segue o plano do dono: 3 vencimentos de 1 compra) e os pedaços órfãos da mesma compra apagada como 1 compra',
        tVD === 'Nada vence este mês. As 3 parcelas já vencidas de 1 compra (' + fmt31(300) + ') não entram: o app as conta como pagas, e o caixa acima já as descontou. Se alguma não foi paga, este A pagar está menor do que devia.'
        && tVO === 'Nada vence este mês. As 3 parcelas já vencidas de 1 compra (' + fmt31(300) + ') não entram: o app as conta como pagas, e o caixa acima já as descontou. Se alguma não foi paga, este A pagar está menor do que devia.',
        JSON.stringify([tVD, tVO]));
      /* o mes nao junta vencimentos de dias diferentes, e orfaos de compras apagadas diferentes sao compras diferentes (revisor disco r8, M1: E2 e
         E3 passavam com a secao 31 verde) */
      setg('movs', copiaF([F31f('dM', { cat:'Booster Box', colecao:'M', qtd:2, valor:150, situacao:'Em estoque', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-10', data:'2026-05-01' }),
        F31f('dM1', { cat:'Booster Box', colecao:'M', qtd:2, valor:150, situacao:'Vendido', loteOrigem:'dM', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-20', data:'2026-05-01' })]));
      const tVM = res31(A('montarPlanilhaTCG')(), 'A pagar (parcelas e despesas)').t;
      setg('movs', copiaF([F31f('oS1', { cat:'Booster Box', colecao:'S', qtd:2, valor:150, situacao:'Em estoque', loteOrigem:'compraApagadaA31', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-10', data:'2026-05-01' }),
        F31f('oS2', { cat:'Booster Box', colecao:'S', qtd:2, valor:150, situacao:'Em estoque', loteOrigem:'compraApagadaB31', pgTipo:'Parcelado', nParc:3, venc1:'2026-05-10', data:'2026-05-01' })]));
      const tVS = res31(A('montarPlanilhaTCG')(), 'A pagar (parcelas e despesas)').t;
      t('31f: pedaços do mesmo lote com dias de vencimento diferentes seguem UM plano só (o do dono), e pedaços órfãos de compras apagadas diferentes contam como compras diferentes',
        tVM === 'Nada vence este mês. As 3 parcelas já vencidas de 1 compra (' + fmt31(300) + ') não entram: o app as conta como pagas, e o caixa acima já as descontou. Se alguma não foi paga, este A pagar está menor do que devia.'
        && tVS === 'Nada vence este mês. As 6 parcelas já vencidas de 2 compras (' + fmt31(300) + ') não entram: o app as conta como pagas, e o caixa acima já as descontou. Se alguma não foi paga, este A pagar está menor do que devia.',
        JSON.stringify([tVM, tVS]));

      setg('movs', copiaF(movsPF0));
      const rVM = rodape31(telaCons31('VENDA', 'itens', '')), rVS = rodape31(telaCons31('VENDA', 'itens', 'Caos'));
      t('31f: o rodape das vendas com venda sem taxa misturada soma o liquido de todas (130 com 10% de taxa + 50 sem taxa = 167); so com venda sem taxa, nao fala de liquido',
        rVM.v === fmt31(180) && rVM.nota === 'líquido ' + fmt31(167) + ', sem a taxa do app' && rVS.n === 1 && rVS.v === fmt31(50) && rVS.nota === '', JSON.stringify([rVM, rVS]));

      /* ---- 31g (v2.6g, revisor confere-o-numero 14/09). M2: a Consulta dizia "320 lançamentos · total comprado R$ 115.447,00", o Relatorio
         292 lancamentos para o mesmo total, e a linha "Caos ascendente · 18" abria Todos com 35 lancamentos. M3: o liquido do rodape de Vendas
         somava na ordem da lista e dava 1 centavo diferente do Painel quando a soma exata caia em meio centavo ---- */
      const ant31g = { ord:g('consOrd'), render:g('render'), tela:g('tela'), sel:g('perSel'), de:g('perDe'), ate:g('perAte') };
      setg('render', () => {});
      try {
        setg('consOrd', 'emissao'); setg('perSel', 'tudo'); setg('perDe', ''); setg('perAte', ''); setg('relJogo', ''); setg('relCol', ''); setg('relPess', ''); setg('relCat', '');
        setg('movs', copiaF([
          F31f('gc1', { cat:'ETB', colecao:'Conta', valor:100, situacao:'Em estoque' }),
          F31f('gc2', { cat:'ETB', colecao:'Conta', valor:50, situacao:'Vendido', data:'2026-07-05' }),
          F31f('gc3', { cat:'ETB', colecao:'Conta', valor:80, situacao:'Trocado' }),
          F31f('gc4', { cat:'Booster Box', colecao:'Conta', valor:300, situacao:'Aberto' }),
          F31f('gc5', { cat:'Booster', colecao:'Conta', qtd:18, valor:300, situacao:'Em estoque', loteOrigem:'gc4', origem:'ABERTURA' }),
          { id:'gcV', tipo:'VENDA', data:'2026-08-12', jogo:'Pokémon', cat:'ETB', colecao:'Conta', qtd:1, valor:70, canal:'Pix', taxa:0, contraparte:'Cli' }]));
        const rGc = rodape31(telaCons31('COMPRA', 'itens', '')), rGcBoo = rodape31(telaCons31('COMPRA', 'itens', 'Booster')), rGcTroc = rodape31(telaCons31('COMPRA', 'itens', 'Trocado')), rGcEst = rodape31(telaCons31('COMPRA', 'itens', 'Em estoque'));
        t('31g: a aba Compras diz quantas compras da lista entram no total comprado (5 na lista, 3 no total de R$ 450,00, que é o que o Relatório conta), no singular e com "nenhum"; sem compra de fora, o texto de sempre',
          rGc.n === 5 && rGc.rot === '3 entram no total comprado' && rGc.v === fmt31(450)
          && rGcBoo.n === 2 && rGcBoo.rot === '1 entra no total comprado' && rGcBoo.v === fmt31(300)
          && rGcTroc.n === 1 && rGcTroc.rot === 'nenhum entra no total comprado' && rGcTroc.v === fmt31(0)
          && rGcEst.n === 2 && rGcEst.rot === 'total comprado' && rGcEst.v === fmt31(400),
          JSON.stringify([rGc, rGcBoo, rGcTroc, rGcEst]));
        const hGcT = telaCons31('tudo', 'itens', ''), hGcTBoo = telaCons31('tudo', 'itens', 'Booster'), hGcTEst = telaCons31('tudo', 'itens', 'Em estoque');
        const comprado31g = h => (h.match(/🛒 comprado <b>[^<]*<\/b>[^<·]*/) || [''])[0];
        t('31g: em Todos o comprado diz em quantos lançamentos (6 na lista, R$ 450,00 em 3; "em 1 lançamento" no singular); só com compras que entram, não repete a contagem da lista',
          hGcT.indexOf('<span style="color:var(--mut)">6 lançamentos</span>') >= 0 && hGcT.indexOf('🛒 comprado <b>' + fmt31(450) + '</b> em 3 lançamentos · 💰 vendido <b>' + fmt31(70) + '</b>') >= 0
          && hGcTBoo.indexOf('🛒 comprado <b>' + fmt31(300) + '</b> em 1 lançamento<') >= 0 && hGcTEst.indexOf('🛒 comprado <b>' + fmt31(400) + '</b></span>') >= 0,
          JSON.stringify([comprado31g(hGcT), comprado31g(hGcTBoo), comprado31g(hGcTEst)]));
        const tabGc = [];
        setg('tabelaComp', (o, M, f, h) => { tabGc.push({ o:JSON.parse(JSON.stringify(o)), n:Object.fromEntries(Object.entries(M).map(([k, v]) => [k, v.length])), f:f || 'tudo' }); return _tcF31(o, M, f, h); });
        try { setg('tela', 'relatorios'); setg('relDimAll', 'colecao'); setg('relCompView', 'tab'); A('vRelatorios')(); }
        finally { setg('tabelaComp', _tcF31); setg('relCompView', 'lista'); }
        const cmpGc = tabGc.find(x => x.o.Conta === 450) || { n:{} };
        A('abrirConsultaPorDim')('Conta', cmpGc.f); const hGcToque = A('vConsultar')();
        t('31g: a linha do Comprei do Relatório ("Conta", 3 lançamentos, R$ 450,00) abre a Consulta com o mesmo total e a mesma contagem ao lado dele',
          cmpGc.n.Conta === 3 && cmpGc.f === 'tudo' && hGcToque.indexOf('🛒 comprado <b>' + fmt31(450) + '</b> em 3 lançamentos') >= 0,
          JSON.stringify([cmpGc, comprado31g(hGcToque)]));
        const hGcI = telaCons31('COMPRA', 'itens', '');
        t('31g: o cabeçalho do mês na aba Compras diz quantos do mês entram no total dele (4 lanç., 2 entram no total de R$ 400,00); o mês sem compra de fora e os cabeçalhos de Todos seguem como antes',
          hGcI.indexOf('· 4 lanç., 2 entram no total</span></span><b>' + fmt31(400) + '</b>') >= 0 && hGcI.indexOf('· 1 lanç.</span></span><b>' + fmt31(50) + '</b>') >= 0
          && hGcT.indexOf('· 5 lanç.</span>') >= 0 && hGcT.indexOf('no total</span>') < 0,
          JSON.stringify([hGcI.match(/· \d+ lanç\.[^<]*<\/span><\/span><b>[^<]*/g) || [], hGcT.match(/· \d+ lanç\.[^<]*<\/span>/g) || []]));

        /* M3: tres vendas do app cujo liquido soma exatos 475,065. Na ordem em que estao guardadas (a do motor) a soma arredonda para R$ 475,06;
           na ordem da lista (data mais nova primeiro) para R$ 475,07. O rodape de Vendas tem de dar o numero do Painel e da linha do Relatorio. */
        setg('movs', copiaF([['lq1', '2026-08-01', 238.34, 14], ['lq2', '2026-08-02', 105.68, 15], ['lq3', '2026-08-03', 209.61, 14]].map(([idm, data, valor, taxa]) =>
          ({ id:idm, tipo:'VENDA', data, jogo:'Pokémon', cat:'Booster', colecao:'Liq', qtd:1, valor, canal:'App', taxa, recDias:14, contraparte:'Cli' }))));
        const liq31g = m => (+m.valor || 0) * (1 - (+m.taxa || 0) / 100);
        const mLq = A('motor')(true), liqGuardado = g('movs').reduce((s, m) => s + liq31g(m), 0), liqLista = g('movs').slice().reverse().reduce((s, m) => s + liq31g(m), 0);
        const rLq = rodape31(telaCons31('VENDA', 'itens', ''));
        setg('tela', 'painel'); const vendLq = (A('vPainel')().match(/Vendido \(tudo\)<\/div><div class="v" style="color:var\(--green\)">([^<]*)<\/div>/) || [])[1];
        t('31g: o líquido do rodapé de Vendas é o Vendido do Painel quando a soma exata cai em meio centavo (475,065): R$ 475,06 na ordem guardada, e a ordem da lista (que dava R$ 475,07) não decide; o número do Painel é o mesmo da conta antiga, bit a bit',
          fmt31(liqLista) !== fmt31(liqGuardado) && Object.is(mLq.vendasLiq, liqGuardado)
          && rLq.nota === 'líquido ' + fmt31(mLq.vendasLiq) + ', sem a taxa do app' && vendLq === fmt31(mLq.vendasLiq),
          JSON.stringify([fmt31(liqLista), fmt31(liqGuardado), mLq.vendasLiq, rLq.nota, vendLq]));
        const tabLq = [];
        setg('tabelaComp', (o, M, f, h) => { tabLq.push({ o:JSON.parse(JSON.stringify(o)), f:f || 'tudo' }); return _tcF31(o, M, f, h); });
        try { setg('tela', 'relatorios'); setg('relDimAll', 'colecao'); setg('relCompView', 'tab'); A('vRelatorios')(); }
        finally { setg('tabelaComp', _tcF31); setg('relCompView', 'lista'); }
        const vendiLq = tabLq.find(x => x.f === 'VENDA') || { o:{} };
        A('abrirConsultaPorDim')('Liq', 'VENDA'); const rLqToque = rodape31(A('vConsultar')());
        t('31g: a linha Vendi do Relatório ("Liq") abre Vendas com o mesmo líquido dela e do Painel',
          fmt31(vendiLq.o.Liq) === fmt31(mLq.vendasLiq) && rLqToque.nota === 'líquido ' + fmt31(vendiLq.o.Liq) + ', sem a taxa do app',
          JSON.stringify([vendiLq, rLqToque]));

        /* ---- 31h (rodada 10, 19/09; revisores disco r10 M2 e M3, superficie r10 L1, numero r10 L7): o cabecalho do grupo diz "entram / 1 entra / nenhum
           entra no total" (era "0 no total" quando nenhuma entrava); a contagem em Todos aparece mesmo sem compra de fora quando a lista tem venda; e o
           liquido de Vendas e o Vendido do Painel somam so as vendas da lista, do periodo e do filtro. Antes, 11 das mutacoes destes pontos passavam
           com a secao 31 verde ---- */
        setg('movs', copiaF([
          F31f('h1', { cat:'ETB', colecao:'H', valor:100, situacao:'Em estoque', data:'2026-08-10', contraparte:'Forn A' }),
          F31f('h2', { cat:'ETB', colecao:'H', valor:80, situacao:'Trocado', data:'2026-08-11', contraparte:'Forn A' }),
          F31f('h3', { cat:'ETB', colecao:'H', valor:60, situacao:'Em estoque', data:'2026-09-10', contraparte:'Forn B' }),
          F31f('h4', { cat:'ETB', colecao:'H', valor:40, situacao:'Aberto', data:'2026-09-12', contraparte:'Forn B' }),
          F31f('h5', { cat:'ETB', colecao:'H', valor:20, situacao:'Em estoque', data:'2026-09-20', contraparte:'Forn B' }),
          F31f('h6', { cat:'ETB', colecao:'H', valor:25, situacao:'Trocado', data:'2026-10-03', contraparte:'Forn C' }),
          F31f('h7', { cat:'ETB', colecao:'H', valor:10, situacao:'Em estoque', data:'2026-07-04', contraparte:'Forn D' }),
          F31f('h8', { cat:'ETB', colecao:'H', valor:15, situacao:'Em estoque', data:'2026-07-05', contraparte:'Forn D' })]));
        const cabH = ord => { setg('consOrd', ord); try { return (telaCons31('COMPRA', 'itens', '').match(/· \d+ lanç\.[^<]*<\/span><\/span>/g) || []).sort(); } finally { setg('consOrd', 'emissao'); } };
        const cabEsp = ['· 1 lanç., nenhum entra no total</span></span>', '· 2 lanç., 1 entra no total</span></span>', '· 2 lanç.</span></span>', '· 3 lanç., 2 entram no total</span></span>'];
        const cabData = cabH('emissao'), cabPessoa = cabH('pessoa');
        t('31h: o cabeçalho do grupo na aba Compras diz "entram" (2 de 3, exatamente 1 de fora), "1 entra", "nenhum entra" (nenhuma do grupo entra) e nada quando todas entram; por data e por cliente / fornecedor (a chave do grupo é a mesma da contagem)',
          JSON.stringify(cabData) === JSON.stringify(cabEsp) && JSON.stringify(cabPessoa) === JSON.stringify(cabEsp), JSON.stringify([cabData, cabPessoa]));
        setg('movs', copiaF([
          F31f('z1', { cat:'ETB', colecao:'Zed', valor:100, situacao:'Em estoque' }),
          F31f('z2', { cat:'ETB', colecao:'Zed', valor:50, situacao:'Em estoque' }),
          { id:'zV', tipo:'VENDA', data:'2026-08-12', jogo:'Pokémon', cat:'ETB', colecao:'Zed', qtd:1, valor:70, canal:'Pix', taxa:0, contraparte:'Cli' }]));
        const hZ = telaCons31('tudo', 'itens', 'Zed');
        t('31h: em Todos, o comprado diz em quantos lançamentos mesmo quando nenhuma compra ficou de fora, se a lista tem venda (3 na lista, R$ 150,00 em 2)',
          hZ.indexOf('<span style="color:var(--mut)">3 lançamentos</span>') >= 0 && hZ.indexOf('🛒 comprado <b>' + fmt31(150) + '</b> em 2 lançamentos · 💰 vendido <b>' + fmt31(70) + '</b>') >= 0,
          JSON.stringify([comprado31g(hZ)]));
        setg('movs', copiaF([['lq1', '2026-08-01', 238.34, 14, 'Liq'], ['lq2', '2026-08-02', 105.68, 15, 'Liq'], ['lq3', '2026-08-03', 209.61, 14, 'Liq'], ['lq4', '2026-08-04', 100, 10, 'Out'],
          ['lq5', '2026-09-15', 50, 20, 'Liq']].map(([idm, data, valor, taxa, colecao]) =>
          ({ id:idm, tipo:'VENDA', data, jogo:'Pokémon', cat:'Booster', colecao, qtd:1, valor, canal:'App', taxa, recDias:14, contraparte:'Cli' }))));
        const somaGuardada31h = filtro => g('movs').filter(filtro).reduce((s, m) => s + liq31g(m), 0);
        const rLiqBusca = rodape31(telaCons31('VENDA', 'itens', 'Liq'));
        setg('perDe', '2026-08-01'); setg('perAte', '2026-08-31');
        const mPer = A('motor')(false);
        setg('perDe', ''); setg('perAte', ''); setg('relCol', 'Liq');
        const mFil = A('motor')(true);
        setg('relCol', '');
        t('31h: o líquido de Vendas soma só as vendas da lista (a busca "Liq" deixa a "Out" de fora), e o Vendido do Painel só as do período (agosto, sem a de setembro) e as do filtro do Relatório',
          rLiqBusca.nota === 'líquido ' + fmt31(somaGuardada31h(m => m.colecao === 'Liq')) + ', sem a taxa do app'
          && Object.is(mPer.vendasLiq, somaGuardada31h(m => m.data <= '2026-08-31')) && Object.is(mFil.vendasLiq, somaGuardada31h(m => m.colecao === 'Liq')),
          JSON.stringify([rLiqBusca.nota, mPer.vendasLiq, mFil.vendasLiq]));
      } finally {
        setg('render', ant31g.render); setg('consOrd', ant31g.ord); setg('tela', ant31g.tela); setg('perSel', ant31g.sel); setg('perDe', ant31g.de); setg('perAte', ant31g.ate);
        setg('tabelaComp', _tcF31); setg('relCompView', 'lista'); setg('relDimAll', 'colecao'); setg('consF', 'tudo'); setg('consCol', ''); setg('consQ', ''); setg('consJogo', 'todos');
      }

      setg('movs', copiaF([F31f('qX', { cat:'Booster Box', colecao:'Omega', valor:300, situacao:'Aberto', notaId:'N70', notaNum:'70' }),
        F31f('qX1', { cat:'Booster', colecao:'Omega', qtd:9, valor:150, situacao:'Em estoque', loteOrigem:'qX', origem:'ABERTURA' }),
        F31f('qX2', { cat:'Booster', colecao:'Omega', qtd:9, valor:150, situacao:'Coleção', loteOrigem:'qX', origem:'ABERTURA' }),
        F31f('qY', { cat:'ETB', colecao:'Zeta', valor:90, situacao:'Em estoque', notaId:'N70', notaNum:'70' }),
        F31f('qM', { cat:'Booster Box', colecao:'Omega', valor:100, situacao:'Em estoque' }),
        F31f('qM1', { cat:'Booster Box', colecao:'Omega', valor:100, situacao:'Aberto', loteOrigem:'qM' }),
        F31f('qM2', { cat:'Booster', colecao:'Sigma', qtd:18, valor:100, situacao:'Em estoque', loteOrigem:'qM1', origem:'ABERTURA' })]));
      const hQN = telaCons31('COMPRA', 'notas', 'Zeta'), hQL = telaCons31('COMPRA', 'notas', 'Sigma'), rQL = rodape31(hQL);
      const fxQ = h => (h.match(/O valor do card[^<]*/) || [''])[0];
      t('31f: faixa com busca: a caixa aberta da nota e a caixa do lote nao contam como escondidas (o card ja tirou a caixa), e o lote avulso parcial soma o que a busca escondeu (200 no card − 100 no total = 100)',
        fxQ(hQN) === 'O valor do card é a nota inteira, menos a caixa aberta, mesmo quando esta aba mostra só parte dela.'
        && rQL.v === fmt31(100) && fxQ(hQL) === 'O valor do card é a nota inteira. Com o filtro atual, ' + fmt31(100) + ' do valor dos cards são de lançamentos escondidos, que o total embaixo não soma.',
        JSON.stringify([fxQ(hQN), rQL, fxQ(hQL)]));

      setg('movs', copiaF([1, 2, 3].map(i => ({ id:'rw' + i, tipo:'VENDA', data:'2026-08-1' + i, jogo:'Pokémon', cat:'Booster', colecao:'R', qtd:1, valor:0.98, canal:'App', taxa:12, recDias:14, contraparte:'Cli' }))
        .concat([1, 2, 3].map(i => F31f('rc' + i, { cat:'Booster', colecao:'R', valor:0.333, situacao:'Vendido' })))
        .concat([{ id:'rd', tipo:'DESPESA', data:'2026-08-05', cat:'Frete', valor:5, status:'pago', natureza:'ordinaria' }])));
      const PM = A('montarPlanilhaTCG')(), tMv = res31(PM, '✓ Vendas, Estoque e coleção, Despesas').t, tMc = res31(PM, '✓ = comprei (mercadoria)').t;
      const PMx = celP(ab => { ab.despesas[0][2] += 0.01; }), tMx = res31(PMx, '✓ aba Vendas: soma do Líquido = vendi (líquido)').t;
      const arr1 = (col, lado) => 'Diferença só de arredondamento de centavo: ' + col + ' soma ' + fmt31(0.01) + ' ' + lado + ' que o Painel.';
      t('31f: o arredondamento a menos diz "a menos", tambem na linha do comprei; no ramo com um ✗, o ✓ que fecha mantem o aviso dele',
        PM.resumo.conferencia.every(c => c.ok) && tMv.endsWith(arr1('a coluna Líquido da aba Vendas', 'a menos')) && tMc.endsWith(arr1('a conta acima', 'a menos'))
        && PMx.resumo.conferencia[4].ok === false && tMx === 'Fecha. ' + arr1('a coluna Líquido da aba Vendas', 'a menos'),
        JSON.stringify([tMv, tMc, tMx, PM.resumo.conferencia.filter(c => !c.ok)]));

      /* o vazio de colecao e de tipo no seletor da Consulta (revisor disco r6, M1: 6 das 10 regras da opcao do vazio passavam verdes; a 31f so
         tinha o de pessoa) */
      setg('movs', copiaF([F31f('oA', { cat:'ETB', colecao:'Caos', valor:100, situacao:'Em estoque' }), F31f('oB', { cat:'', colecao:'', valor:40, situacao:'Em estoque' }),
        { id:'oD', tipo:'DESPESA', data:'2026-08-05', cat:'Frete', valor:25, status:'pago', natureza:'ordinaria' }]));
      const telaF = (col, cat) => { setg('tela', 'consultar'); setg('consMenu', false); setg('perSel', 'tudo'); setg('perDe', ''); setg('perAte', ''); setg('consJogo', 'todos');
        setg('consPess', ''); setg('consConta', ''); setg('consQ', ''); setg('consF', 'tudo'); setg('consVer', 'itens'); setg('expandId', null); setg('consCol', col); setg('consCat', cat); setg('consFOpen', true);
        try { return A('vConsultar')(); } finally { setg('consFOpen', false); setg('consCol', ''); setg('consCat', ''); } };
      const hOC = telaF('(sem coleção)', ''), hOT = telaF('', '(sem tipo)');
      setg('movs', copiaF(movsPF0));
      const hO0 = telaF('', '');
      t('31f: o vazio de colecao e de tipo aparece marcado no seletor, a despesa nao entra no "(sem coleção)" em Todos, e sem compra ou venda vazia a opcao nao aparece (a despesa sem colecao nao conta)',
        hOC.indexOf('<option selected>(sem coleção)</option>') >= 0 && hOC.indexOf('🛒 comprado <b>' + fmt31(40) + '</b>') >= 0 && hOC.indexOf('🧾 despesas') < 0
        && hOT.indexOf('<option selected>(sem tipo)</option>') >= 0 && hOT.indexOf('🛒 comprado <b>' + fmt31(40) + '</b>') >= 0
        && hO0.indexOf('(sem coleção)') < 0 && hO0.indexOf('(sem tipo)') < 0,
        JSON.stringify([hOC.match(/<option[^>]*>\(sem [^<]*<\/option>/g) || [], hOT.match(/<option[^>]*>\(sem [^<]*<\/option>/g) || [], hOC.match(/🛒 comprado <b>[^<]*|🧾 despesas <b>[^<]*/g) || [], hO0.indexOf('(sem ')]));
      /* aba Despesas com o vazio escolhido: a mensagem diz que o vazio so procura compras e vendas (le-como-felype r7, decisao b) */
      const telaD = pess => { setg('tela', 'consultar'); setg('consMenu', false); setg('perSel', 'tudo'); setg('perDe', ''); setg('perAte', ''); setg('consJogo', 'todos'); setg('consCol', ''); setg('consCat', '');
        setg('consConta', ''); setg('consQ', ''); setg('consVer', 'itens'); setg('expandId', null); setg('consF', 'DESPESA'); setg('consPess', pess);
        try { return A('vConsultar')(); } finally { setg('consPess', ''); setg('consF', 'tudo'); } };
      const hDv = telaD('(sem cliente/fornecedor)'), hDn = telaD('Ninguem31f');
      t('31f: na aba Despesas, o vazio escolhido diz que so procura compras e vendas; outro filtro sem resultado segue "Nada nesse filtro."',
        hDv.indexOf('Nada nesse filtro: "(sem cliente/fornecedor)" só procura compras e vendas.') >= 0 && hDn.indexOf('<div class="empty">Nada nesse filtro.</div>') >= 0,
        JSON.stringify([(hDv.match(/<div class="empty">[^<]*/) || [''])[0], (hDn.match(/<div class="empty">[^<]*/) || [''])[0]]));
      /* o vazio de colecao e o de tipo tambem entram na mensagem, com o nome escolhido; com dois vazios a frase nomeia os dois; na aba Todos, um
         vazio e uma busca que zera a lista seguem "Nada nesse filtro." (revisor disco r8, M1: B1 a B5 passavam com a secao 31 verde;
         le-como-felype r8, 4) */
      const telaV = (f, col, cat, pess, q) => { setg('tela', 'consultar'); setg('consMenu', false); setg('perSel', 'tudo'); setg('perDe', ''); setg('perAte', ''); setg('consJogo', 'todos');
        setg('consConta', ''); setg('consVer', 'itens'); setg('expandId', null); setg('consF', f); setg('consCol', col); setg('consCat', cat); setg('consPess', pess); setg('consQ', q);
        try { return (A('vConsultar')().match(/<div class="empty">[^<]*/) || [''])[0]; } finally { setg('consCol', ''); setg('consCat', ''); setg('consPess', ''); setg('consQ', ''); setg('consF', 'tudo'); } };
      const vC = telaV('DESPESA', '(sem coleção)', '', '', ''), vT = telaV('DESPESA', '', '(sem tipo)', '', ''), v2 = telaV('DESPESA', '(sem coleção)', '', '(sem cliente/fornecedor)', ''),
        vTd = telaV('tudo', '', '', '(sem cliente/fornecedor)', 'zzzz31f');
      t('31f: na aba Despesas o vazio de coleção e o de tipo também explicam, com o nome escolhido; com dois vazios a frase nomeia os dois; na aba Todos, um vazio e uma busca que zera a lista seguem "Nada nesse filtro."',
        vC === '<div class="empty">Nada nesse filtro: "(sem coleção)" só procura compras e vendas.' && vT === '<div class="empty">Nada nesse filtro: "(sem tipo)" só procura compras e vendas.'
        && v2 === '<div class="empty">Nada nesse filtro: "(sem coleção)" e "(sem cliente/fornecedor)" só procuram compras e vendas.' && vTd === '<div class="empty">Nada nesse filtro.',
        JSON.stringify([vC, vT, v2, vTd]));
    } finally {
      semRelogio31();
      setg('_precosLiga', _plF31); setg('render', _renderF31); setg('graficoCompSvg', _gcF31); setg('tabelaComp', _tcF31); setg('_plDepoisDeMontar', undefined);
      setg('relCompView', 'lista'); setg('relDimAll', 'colecao'); setg('relJogo', ''); setg('relCol', ''); setg('relPess', ''); setg('relCat', ''); setg('consConta', ''); setg('consCat', ''); setg('consPess', ''); setg('consCol', ''); setg('consJogo', 'todos');
    }
  }
  setg('movs', []); setg('perDe', ''); setg('perAte', ''); setg('consF', 'tudo'); setg('consVer', 'itens'); setg('consQ', ''); setg('expandId', null); reset();
}).catch(e=>{fail++;console.log('  FALHOU  secao 31 explodiu -> '+((e&&e.stack)||e));}).then(async()=>{
  /* ===== 32. FLUXO DE ESTOQUE (19/09/2026) =====
     O que 7 rodadas de revisao adversarial achou no fluxo "pedido a caminho -> chegou / vendido antes de chegar / separado pra colecao"
     e nas tres curvas (estoque, dinheiro, colecao) que a aba Fluxo de estoque desenha. Nenhum destes casos tinha teste: a suite
     terminava na secao 31 e o fluxo so era provado pelo revisor, a mao, a cada rodada. Cada bloco (32a..32k) cobre uma funcao e
     nomeia o achado que a fez nascer (G1, G2, M2, M3...).
     Como esta secao e construida: cada bloco monta o PROPRIO fixture com reset(), nao depende de ordem e restaura no finally tudo o
     que mexe (prompt, confirm, alert, getElementById, tela, editId, tipoSel, toast, diarioReg...) — um bloco que explode vira UMA
     linha FALHOU e os outros seguem. Relogio real, nada de Date falso: "hoje" e o dia LOCAL, derivado aqui (getFullYear/getMonth/getDate),
     nunca pelo `hojeISO()` do app — o oraculo nao pode ser a propria peca medida.
     [CORRIGIDO 2026-09-22] este comentario dizia "toISOString().slice(0,10), igual ao app" e virou mentira em 21/09, quando o app passou a
     usar UM relogio LOCAL (`hojeISO()`). Das 21h a meia-noite de Brasilia o UTC ja e o dia seguinte: 12 testes desta secao ficavam
     VERMELHOS toda noite, com "dataChegada=2026-09-21 hoje=2026-09-22" — o instrumento errado acusando o app certo. Foi visto ao vivo
     as 21h01 de 21/09/2026.
     Controle negativo (19/09/2026): cada mutacao no app abaixo deixa VERMELHOS os blocos citados —
       pedidosAgrupados sem a linha de colecao: 32d 32i | separarParaColecao sem destIni: 32c | sem origemPedido: 32c 32d 32i |
       chegouPedido sem delete origemPedido: 32b 32j | vEstoque com fmt(r.pedido): 32i | serieColecao sem "if(s==='Pedido')return": 32f |
       serieColecao sem clamp: 32f | serieEstoque sem clamp: 32e | serieDinheiro sem o filtro Parcelado da nota: 32g |
       serieDinheiro sem o dedupe por slot: 32g | serieColecao entrando pela dataChegada: 32f.
     CONHECIDO e ADIADO, sem teste de proposito: G-1 — pagamento registrado ANTES do fracionamento e contado em dobro por
     serieDinheiro depois de um JSON.parse(JSON.stringify(movs)) (a referencia compartilhada de pgParcelas some no recarregamento).
     A raiz esta em baixarLote (copia rasa) e a cura pede revisao propria (mexe tambem em contasPagas e saldoConta). */
  console.log('');
  console.log('=== 32. fluxo de estoque: chegada, separar pra colecao, agrupamento, curvas, card e ciclo de origemPedido ===');
  const hoje32 = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const ehHoje32 = (v, antes) => v === antes || v === hoje32();
  const fmt32 = g('fmt');
  const r2_32 = x => Math.round(x * 100) / 100;
  const foto32 = () => JSON.stringify(M());
  const S32 = s => JSON.stringify(s);
  const ultimo32 = s => (s.length ? s[s.length - 1].total : 0);
  const pt32 = (s, d) => s.find(p => p.data === d);
  const gravado32 = idm => (JSON.parse(ctx.localStorage.getItem(g('MK')) || '[]').find(m => m.id === idm) || {});
  const compra32 = (idc, extra) => Object.assign({ id: idc, tipo: 'COMPRA', data: '2026-01-10', jogo: 'Pokémon', cat: 'ETB', colecao: '151', qtd: 1, valor: 10,
    situacao: 'Em estoque', destino: 'Vender', contraparte: 'Forn', pgTipo: 'À vista' }, extra || {});
  /* pre-venda = o que salvar() faz numa venda de item 'Pedido': fraciona como Vendido, cria a VENDA ligada por origemId e grava vendaRef no pedaco */
  const preVenda32 = (idPai, qtd, quem, extras) => {
    const ex = Object.assign({ dataVenda: '2026-09-01', dataSaida: '2026-09-01' }, extras || {});
    const peca = A('baixarLote')(idPai, qtd, 'Vendido', ex);
    const venda = { id: 'V_' + peca.id, tipo: 'VENDA', data: ex.dataVenda, valor: 99, origemId: idPai, vendaDe: 'pedido', contraparte: quem, qtd: peca.qtd };
    M().push(venda);
    if (peca.id !== idPai) peca.vendaRef = venda.id;
    return { peca, venda };
  };
  /* dublê de DOM que LE campos (o padrao e um stub novo por chamada, com value vazio: nada digitado "fica") */
  const campos32 = {};
  const elCampo32 = idc => ({
    get value() { return (idc in campos32) ? campos32[idc] : ''; }, set value(v) { campos32[idc] = v; },
    checked: false, textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, children: [],
    appendChild() {}, remove() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, scrollIntoView() {}, focus() {},
    insertAdjacentHTML() {}, getAttribute() { return null; }, setAttribute() {}, removeAttribute() {}, closest() { return null; }, cloneNode() { return elCampo32(idc); }
  });
  /* tudo o que os blocos podem mexer; cada bloco devolve o app ao estado em que o achou */
  const G32 = ['tela', 'editId', 'tipoSel', 'pgTipo', 'consMenu', 'perDe', 'perAte', 'perSel', '_pendVolta', '_lancarDirty', '_fotosPend', 'navHist',
    'verCaixaEstoque', 'verColecaoEstoque', '_db', '_syncReady', '_restaurando', '_baseH', 'diarioReg', 'toast', 'vendaDe', 'vendaUn', 'canal', '_preSel'];
  /* pre-requisito: o app carregado TEM o fluxo de estoque. Contra um build sem ele (o tcg-web/index.html antigo, antes do build) a secao
     nao pode virar 11 explosoes confusas nem passar calada: vira UMA linha vermelha que nomeia o que falta. */
  const FUNCS32 = ['chegouPeca', 'chegouPedido', 'separarParaColecao', 'pedidosAgrupados', 'serieEstoque', 'serieDinheiro', 'serieColecao',
    'graficoLinhaEstoque', 'vEstoque', 'soltarIntrusa', 'diagLote', 'baixarLote', 'salvar', 'motor', 'aPagar', 'sitDe'];
  const faltam32 = FUNCS32.filter(n => { try { return typeof A(n) !== 'function'; } catch (e) { return true; } });
  t('32a: [pre-requisito] o app carregado tem todas as ' + FUNCS32.length + ' funcoes do fluxo de estoque que esta secao exercita',
    faltam32.length === 0, 'FALTAM no app: ' + faltam32.join(', ') + ' — este teste esta rodando contra um build sem o fluxo de estoque?');
  const bloco32 = async (rot, corpo) => {
    if (faltam32.length) return;   /* o pre-requisito ja acusou; sem as funcoes cada bloco so repetiria o mesmo erro */
    const salvos = [];
    const orig = { prompt: ctx.prompt, confirm: ctx.confirm, alert: ctx.alert, geb: ctx.document.getElementById };
    try { G32.forEach(n => { const v = g(n); salvos.push([n, Array.isArray(v) ? v.slice() : v]); }); reset(); await corpo(); }
    catch (e) { t('32' + rot + ': o bloco explodiu antes de terminar (o que vinha depois dele NAO foi provado)', false, String((e && e.stack) || e).slice(0, 700)); }
    finally {
      ctx.prompt = orig.prompt; ctx.confirm = orig.confirm; ctx.alert = orig.alert; ctx.document.getElementById = orig.geb;
      descongela();
      salvos.forEach(([n, v]) => setg(n, v));
      reset();
    }
  };
  /* captura tudo o que o usuario VE ou responde: toast, diario, alert, confirm (texto) e prompt (pergunta + resposta programada) */
  const capturas32 = () => {
    const c = { toasts: [], diario: [], alertas: [], confirms: [], perguntas: [], confirmar: true, resposta: '1' };
    setg('toast', m => { c.toasts.push(String(m)); });
    setg('diarioReg', a => { c.diario.push(String(a)); });
    ctx.alert = m => { c.alertas.push(String(m)); };
    ctx.confirm = m => { c.confirms.push(String(m)); return c.confirmar; };
    ctx.prompt = (q, d) => { c.perguntas.push([String(q), d]); return c.resposta; };
    return c;
  };

  /* ---------- 32a: chegouPeca (confirmar a chegada de peca pre-vendida OU separada pra colecao) ---------- */
  await bloco32('a', async () => {
    setg('tela', 'estoque');
    let c = capturas32();
    /* peca PRE-VENDIDA (Vendido, ainda sem chegada) */
    M().push(compra32('a1', { data: '2026-08-01', qtd: 3, valor: 30, situacao: 'Pedido' }));
    const { peca: pv, venda: vd } = preVenda32('a1', 1, 'Fulano');
    const vendaAntes = JSON.stringify(vd), valorAntes = pv.valor;
    let antes = foto32(); c.confirmar = false;
    A('chegouPeca')(pv.id);
    t('32a: cancelar o confirm NAO grava nada — nenhum registro muda, sem toast e sem linha no diario (a pergunta foi feita 1 vez)',
      foto32() === antes && c.toasts.length === 0 && c.diario.length === 0 && c.confirms.length === 1, S32([c.confirms.length, c.toasts, c.diario]));
    c = capturas32(); c.confirmar = true;
    const d0 = hoje32();
    A('chegouPeca')(pv.id);
    const pvD = M().find(m => m.id === pv.id);
    t('32a: confirmar a chegada da peca vendida grava dataChegada = hoje',
      ehHoje32(pvD.dataChegada, d0), 'dataChegada=' + pvD.dataChegada + ' hoje=' + d0);
    t('32a: e NAO mexe em situacao, valor, datas da venda, vinculo (vendaRef) nem cria registro novo',
      A('sitDe')(pvD) === 'Vendido' && pvD.valor === valorAntes && pvD.dataSaida === '2026-09-01' && pvD.dataVenda === '2026-09-01' && pvD.vendaRef === vd.id && M().length === 3,
      S32([A('sitDe')(pvD), pvD.valor, pvD.dataSaida, pvD.vendaRef, M().length]));
    t('32a: a VENDA lançada continua exatamente como estava (o dinheiro e o lucro ja contavam desde a venda)',
      JSON.stringify(M().find(m => m.id === vd.id)) === vendaAntes);
    t('32a: para peca VENDIDA a pergunta fala em "esta venda" (e nunca "esta peça")', /esta venda/.test(c.confirms[0]) && !/esta peça/.test(c.confirms[0]), c.confirms[0]);
    t('32a: a chegada fica GRAVADA no armazenamento local (save foi chamado) e o toast e o diario dizem que era peca "pré-vendida"',
      ehHoje32(gravado32(pv.id).dataChegada, d0) && c.toasts.some(x => /Chegada confirmada/.test(x)) && c.diario.length === 1 && /pré-vendida/.test(c.diario[0]) && !/coleção/.test(c.diario[0]),
      S32([gravado32(pv.id).dataChegada, c.toasts, c.diario]));
    /* peca separada pra COLECAO (Coleção + origemPedido) */
    c = capturas32(); c.confirmar = false;
    M().push(compra32('a2', { data: '2026-08-01', valor: 20, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção', origemPedido: true }));
    antes = foto32();
    A('chegouPeca')('a2');
    t('32a: cancelar tambem nao grava nada na peca de colecao', foto32() === antes && c.toasts.length === 0 && c.diario.length === 0 && c.confirms.length === 1);
    c = capturas32(); c.confirmar = true;
    const d1 = hoje32();
    A('chegouPeca')('a2');
    const a2 = M().find(m => m.id === 'a2');
    t('32a: para peca de COLECAO a pergunta fala em "esta peça" e NAO contem a palavra "venda"', /esta peça/.test(c.confirms[0]) && !/venda/i.test(c.confirms[0]), c.confirms[0]);
    t('32a: a peca de colecao ganha dataChegada = hoje e segue Coleção com origemPedido e o mesmo valor (nao muda de destino)',
      ehHoje32(a2.dataChegada, d1) && A('sitDe')(a2) === 'Coleção' && a2.origemPedido === true && a2.valor === 20, S32(a2));
    t('32a: o diario fala em peca separada pra "coleção" (nao "pré-vendida") e o toast confirma',
      c.diario.length === 1 && /coleção/.test(c.diario[0]) && !/pré-vendida/.test(c.diario[0]) && c.toasts.some(x => /Chegada confirmada/.test(x)), S32([c.diario, c.toasts]));
    /* id que nao existe: nao pergunta nem quebra */
    c = capturas32(); antes = foto32();
    A('chegouPeca')('nao-existe');
    t('32a: id inexistente nao pergunta nada, nao muda nada e nao quebra', c.confirms.length === 0 && foto32() === antes && c.toasts.length === 0);
  });

  /* ---------- 32b: chegouPedido (a peca do Pedido entra no estoque disponivel) ---------- */
  await bloco32('b', async () => {
    setg('tela', 'estoque');
    let c = capturas32();
    M().push(compra32('b1', { data: '2026-09-01', qtd: 2, valor: 50, situacao: 'Pedido', origemPedido: true }));
    t('32b: [antes] o Pedido conta em motor().pedido e ainda nao no estoque disponivel', A('motor')().pedido === 50 && A('motor')().estoque === 0);
    let antes = foto32(); c.confirmar = false;
    A('chegouPedido')('b1');
    t('32b: cancelar o confirm nao muda nada (continua Pedido, com origemPedido, sem dataChegada)', foto32() === antes && c.toasts.length === 0 && c.diario.length === 0 && /pedido chegou/.test(c.confirms[0]), S32(c.confirms));
    c = capturas32(); c.confirmar = true;
    const d0 = hoje32();
    A('chegouPedido')('b1');
    const b1 = M().find(m => m.id === 'b1');
    t('32b: confirmar vira Em estoque, destino Vender, dataChegada = hoje', A('sitDe')(b1) === 'Em estoque' && b1.destino === 'Vender' && ehHoje32(b1.dataChegada, d0), S32(b1));
    t('32b: e o origemPedido some, mesmo a peca tendo vindo com origemPedido:true "de sobra" (o campo nao pode sobreviver a esta confirmacao)',
      !('origemPedido' in b1), S32(b1));
    t('32b: valor e quantidade nao mudam; o estoque disponivel de hoje passa a incluir o valor e o Pedido zera',
      b1.valor === 50 && b1.qtd === 2 && A('motor')().estoque === 50 && A('motor')().pedido === 0, S32([b1.valor, b1.qtd, A('motor')().estoque, A('motor')().pedido]));
    t('32b: fica gravado no armazenamento local e o toast/diario dizem que chegou',
      ehHoje32(gravado32('b1').dataChegada, d0) && !('origemPedido' in gravado32('b1')) && c.toasts.some(x => /Chegou/.test(x)) && /chegado/.test(c.diario[0]), S32([gravado32('b1'), c.toasts, c.diario]));
    /* Pedido sem origemPedido (o caso normal) tambem chega sem quebrar */
    reset(); c = capturas32();
    M().push(compra32('b2', { data: '2026-09-01', valor: 8, situacao: 'Pedido' }));
    A('chegouPedido')('b2');
    const b2 = M().find(m => m.id === 'b2');
    t('32b: Pedido comum (sem origemPedido) tambem chega: Em estoque e dataChegada = hoje', A('sitDe')(b2) === 'Em estoque' && ehHoje32(b2.dataChegada, d0) && !('origemPedido' in b2), S32(b2));
  });

  /* ---------- 32c: separarParaColecao (separar parte de um pedido, antes de chegar, pra colecao) ---------- */
  await bloco32('c', async () => {
    setg('tela', 'estoque');
    let c = capturas32();
    M().push(compra32('c1', { data: '2026-09-01', qtd: 5, valor: 100.03, situacao: 'Pedido' }));
    const inicio = foto32();
    /* entradas invalidas: nada muda, avisa "Quantidade inválida." */
    ['0', '-3', 'abc', '', '0.4'].forEach(ent => {
      c = capturas32(); c.resposta = ent;
      A('separarParaColecao')('c1');
      t('32c: entrada invalida ' + JSON.stringify(ent) + ' nao muda nada e avisa "Quantidade inválida."',
        foto32() === inicio && S32(c.alertas) === S32(['Quantidade inválida.']) && c.toasts.length === 0 && c.diario.length === 0, S32([c.alertas, c.toasts]));
    });
    /* cancelar (prompt devolve null) */
    c = capturas32(); c.resposta = null;
    A('separarParaColecao')('c1');
    t('32c: cancelar o prompt (null) nao muda nada e nao avisa nada', foto32() === inicio && c.alertas.length === 0 && c.toasts.length === 0);
    t('32c: a pergunta mostra quantas unidades o pedido tem ("de 5") e sugere 1', /de 5/.test(c.perguntas[0][0]) && c.perguntas[0][1] === '1', S32(c.perguntas));
    /* 2 de 5: fraciona */
    c = capturas32(); c.resposta = '2';
    A('separarParaColecao')('c1');
    const pai = M().find(m => m.id === 'c1'), fil = M().find(m => m.loteOrigem === 'c1');
    t('32c: "2" de 5 cria UM registro novo (o filho) e mantem o pai', M().length === 2 && !!fil, S32(M().map(m => m.id)));
    t('32c: o pai fica com 3 un., continua Pedido e SEM origemPedido (o resto do pedido nao "chegou" nem virou colecao)',
      pai.qtd === 3 && A('sitDe')(pai) === 'Pedido' && !('origemPedido' in pai), S32(pai));
    t('32c: o filho tem 2 un., situacao Coleção, destino Coleção, origemPedido:true e aponta pro pai (loteOrigem)',
      fil.qtd === 2 && A('sitDe')(fil) === 'Coleção' && fil.destino === 'Coleção' && fil.origemPedido === true && fil.loteOrigem === 'c1', S32(fil));
    t('32c: o filho nasce com destIni "Coleção" (nunca foi estoque de revenda; sem isto, vendido depois, viraria fantasma na curva de estoque)',
      fil.destIni === 'Coleção', 'destIni=' + fil.destIni);
    t('32c: conservacao exata — valor do pai + valor do filho = valor original (centavo por centavo)',
      Math.round((pai.valor + fil.valor) * 100) === Math.round(100.03 * 100), S32([pai.valor, fil.valor]));
    t('32c: o filho sai da expectativa de estoque: Pedido so com o pai, Coleção so com o filho, estoque zerado',
      A('motor')().pedido === pai.valor && A('motor')().colCusto === fil.valor && A('motor')().estoque === 0, S32(A('motor')()).slice(0, 200));
    t('32c: fica gravado, o toast diz que foi separado e o diario registra que separou pra "coleção"',
      gravado32(fil.id).origemPedido === true && c.toasts.some(x => /^Separado pra coleção/.test(x)) && /coleção/.test(c.diario[0]), S32([c.toasts, c.diario]));
    /* 99 de 3: limita ao disponivel e o PROPRIO registro muda no lugar */
    reset(); c = capturas32(); c.resposta = '99';
    M().push(compra32('c2', { data: '2026-09-01', qtd: 3, valor: 45, situacao: 'Pedido' }));
    A('separarParaColecao')('c2');
    const c2 = M().find(m => m.id === 'c2');
    t('32c: "99" de 3 limita a 3 e o PROPRIO registro vira Coleção no lugar — mesmo id, nenhum registro novo',
      M().length === 1 && A('sitDe')(c2) === 'Coleção' && c2.destino === 'Coleção' && c2.qtd === 3 && c2.valor === 45, S32(M()));
    t('32c: o registro que virou Coleção no lugar leva origemPedido:true e destIni "Coleção" (o G3: baixarLote grava "Em estoque" e isso tem de ser corrigido tambem neste caminho)',
      c2.origemPedido === true && c2.destIni === 'Coleção', S32(c2));
  });

  /* ---------- 32d: pedidosAgrupados (a lista "Pedidos a caminho": remanescente, pre-venda, coleção) ---------- */
  await bloco32('d', async () => {
    setg('tela', 'estoque');
    const c = capturas32();
    const gruposDe = () => A('pedidosAgrupados')();
    const resumo = () => S32(gruposDe().map(x => ({ raiz: x.raiz && x.raiz.id, rem: x.remanescentes.map(m => m.id), pecas: x.pecas.map(p => [p.peca.id, p.venda ? p.venda.contraparte : null]), col: x.colecao.map(m => m.id) })));
    /* (a) um Pedido */
    M().push(compra32('d1', { qtd: 2, valor: 20, situacao: 'Pedido' }));
    let gs = gruposDe();
    t('32d: um Pedido solto vira 1 grupo com 1 remanescente (a raiz e ele mesmo), sem peca vendida e sem peca de colecao',
      gs.length === 1 && gs[0].raiz.id === 'd1' && gs[0].remanescentes.length === 1 && gs[0].pecas.length === 0 && gs[0].colecao.length === 0, resumo());
    /* (b) pre-venda */
    reset();
    M().push(compra32('d2', { qtd: 2, valor: 20, situacao: 'Pedido' }));
    const pv = preVenda32('d2', 1, 'Fulano');
    gs = gruposDe();
    t('32d: pre-venda de 1 de 2 — o grupo tem o pai em remanescentes e o filho em pecas, com o comprador da venda ("Fulano")',
      gs.length === 1 && gs[0].remanescentes.length === 1 && gs[0].remanescentes[0].id === 'd2' && gs[0].pecas.length === 1 && gs[0].pecas[0].peca.id === pv.peca.id && gs[0].pecas[0].venda.contraparte === 'Fulano', resumo());
    A('chegouPeca')(pv.peca.id);
    gs = gruposDe();
    t('32d: depois de chegouPeca do filho vendido ele SAI da lista de pecas, e o remanescente continua la',
      gs.length === 1 && gs[0].pecas.length === 0 && gs[0].remanescentes.length === 1, resumo());
    /* (c) G1 — pedido INTEIRO separado pra colecao */
    reset();
    M().push(compra32('d3', { qtd: 3, valor: 45, situacao: 'Pedido' }));
    c.resposta = '3'; A('separarParaColecao')('d3');
    gs = gruposDe();
    t('32d: [G1] separar o pedido INTEIRO pra colecao: o grupo NAO some — 0 remanescentes e a peca aparece em colecao',
      gs.length === 1 && gs[0].remanescentes.length === 0 && gs[0].colecao.length === 1 && gs[0].colecao[0].id === 'd3' && gs[0].pecas.length === 0, resumo());
    /* (d) G2 — pedido de 2: pre-venda de 1 + o resto pra colecao; confirmar a chegada do vendido NAO derruba a peca de colecao */
    reset();
    M().push(compra32('d4', { qtd: 2, valor: 20, situacao: 'Pedido' }));
    const pv4 = preVenda32('d4', 1, 'Beltrano');
    c.resposta = '1'; A('separarParaColecao')('d4');   /* o resto (1 un.) e' o proprio d4: vira Coleção no lugar */
    gs = gruposDe();
    t('32d: [G2] antes de confirmar: o grupo lista a peca vendida (pecas) E a de colecao (colecao), sem remanescentes',
      gs.length === 1 && gs[0].remanescentes.length === 0 && gs[0].pecas.length === 1 && gs[0].colecao.length === 1 && gs[0].colecao[0].id === 'd4', resumo());
    A('chegouPeca')(pv4.peca.id);
    gs = gruposDe();
    t('32d: [G2] confirmar a chegada do filho vendido: a peca de colecao CONTINUA em colecao (ela ainda nao chegou) — antes da correcao sumia junto',
      gs.length === 1 && gs[0].pecas.length === 0 && gs[0].colecao.length === 1 && gs[0].colecao[0].id === 'd4', resumo());
    /* (e) M2 — dois 'Pedido' na mesma raiz */
    reset();
    M().push(compra32('d5', { qtd: 4, valor: 40, situacao: 'Pedido' }));
    A('baixarLote')('d5', 2, 'Pedido');   /* fracionamento normal: um segundo registro 'Pedido' com loteOrigem = d5 */
    gs = gruposDe();
    t('32d: [M2] dois registros Pedido na mesma raiz ficam num grupo so, com remanescentes.length === 2 (e nao um sobrescrevendo o outro)',
      M().length === 2 && gs.length === 1 && gs[0].raiz.id === 'd5' && gs[0].remanescentes.length === 2, resumo());
    /* raizes diferentes = grupos diferentes */
    M().push(compra32('d5b', { qtd: 1, valor: 9, situacao: 'Pedido' }));
    t('32d: pedidos de raizes diferentes formam grupos diferentes', gruposDe().length === 2, resumo());
    /* (f) M3 — vinculo quebrado */
    reset();
    M().push(compra32('d6', { valor: 12, situacao: 'Vendido', dataSaida: '2026-02-10' }));
    gs = gruposDe();
    t('32d: [M3] compra Vendido SEM dataChegada e SEM nenhuma venda achavel aparece em pecas, com venda vazia (lado seguro: tratada como pre-venda ainda nao confirmada)',
      gs.length === 1 && gs[0].pecas.length === 1 && gs[0].pecas[0].peca.id === 'd6' && gs[0].pecas[0].venda == null, resumo());
    M().find(m => m.id === 'd6').vendaRef = 'nao-existe';
    gs = gruposDe();
    t('32d: [M3] o mesmo com vendaRef apontando pra uma venda que nao existe mais (vinculo quebrado por sync/exclusao)',
      gs.length === 1 && gs[0].pecas.length === 1 && gs[0].pecas[0].venda == null, resumo());
    M().find(m => m.id === 'd6').dataChegada = '2026-02-05';
    t('32d: [M3] com dataChegada preenchida a mesma compra NAO aparece mais (ja chegou)', gruposDe().length === 0, resumo());
    /* venda NORMAL (nao de pedido) sem dataChegada nao e "aguardando chegada" */
    reset();
    M().push(compra32('d7', { valor: 30, qtd: 3, situacao: 'Em estoque' }));
    const normal = A('baixarLote')('d7', 1, 'Vendido', { dataVenda: '2026-02-10', dataSaida: '2026-02-10' });
    M().push({ id: 'd7v', tipo: 'VENDA', data: '2026-02-10', valor: 20, origemId: 'd7', vendaDe: 'estoque', contraparte: 'Cli', qtd: 1 });
    normal.vendaRef = 'd7v';
    t('32d: venda NORMAL (de estoque) sem dataChegada nao aparece como "aguardando chegada"', gruposDe().length === 0, resumo());
    /* (g) coleção SEM origemPedido (veio de CONSUMO) nunca aparece */
    reset();
    M().push(compra32('d8', { valor: 30, qtd: 3, situacao: 'Em estoque' }));
    const consumo = A('baixarLote')('d8', 1, 'Coleção', { dataSaida: '2026-03-05' });
    t('32d: peca de Coleção SEM origemPedido (veio do estoque por CONSUMO) nunca aparece em Pedidos a caminho',
      A('sitDe')(consumo) === 'Coleção' && !('origemPedido' in consumo) && gruposDe().length === 0, resumo());
    /* (h) coleção com origemPedido mas ja com dataChegada */
    reset();
    M().push(compra32('d9', { valor: 20, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção', origemPedido: true }));
    t('32d: peca de Coleção com origemPedido e SEM dataChegada aparece em colecao', gruposDe().length === 1 && gruposDe()[0].colecao.length === 1, resumo());
    M().find(m => m.id === 'd9').dataChegada = '2026-09-10';
    t('32d: com origemPedido mas JA com dataChegada ela NAO aparece mais', gruposDe().length === 0, resumo());
    /* a venda de uma peca e achada pelo VINCULO (origemId / vendaRef), nunca pela primeira VENDA que aparecer no array */
    reset();
    M().push({ id: 'vx0', tipo: 'VENDA', data: '2026-01-02', valor: 5, origemId: 'zzz', vendaDe: 'estoque', contraparte: 'Outro', qtd: 1 });   /* venda alheia, ANTES no array */
    M().push(compra32('d12', { qtd: 2, valor: 20, situacao: 'Pedido' }));
    preVenda32('d12', 1, 'Fulano');
    gs = gruposDe();
    t('32d: com uma VENDA alheia antes no array a pre-venda continua ligada a SUA venda: fica em pecas com o comprador "Fulano" (nunca herda a primeira VENDA que aparece)',
      gs.length === 1 && gs[0].pecas.length === 1 && !!gs[0].pecas[0].venda && gs[0].pecas[0].venda.contraparte === 'Fulano', resumo());
    /* separar so PARTE do pedido: o filho de colecao fica no grupo do pai (mesma raiz), nao num grupo a parte */
    reset();
    M().push(compra32('d13', { qtd: 5, valor: 50, situacao: 'Pedido' }));
    c.resposta = '2'; A('separarParaColecao')('d13');
    gs = gruposDe();
    t('32d: separar 2 de 5 pra colecao: o filho de colecao entra no MESMO grupo do pai (mesma raiz), 1 grupo so — remanescente d13 e colecao com loteOrigem d13',
      gs.length === 1 && gs[0].raiz.id === 'd13' && gs[0].remanescentes.length === 1 && gs[0].colecao.length === 1 && gs[0].colecao[0].loteOrigem === 'd13', resumo());
    /* [ponta a ponta] o SINAL da pre-venda nasce em salvar(): vender pelo FORMULARIO um item que esta Pedido grava vendaDe:'pedido' na venda e o
       vendaRef no pedaco. Os fixtures acima montam esse sinal na mao; se salvar() deixar de grava-lo a lista e as curvas morrem caladas — so este
       teste ve. Depois segue o caminho do usuario: aparece na lista com o comprador, "chegou" tira da lista e a curva registra o dia. */
    reset(); c.confirms.length = 0; c.confirmar = true;
    M().push(compra32('d10', { data: '2026-08-01', qtd: 2, valor: 20, situacao: 'Pedido' }));
    setg('tipoSel', 'VENDA'); setg('vendaDe', 'estoque'); setg('vendaUn', 'un'); setg('canal', 'Pix'); setg('editId', null); setg('_preSel', null); setg('pgTipo', 'À vista'); setg('_fotosPend', []);
    setg('_db', null); setg('_syncReady', false); setg('_restaurando', false); setg('excluidos', {}); setg('_baseH', {});
    Object.keys(campos32).forEach(k => delete campos32[k]);
    Object.assign(campos32, { f_val: '50', f_data: '2026-09-02', f_qtd: '1', f_cp: 'Fulano', f_origem: 'd10', f_conta: '' });
    ctx.document.getElementById = elCampo32;
    A('salvar')();
    const vSalva = M().find(m => m.tipo === 'VENDA'), pSalva = M().find(m => m.loteOrigem === 'd10');
    t('32d: [ponta a ponta] vender pelo formulario um item Pedido pergunta (item "PEDIDO") e grava a venda com vendaDe:"pedido", origemId do pai e o comprador',
      !!vSalva && vSalva.vendaDe === 'pedido' && vSalva.origemId === 'd10' && vSalva.contraparte === 'Fulano' && vSalva.qtd === 1 && c.confirms.some(x => /PEDIDO/.test(x)), S32([vSalva, c.confirms.map(x => x.slice(0, 40))]));
    t('32d: [ponta a ponta] e o pedaco vendido nasce Vendido, com vendaRef apontando pra venda, dataSaida e SEM dataChegada',
      !!pSalva && A('sitDe')(pSalva) === 'Vendido' && pSalva.vendaRef === (vSalva || {}).id && pSalva.dataSaida === '2026-09-02' && !pSalva.dataChegada, S32(pSalva));
    gs = gruposDe();
    t('32d: [ponta a ponta] a lista de Pedidos a caminho mostra o pai como remanescente e o pedaco vendido com o nome do comprador ("Fulano")',
      gs.length === 1 && gs[0].remanescentes.length === 1 && gs[0].remanescentes[0].id === 'd10' && gs[0].pecas.length === 1 && !!pSalva && gs[0].pecas[0].peca.id === pSalva.id && gs[0].pecas[0].venda && gs[0].pecas[0].venda.contraparte === 'Fulano', resumo());
    const sVenda = A('serieEstoque')();
    t('32d: [ponta a ponta] e a curva de estoque trata a venda como pre-venda NAO confirmada (nada entra, nada vira semData)', sVenda.length === 0 && sVenda.semData === 0, S32([sVenda, sVenda.semData]));
    const dHoje = hoje32();
    A('chegouPeca')(pSalva.id);
    const sChegou = A('serieEstoque')();
    t('32d: [ponta a ponta] confirmar a chegada tira a peca da lista e a curva registra entrada e saida no dia da chegada (ponto de hoje, total 0)',
      gruposDe()[0].pecas.length === 0 && sChegou.length === 1 && ehHoje32(sChegou[0].data, dHoje) && sChegou[0].total === 0, S32([resumo(), sChegou]));
  });

  /* ---------- 32e: serieEstoque (curva cumulativa do estoque a custo) ---------- */
  await bloco32('e', async () => {
    const s0 = A('serieEstoque')();
    t('32e: sem lancamentos a curva e um array vazio, com semData e semDataValor zerados',
      Array.isArray(s0) && s0.length === 0 && s0.semData === 0 && s0.semDataValor === 0, S32([s0.length, s0.semData, s0.semDataValor]));
    /* cenario misto: Em estoque, Pedido, Coleção, Vendido normal, pre-venda nao confirmada, pre-venda confirmada */
    M().push(compra32('e1', { data: '2026-01-10', valor: 100 }));
    M().push(compra32('e2', { data: '2026-01-20', dataChegada: '2026-02-05', valor: 50 }));
    M().push(compra32('e3', { data: '2026-01-25', valor: 70, situacao: 'Pedido' }));
    M().push(compra32('e4', { data: '2026-01-15', valor: 30, situacao: 'Coleção', destino: 'Coleção' }));
    M().push(compra32('e5', { data: '2026-01-12', valor: 40, situacao: 'Vendido', dataSaida: '2026-03-01' }));
    M().push({ id: 'e5v', tipo: 'VENDA', data: '2026-03-01', valor: 80, origemId: 'e5', vendaDe: 'estoque', contraparte: 'Cli', qtd: 1 });
    M().push(compra32('e6', { data: '2026-03-15', valor: 60, qtd: 2, situacao: 'Pedido' }));
    preVenda32('e6', 1, 'Fulano', { dataSaida: '2026-03-20', dataVenda: '2026-03-20' });               /* pre-venda NAO confirmada */
    M().push(compra32('e7', { data: '2026-03-16', valor: 60, qtd: 2, situacao: 'Pedido' }));
    const pv2 = preVenda32('e7', 1, 'Beltrano', { dataSaida: '2026-03-25', dataVenda: '2026-03-25' });
    pv2.peca.dataChegada = '2026-04-02';                                                                /* pre-venda CONFIRMADA em 02/04 */
    const sm = A('serieEstoque')();
    t('32e: cenario misto — a curva inteira: entradas na data de chegada (ou da compra), baixa normal sai em dataSaida, Pedido/Coleção/pre-venda nao confirmada ficam de fora',
      S32(sm) === S32([{ data: '2026-01-10', total: 100 }, { data: '2026-01-12', total: 140 }, { data: '2026-02-05', total: 190 }, { data: '2026-03-01', total: 150 }, { data: '2026-04-02', total: 150 }]), S32(sm));
    t('32e: o ponto final da curva e IGUAL a motor().estoque (a curva termina no numero do card "Estoque disponivel hoje")',
      Math.abs(ultimo32(sm) - A('motor')().estoque) < 0.005, S32([ultimo32(sm), A('motor')().estoque]));
    t('32e: pre-venda NAO confirmada nao entra: nenhum ponto na data da compra (15/03) nem na da venda (20/03) dela',
      !pt32(sm, '2026-03-15') && !pt32(sm, '2026-03-20'), S32(sm.map(p => p.data)));
    t('32e: pre-venda CONFIRMADA gera entrada e saida no MESMO dia da chegada (02/04): existe o ponto, o total la nao muda (150 = 150) e NADA aparece na data da venda (25/03)',
      !!pt32(sm, '2026-04-02') && pt32(sm, '2026-04-02').total === pt32(sm, '2026-03-01').total && !pt32(sm, '2026-03-25'), S32(sm));
    t('32e: nada disso gera aviso — semData e semDataValor zerados', sm.semData === 0 && sm.semDataValor === 0);
    /* baixa normal: Vendido / Trocado / Aberto entram em dataChegada||data e saem em dataSaida */
    ['Vendido', 'Trocado', 'Aberto'].forEach(sit => {
      const monta = extra => {
        reset();
        M().push(compra32('eb', Object.assign({ data: '2026-01-12', valor: 40, situacao: sit }, extra)));
        if (sit === 'Vendido') M().push({ id: 'ebv', tipo: 'VENDA', data: '2026-03-01', valor: 80, origemId: 'eb', vendaDe: 'estoque', contraparte: 'Cli', qtd: 1 });
        return A('serieEstoque')();
      };
      let s = monta({ dataSaida: '2026-03-01' });
      t('32e: ' + sit + ' com dataSaida entra na data da compra (12/01) e sai em dataSaida (01/03)',
        S32(s) === S32([{ data: '2026-01-12', total: 40 }, { data: '2026-03-01', total: 0 }]) && s.semData === 0, S32(s));
      s = monta({ dataSaida: '2026-03-01', dataChegada: '2026-01-20' });
      t('32e: ' + sit + ' com dataChegada entra na dataChegada (20/01), nao na data da compra',
        S32(s) === S32([{ data: '2026-01-20', total: 40 }, { data: '2026-03-01', total: 0 }]), S32(s));
      s = monta({});
      t('32e: ' + sit + ' SEM dataSaida fica fora da curva (nem entrada nem saida) e conta em semData/semDataValor',
        s.length === 0 && s.semData === 1 && s.semDataValor === 40, S32([s, s.semData, s.semDataValor]));
      /* clamp cronologico: data DEPOIS da saida nunca da total negativo */
      s = monta({ data: '2026-05-10', dataSaida: '2026-05-01' });
      t('32e: ' + sit + ' com a data da compra DEPOIS da dataSaida: a entrada e puxada pra dataSaida e o total nunca fica negativo',
        S32(s) === S32([{ data: '2026-05-01', total: 0 }]) && s.every(p => p.total >= 0), S32(s));
      s = monta({ data: '2026-01-01', dataChegada: '2026-05-12', dataSaida: '2026-05-01' });
      t('32e: ' + sit + ' com a dataChegada DEPOIS da dataSaida: mesmo clamp (a saida nunca desenha antes da entrada)',
        S32(s) === S32([{ data: '2026-05-01', total: 0 }]) && s.every(p => p.total >= 0), S32(s));
    });
    /* nasceu pra colecao e foi vendido/trocado: nunca foi estoque de revenda */
    ['Vendido', 'Trocado', 'Aberto'].forEach(sit => {
      reset();
      M().push(compra32('ec', { data: '2026-01-12', valor: 40, situacao: sit, destIni: 'Coleção', dataSaida: '2026-03-01' }));
      if (sit === 'Vendido') M().push({ id: 'ecv', tipo: 'VENDA', data: '2026-03-01', valor: 80, origemId: 'ec', vendaDe: 'colecao', contraparte: 'Cli', qtd: 1 });
      let s = A('serieEstoque')();
      t('32e: ' + sit + ' com destIni "Coleção" (nasceu pra colecao) e IGNORADO pela curva de estoque', s.length === 0 && s.semData === 0, S32([s, s.semData]));
      M().find(m => m.id === 'ec').dataSaida = undefined;
      s = A('serieEstoque')();
      t('32e: ' + sit + ' com destIni "Coleção" e SEM dataSaida tambem nao vira aviso de semData (ignorado antes de contar)', s.length === 0 && s.semData === 0, S32([s, s.semData]));
    });
    /* espelho: a curva e a lista "Pedidos a caminho" usam o MESMO sinal de "ainda nao chegou" */
    const espelho = (rot, monta, listadoEsperado, serieEsperada) => {
      reset(); monta();
      const listado = A('pedidosAgrupados')().some(x => x.pecas.length > 0);
      const s = A('serieEstoque')();
      const fora = s.length === 0 && s.semData === 0;
      t('32e: [espelho] ' + rot + ' — a lista diz "' + (listado ? 'aguardando chegada' : 'ja chegou / venda normal') + '" e a curva concorda (' + (fora ? 'fora' : 'dentro') + ')',
        listado === listadoEsperado && fora === listadoEsperado && (!serieEsperada || S32(s) === S32(serieEsperada)), S32([listado, fora, s]));
    };
    const dentro = [{ data: '2026-02-01', total: 10 }, { data: '2026-02-10', total: 0 }];
    espelho('pre-venda nao confirmada', () => { M().push(compra32('m1', { qtd: 2, valor: 20, situacao: 'Pedido' })); preVenda32('m1', 1, 'F', { dataSaida: '2026-02-10', dataVenda: '2026-02-10' }); }, true);
    espelho('vinculo quebrado SEM dataChegada', () => { M().push(compra32('m2', { data: '2026-02-01', valor: 10, situacao: 'Vendido', dataSaida: '2026-02-10', vendaRef: 'nao-existe' })); }, true);
    espelho('vinculo quebrado COM dataChegada', () => { M().push(compra32('m3', { data: '2026-02-01', valor: 10, situacao: 'Vendido', dataSaida: '2026-02-10', vendaRef: 'nao-existe', dataChegada: '2026-02-01' })); }, false, dentro);
    espelho('venda normal sem dataChegada', () => { M().push(compra32('m4', { data: '2026-02-01', valor: 10, situacao: 'Vendido', dataSaida: '2026-02-10' })); M().push({ id: 'm4v', tipo: 'VENDA', data: '2026-02-10', valor: 20, origemId: 'm4', vendaDe: 'estoque', contraparte: 'C', qtd: 1 }); }, false, dentro);
  });

  /* ---------- 32f: serieColecao (curva cumulativa do custo em colecao) ---------- */
  await bloco32('f', async () => {
    setg('tela', 'estoque');
    const c = capturas32();
    const s0 = A('serieColecao')();
    t('32f: sem lancamentos a curva e um array vazio com semData, semDataValor, semChegada e semChegadaValor zerados',
      Array.isArray(s0) && s0.length === 0 && s0.semData === 0 && s0.semDataValor === 0 && s0.semChegada === 0 && s0.semChegadaValor === 0);
    /* cenario SEM peca pendente: coleção direta, CONSUMO, saiu da colecao, separada de pedido e ja confirmada */
    M().push(compra32('k1', { data: '2026-02-01', valor: 25, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção' }));
    M().push(compra32('k2', { data: '2026-01-10', dataChegada: '2026-01-20', valor: 60, qtd: 3, situacao: 'Em estoque' }));
    const k2f = A('baixarLote')('k2', 1, 'Coleção', { dataSaida: '2026-03-05' });               /* CONSUMO: 1 un. do estoque foi pra colecao em 05/03 */
    M().push(compra32('k3', { data: '2026-01-05', valor: 15, situacao: 'Vendido', destIni: 'Coleção', dataSaida: '2026-04-01' }));
    M().push(compra32('k4', { data: '2026-01-25', dataChegada: '2026-02-20', valor: 35, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção', origemPedido: true }));
    const sk = A('serieColecao')();
    t('32f: cenario sem peca pendente — a curva inteira: entrada na data (ou na dataChegada da peca separada de pedido), saida em dataSaida',
      S32(sk) === S32([{ data: '2026-01-05', total: 15 }, { data: '2026-02-01', total: 40 }, { data: '2026-02-20', total: 75 }, { data: '2026-03-05', total: 95 }, { data: '2026-04-01', total: 80 }]), S32(sk));
    t('32f: o ponto final da curva e IGUAL a motor().colCusto (o card "Na coleção")', Math.abs(ultimo32(sk) - A('motor')().colCusto) < 0.005 && A('motor')().colCusto === 80, S32([ultimo32(sk), A('motor')().colCusto]));
    t('32f: sem pendencia nenhuma os quatro contadores ficam zerados', sk.semData === 0 && sk.semChegada === 0 && sk.semChegadaValor === 0 && sk.semDataValor === 0);
    t('32f: peca que veio do estoque por CONSUMO (sem origemPedido) entra na data da MIGRACAO (dataSaida 05/03), NAO na dataChegada antiga (20/01) que herdou do lote',
      k2f.dataChegada === '2026-01-20' && !('origemPedido' in k2f) && !!pt32(sk, '2026-03-05') && pt32(sk, '2026-03-05').total - pt32(sk, '2026-02-20').total === 20 && !pt32(sk, '2026-01-20'), S32([k2f.dataChegada, sk]));
    /* peca separada de pedido e ainda nao confirmada */
    M().push(compra32('k5', { data: '2026-01-26', valor: 12, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção', origemPedido: true }));
    const sp = A('serieColecao')();
    t('32f: Coleção com origemPedido e SEM dataChegada fica FORA da curva e conta em semChegada/semChegadaValor',
      S32(sp) === S32(sk) && sp.semChegada === 1 && sp.semChegadaValor === 12, S32([sp.semChegada, sp.semChegadaValor, sp]));
    t('32f: a divergencia com o card fica VISIVEL e exata: motor().colCusto - fim da curva = semChegadaValor (92 - 80 = 12)',
      Math.abs((A('motor')().colCusto - ultimo32(sp)) - sp.semChegadaValor) < 0.005 && A('motor')().colCusto === 92, S32([A('motor')().colCusto, ultimo32(sp), sp.semChegadaValor]));
    const d0 = hoje32();
    c.confirmar = true; A('chegouPeca')('k5');
    const sc = A('serieColecao')();
    t('32f: depois de chegouPeca a peca entra na curva com data = dataChegada (hoje) e o aviso some — o fim da curva volta a ser motor().colCusto',
      sc.semChegada === 0 && sc.semChegadaValor === 0 && ehHoje32(sc[sc.length - 1].data, d0) && sc[sc.length - 1].total === 92 && Math.abs(ultimo32(sc) - A('motor')().colCusto) < 0.005, S32(sc));
    /* Pedido com destIni "Coleção" residual */
    reset();
    M().push(compra32('k6', { data: '2026-02-01', valor: 9, situacao: 'Pedido', destIni: 'Coleção' }));
    let s = A('serieColecao')();
    t('32f: peca Pedido com destIni "Coleção" residual (mudarSit cicla por Pedido sem limpar) e IGNORADA: nem saida nem semData',
      s.length === 0 && s.semData === 0 && s.semChegada === 0, S32([s, s.semData, s.semChegada]));
    M().find(m => m.id === 'k6').dataSaida = '2026-03-01';
    s = A('serieColecao')();
    t('32f: e ignorada mesmo se tiver dataSaida de uma vida anterior (nao vira entrada+saida fantasma)', s.length === 0 && s.semData === 0, S32(s));
    /* saida da colecao */
    reset();
    M().push(compra32('k7', { data: '2026-01-05', valor: 15, situacao: 'Vendido', destIni: 'Coleção', dataSaida: '2026-04-01' }));
    s = A('serieColecao')();
    t('32f: saida da colecao (destIni "Coleção", hoje Vendido com dataSaida) gera entrada em data (05/01) e saida em dataSaida (01/04)',
      S32(s) === S32([{ data: '2026-01-05', total: 15 }, { data: '2026-04-01', total: 0 }]) && s.semData === 0, S32(s));
    M().find(m => m.id === 'k7').dataSaida = undefined;
    s = A('serieColecao')();
    t('32f: saida da colecao SEM dataSaida fica fora da curva e conta em semData/semDataValor',
      s.length === 0 && s.semData === 1 && s.semDataValor === 15, S32([s, s.semData, s.semDataValor]));
    /* clamp cronologico */
    reset();
    M().push(compra32('k8', { data: '2026-05-10', valor: 40, situacao: 'Vendido', destIni: 'Coleção', dataSaida: '2026-05-01' }));
    s = A('serieColecao')();
    t('32f: data DEPOIS da dataSaida: a entrada e puxada pra dataSaida e o total nunca fica negativo (mesmo clamp do estoque)',
      S32(s) === S32([{ data: '2026-05-01', total: 0 }]) && s.every(p => p.total >= 0), S32(s));
    /* peca separada de pedido que depois SAIU da colecao: dataChegada so vale se nao vier depois da saida */
    reset();
    M().push(compra32('k9', { data: '2026-01-01', dataChegada: '2026-03-10', valor: 30, situacao: 'Vendido', destIni: 'Coleção', origemPedido: true, dataSaida: '2026-04-01' }));
    s = A('serieColecao')();
    t('32f: peca de origemPedido que saiu da colecao entra na dataChegada (10/03) quando ela nao e depois da saida',
      S32(s) === S32([{ data: '2026-03-10', total: 30 }, { data: '2026-04-01', total: 0 }]), S32(s));
    M().find(m => m.id === 'k9').dataChegada = '2026-04-01';
    s = A('serieColecao')();
    t('32f: peca de origemPedido que chegou e saiu no MESMO dia (dataChegada = dataSaida, 01/04): a chegada vale — entra e sai naquele dia (o unico ponto) e nao volta pra data da compra',
      S32(s) === S32([{ data: '2026-04-01', total: 0 }]), S32(s));
    M().find(m => m.id === 'k9').dataChegada = '2026-05-01';
    s = A('serieColecao')();
    t('32f: se a dataChegada vier DEPOIS da saida, prevalece a data da compra (01/01) — nunca uma chegada posterior a propria saida',
      S32(s) === S32([{ data: '2026-01-01', total: 30 }, { data: '2026-04-01', total: 0 }]) && s.every(p => p.total >= 0), S32(s));
  });

  /* ---------- 32g: serieDinheiro (curva cumulativa do caixa, convencao emissao) ---------- */
  await bloco32('g', async () => {
    congela(2026, 1, 2, 10, 0);   /* antes de todas as datas do bloco: as parcelas sao "a vencer" (a regra da parcela vencida sem marca e provada na secao 34) */
    const s0 = A('serieDinheiro')();
    t('32g: sem lancamentos a curva e um array vazio com semPagar e semPagarValor zerados', Array.isArray(s0) && s0.length === 0 && s0.semPagar === 0 && s0.semPagarValor === 0);
    /* regras basicas */
    M().push(compra32('g1', { data: '2026-01-05', valor: 100 }));
    M().push({ id: 'g2', tipo: 'VENDA', data: '2026-01-10', valor: 200, taxa: 10, contraparte: 'Cli', qtd: 1, canal: 'App', recDias: 14 });
    M().push({ id: 'g3', tipo: 'DESPESA', data: '2026-01-12', valor: 30, status: 'pago', natureza: 'ordinaria', cat: 'Frete' });
    M().push({ id: 'g4', tipo: 'DESPESA', data: '2026-01-14', valor: 77, status: 'apagar', natureza: 'ordinaria', cat: 'Frete' });
    M().push({ id: 'g5', tipo: 'DESPESA', data: '2026-01-15', dataPagamento: '2026-01-20', valor: 20, status: 'pago', natureza: 'ordinaria', cat: 'Frete' });
    M().push(compra32('g6', { data: '2026-01-20', valor: 500, origem: 'TROCA' }));
    let s = A('serieDinheiro')();
    t('32g: compra a vista sai na propria data (-100 em 05/01), venda entra LIQUIDA da taxa na data (+180 em 10/01), despesa so se paga (na dataPagamento quando houver), despesa "a pagar" e compra de TROCA ficam de fora',
      S32(s) === S32([{ data: '2026-01-05', total: -100 }, { data: '2026-01-10', total: 80 }, { data: '2026-01-12', total: 50 }, { data: '2026-01-20', total: 30 }]) && s.semPagar === 0, S32(s));
    /* compra parcelada SOLO */
    reset();
    M().push(compra32('gs', { data: '2026-01-05', valor: 300, qtd: 3, pgTipo: 'Parcelado', nParc: 3, venc1: '2026-02-05' }));
    s = A('serieDinheiro')();
    t('32g: compra parcelada SOLO sem pagamentos nao entra na curva e conta semPagar === nParc (3) e semPagarValor === valor (300)',
      s.length === 0 && s.semPagar === 3 && s.semPagarValor === 300, S32([s, s.semPagar, s.semPagarValor]));
    M().find(m => m.id === 'gs').pgParcelas = { 1: { d: '2026-02-01', v: 100 } };
    s = A('serieDinheiro')();
    t('32g: com a parcela 1 paga ({d:"2026-02-01", v:100}) sai 100 em 01/02 e semPagar cai pra 2 (200)',
      S32(s) === S32([{ data: '2026-02-01', total: -100 }]) && s.semPagar === 2 && s.semPagarValor === 200, S32([s, s.semPagar, s.semPagarValor]));
    M().find(m => m.id === 'gs').pgParcelas = { 1: '2026-02-01' };
    s = A('serieDinheiro')();
    t('32g: formato LEGADO da parcela paga (so a data, string) tambem conta, pelo valor da parcela (300/3 = 100)',
      S32(s) === S32([{ data: '2026-02-01', total: -100 }]) && s.semPagar === 2, S32([s, s.semPagar]));
    /* pedacos fracionados: o pagamento e da COMPRA (19/09/2026, decisao de desenho v3) — um plano so, e as marcas ficam no dono */
    reset();
    M().push(compra32('gp', { data: '2026-01-05', valor: 300, qtd: 3, pgTipo: 'Parcelado', nParc: 3, venc1: '2026-02-05' }));
    const gpf = A('baixarLote')('gp', 1, 'Coleção', { dataSaida: '2026-03-01' });      /* pai 200 (2 un.), filho 100 (1 un.) */
    const gpp = M().find(m => m.id === 'gp');
    s = A('serieDinheiro')();
    t('32g: o pedaco nasce SEM pgParcelas (o pagamento e da compra, nao do pedaco) e a compra dividida em 2 pedacos tem UM plano so: 3 parcelas de 300/3 = 100 (nao 4 parcelas de pedacos), semPagar 3 e R$ 300',
      gpf.id !== 'gp' && gpf.pgParcelas === undefined && s.semPagar === 3 && s.semPagarValor === 300 && s.length === 0, S32([gpf.pgParcelas, s.semPagar, s.semPagarValor]));
    gpp.pgParcelas = { 1: { d: '2026-02-01', v: 100 } };
    s = A('serieDinheiro')();
    t('32g: a marca fica inteira no dono da compra: a parcela 1 paga (100) sai UMA vez na curva (-100 em 01/02) e restam 2 parcelas (R$ 200)',
      S32(s) === S32([{ data: '2026-02-01', total: -100 }]) && s.semPagar === 2 && s.semPagarValor === 200, S32([s, s.semPagar, s.semPagarValor]));
    /* dado ANTIGO: a mesma marca copiada nos dois pedacos (o fracionamento compartilhava o objeto e, depois de recarregar, viravam dois objetos iguais) */
    gpf.pgParcelas = { 1: { d: '2026-02-01', v: 100 } };
    s = A('serieDinheiro')();
    t('32g: marca DUPLICADA nos dois pedacos (dado antigo, depois de recarregar o app) conta UMA vez: -100 em 01/02, nao -200 (a mesma parcela em varios pedacos e o MESMO pagamento)',
      S32(s) === S32([{ data: '2026-02-01', total: -100 }]) && s.semPagar === 2, S32([s, s.semPagar]));
    gpf.pgParcelas = { 1: { d: '2026-02-01', v: 60 } };
    s = A('serieDinheiro')();
    t('32g: marcas DIFERENTES da mesma parcela em dois pedacos (aparelho antigo + novo, merge por registro): vale a de maior valor (100), nunca a soma (160) nem a menor',
      S32(s) === S32([{ data: '2026-02-01', total: -100 }]), S32(s));
    /* MESMA sessao: pagamento registrado ANTES do fracionamento — o pedaco nasce sem marca e o dono guarda a inteira */
    reset();
    M().push(compra32('gq', { data: '2026-01-05', valor: 300, qtd: 3, pgTipo: 'Parcelado', nParc: 3, venc1: '2026-02-05' }));
    const gqp = M().find(m => m.id === 'gq');
    gqp.pgParcelas = { 1: { d: '2026-02-01', v: 100 } };
    const gqf = A('baixarLote')('gq', 1, 'Coleção', { dataSaida: '2026-03-01' });
    s = A('serieDinheiro')();
    t('32g: pagamento registrado ANTES do fracionamento fica inteiro no dono (o pedaco nasce sem pgParcelas; nenhum objeto compartilhado): -100 em 01/02, o total pago se conserva e a compra segue com 2 parcelas abertas (R$ 200)',
      gqf.pgParcelas === undefined && gqp.pgParcelas[1].v === 100 && S32(s) === S32([{ data: '2026-02-01', total: -100 }]) && s.semPagar === 2 && s.semPagarValor === 200,
      S32([gqp.pgParcelas, gqf.pgParcelas, s, s.semPagar, s.semPagarValor]));
    setg('movs', JSON.parse(JSON.stringify(M())));
    const s2 = A('serieDinheiro')();
    t('32g: e depois de RECARREGAR o app (JSON.parse) a curva e o aviso sao os mesmos — o pagamento contado em dobro depois de recarregar (G-1) nao existe mais',
      S32(s2) === S32(s) && s2.semPagar === 2 && s2.semPagarValor === 200, S32([s2, s2.semPagar, s2.semPagarValor]));
    /* a chave de dedupe e POR COMPRA: duas parceladas solo diferentes, sem nenhum pagamento, nunca se confundem */
    reset();
    M().push(compra32('gx1', { data: '2026-01-05', valor: 300, qtd: 3, pgTipo: 'Parcelado', nParc: 3 }));
    M().push(compra32('gx2', { data: '2026-01-06', valor: 120, pgTipo: 'Parcelado', nParc: 2 }));
    s = A('serieDinheiro')();
    t('32g: duas compras parceladas SOLO diferentes, sem pagamento algum, contam separadas: semPagar 3 + 2 = 5 e R$ 420 (a chave de dedupe e por compra, nao uma so pra todas)',
      s.semPagar === 5 && s.semPagarValor === 420, S32([s.semPagar, s.semPagarValor]));
    M().find(m => m.id === 'gx1').pgParcelas = { 1: { d: '2026-02-01', v: 100 } };
    s = A('serieDinheiro')();
    t('32g: e uma parcela paga numa delas nao apaga o cronograma da outra: -100 em 01/02, restam 2 + 2 parcelas (R$ 320)',
      S32(s) === S32([{ data: '2026-02-01', total: -100 }]) && s.semPagar === 4 && s.semPagarValor === 320, S32([s, s.semPagar, s.semPagarValor]));
    /* pgTipo e nParc tem de concordar pra ser parcelado (o a-pagar exige os dois) */
    reset();
    M().push(compra32('gy1', { data: '2026-01-05', valor: 60, pgTipo: 'Parcelado', nParc: 0 }));
    M().push(compra32('gy2', { data: '2026-01-06', valor: 40, pgTipo: 'À vista', nParc: 3 }));
    s = A('serieDinheiro')();
    t('32g: "Parcelado" com 0 parcelas e "À vista" com nParc sobrando contam como compra A VISTA na data (-60 e -40) — a mesma leitura do a-pagar, que exige os dois campos',
      S32(s) === S32([{ data: '2026-01-05', total: -60 }, { data: '2026-01-06', total: -100 }]) && s.semPagar === 0 && A('aPagar')(true).concat(A('aPagar')()).length === 0, S32([s, s.semPagar]));
    /* NOTA: 3 itens, mesmo notaId, todos Parcelado nParc 3, valores 300/200/100 */
    const notaFix = () => { reset(); [300, 200, 100].forEach((v, i) => M().push(compra32('n' + (i + 1), { data: '2026-08-01', valor: v, notaId: 'N1', notaNum: '1', pgTipo: 'Parcelado', nParc: 3, venc1: '2026-08-01' }))); };
    notaFix();
    s = A('serieDinheiro')();
    t('32g: NOTA parcelada = UM cronograma pela cabeca: parcela = 600/3 = 200, semPagar === 3 (nao 9) e semPagarValor === 600 (nao 1800)',
      s.length === 0 && s.semPagar === 3 && s.semPagarValor === 600, S32([s, s.semPagar, s.semPagarValor]));
    M()[0].pgParcelas = { 1: { d: '2026-08-05', v: 200 } };      /* pgParcelas so na cabeca (o primeiro item), como o app grava */
    s = A('serieDinheiro')();
    t('32g: NOTA com a parcela 1 paga so na cabeca: sai 200 em 05/08 e restam 2 parcelas (400)',
      S32(s) === S32([{ data: '2026-08-05', total: -200 }]) && s.semPagar === 2 && s.semPagarValor === 400, S32([s, s.semPagar, s.semPagarValor]));
    /* pagar TODAS as linhas que o a-pagar mostra: a curva tem de acompanhar exatamente */
    notaFix();
    const antesTot = ultimo32(A('serieDinheiro')());
    const linhas = A('aPagar')(true).concat(A('aPagar')());
    let pago = 0;
    linhas.forEach(L => { L.m.pgParcelas = L.m.pgParcelas || {}; L.m.pgParcelas[L.pi] = { d: '2026-09-15', v: r2_32(L.valor) }; pago += r2_32(L.valor); });
    t('32g: [pre] o a-pagar (vencidas + a vencer) lista as 3 parcelas da nota, todas pela cabeca e de 200',
      linhas.length === 3 && linhas.every(L => L.m.id === 'n1' && r2_32(L.valor) === 200), S32(linhas.map(L => [L.m.id, L.pi, L.valor])));
    s = A('serieDinheiro')();
    t('32g: pagar TODAS as linhas do a-pagar esvazia aPagar(true) e aPagar() E zera semPagar/semPagarValor',
      A('aPagar')(true).length === 0 && A('aPagar')().length === 0 && s.semPagar === 0 && s.semPagarValor === 0, S32([A('aPagar')(true).length, A('aPagar')().length, s.semPagar, s.semPagarValor]));
    t('32g: e o total da curva se moveu EXATAMENTE o valor pago (-600), na data do pagamento',
      pago === 600 && r2_32(ultimo32(s) - antesTot) === -pago && S32(s) === S32([{ data: '2026-09-15', total: -600 }]), S32([antesTot, ultimo32(s), pago, s]));
    /* item da nota editado pra a vista: sai do cronograma e vira compra a vista na propria data */
    notaFix();
    const n1 = M()[0]; n1.pgTipo = 'À vista'; n1.nParc = 0;       /* o item de 300 (o PRIMEIRO, que seria a cabeca) vira a vista */
    s = A('serieDinheiro')();
    t('32g: item da nota editado pra "À vista" sai do cronograma — a cabeca e o total sao so dos que continuam parcelados: 3 parcelas de (200+100)/3, semPagarValor 300 (nao 600)',
      s.semPagar === 3 && s.semPagarValor === 300, S32([s.semPagar, s.semPagarValor]));
    t('32g: e o item editado passa a contar como compra a vista na PROPRIA data (-300 em 01/08)', S32(s) === S32([{ data: '2026-08-01', total: -300 }]), S32(s));
    const linhasE = A('aPagar')(true).concat(A('aPagar')());
    t('32g: o a-pagar concorda com a curva: 3 parcelas de 100 pela nova cabeca (n2)', linhasE.length === 3 && linhasE.every(L => L.m.id === 'n2' && r2_32(L.valor) === 100), S32(linhasE.map(L => [L.m.id, L.valor])));
    /* ABERTURA dentro da nota */
    notaFix();
    M().push(compra32('n4', { data: '2026-08-01', valor: 50, notaId: 'N1', pgTipo: 'Parcelado', nParc: 3, venc1: '2026-08-01', origem: 'ABERTURA', loteOrigem: 'n1' }));
    s = A('serieDinheiro')();
    t('32g: registro origem "ABERTURA" dentro da nota NAO entra no total do cronograma (600, nao 650) e nao gera parcelas proprias',
      s.semPagar === 3 && s.semPagarValor === 600 && s.length === 0, S32([s.semPagar, s.semPagarValor, s]));
  });

  /* ---------- 32h: graficoLinhaEstoque (o HTML da curva, nas 4 combinacoes das chaves dinheiro/colecao) ---------- */
  await bloco32('h', async () => {
    congela(2026, 1, 2, 10, 0);   /* as 3 parcelas do h4 sao "a vencer"; o h8 (2 parcelas em nov e dez/2025) e "vencida sem marca" */
    /* fixture com TODOS os contadores acima de zero */
    M().push(compra32('h1', { data: '2026-01-10', valor: 100 }));
    M().push(compra32('h2', { data: '2026-02-01', valor: 40, situacao: 'Trocado', dataSaida: '2026-03-01' }));
    M().push(compra32('h3', { data: '2026-02-10', valor: 25, situacao: 'Trocado' }));                                      /* estoque: 1 baixa sem data (25) */
    M().push(compra32('h4', { data: '2026-01-20', valor: 300, qtd: 3, pgTipo: 'Parcelado', nParc: 3 }));                   /* dinheiro: 3 parcelas sem pagamento (300) */
    M().push(compra32('h5', { data: '2026-02-05', valor: 35, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção', origemPedido: true })); /* coleção: 1 sem chegada (35) */
    M().push(compra32('h6', { data: '2026-02-15', valor: 15, situacao: 'Vendido', destIni: 'Coleção' }));                  /* coleção: 1 saida sem data (15) */
    M().push(compra32('h7', { data: '2026-01-30', valor: 20, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção' }));
    M().push(compra32('h8', { data: '2025-11-10', valor: 100, pgTipo: 'Parcelado', nParc: 2 }));                            /* dinheiro: 2 parcelas vencidas sem marca (100), contadas como pagas */
    const sE = A('serieEstoque')(), sD = A('serieDinheiro')(), sC = A('serieColecao')();
    t('32h: [fixture] os cinco contadores estao acima de zero (senao o teste dos avisos nao prova nada)',
      sE.semData === 1 && sE.semDataValor === 25 && sD.semPagar === 3 && sD.semPagarValor === 300 && sD.presumidas === 2 && sD.presumidasValor === 100
      && sC.semChegada === 1 && sC.semChegadaValor === 35 && sC.semData === 1 && sC.semDataValor === 15,
      S32([sE.semData, sE.semDataValor, sD.semPagar, sD.semPagarValor, sD.presumidas, sD.presumidasValor, sC.semChegada, sC.semChegadaValor, sC.semData, sC.semDataValor]));
    const legenda = html => { const m = html.match(/<div class="legend"[^>]*>([\s\S]*?)<\/div>/); return m ? m[1].replace(/<[^>]*>/g, '') : null; };
    [[false, false], [true, false], [false, true], [true, true]].forEach(([vc, vk]) => {
      const rot = '[dinheiro ' + (vc ? 'ligado' : 'desligado') + ', colecao ' + (vk ? 'ligada' : 'desligada') + ']';
      const html = A('graficoLinhaEstoque')(sE, sD, sC, vc, vk);
      const leg = legenda(html);
      t('32h: ' + rot + ' o HTML nunca contem NaN, undefined nem null e desenha a curva (svg)', !/NaN|undefined|null/.test(html) && html.indexOf('<svg') >= 0, (html.match(/.{0,30}(NaN|undefined|null).{0,30}/) || [''])[0]);
      t('32h: ' + rot + ' a legenda lista "estoque" sempre e "dinheiro"/"coleção" SO quando ligados',
        leg !== null && leg.indexOf('estoque') >= 0 && (leg.indexOf('dinheiro') >= 0) === vc && (leg.indexOf('coleção') >= 0) === vk, 'legenda=' + leg);
      const xs = [], ys = [];
      (html.match(/points="[^"]*"/g) || []).forEach(pp => pp.slice(8, -1).trim().split(/\s+/).forEach(par => { const q = par.split(',').map(Number); xs.push(q[0]); ys.push(q[1]); }));
      (html.match(/<circle cx="[^"]*" cy="[^"]*"/g) || []).forEach(cc => { const q = cc.match(/cx="([^"]*)" cy="([^"]*)"/); xs.push(+q[1]); ys.push(+q[2]); });
      t('32h: ' + rot + ' todos os pontos das linhas e bolinhas caem DENTRO da caixa do grafico (720 x 200): a escala vertical cobre estoque, dinheiro negativo e colecao',
        xs.length > 0 && xs.length === ys.length && xs.every(v => isFinite(v) && v >= 0 && v <= 720) && ys.every(v => isFinite(v) && v >= 0 && v <= 200), S32([xs.length, Math.min.apply(null, ys), Math.max.apply(null, ys)]));
      t('32h: ' + rot + ' so desenha a linha do dinheiro (verde) e a da colecao (roxa) quando ligadas',
        (html.indexOf('stroke="var(--green)"') >= 0) === vc && (html.indexOf('stroke="var(--purple)"') >= 0) === vk);
      t('32h: ' + rot + ' os botoes-chave mostram o estado (● ligado / ○ desligado)',
        html.indexOf((vc ? '● ' : '○ ') + '💰 dinheiro') >= 0 && html.indexOf((vk ? '● ' : '○ ') + '⭐ coleção') >= 0);
      t('32h: ' + rot + ' o aviso de baixa de estoque sem data (semData) aparece SEMPRE (contador 1) e traz o valor (R$ 25,00)',
        html.indexOf('de estoque sem data de saída registrada') >= 0 && html.indexOf(fmt32(25)) >= 0);
      t('32h: ' + rot + ' o aviso de parcelas de compra ainda a vencer (semPagar) so aparece com o dinheiro LIGADO, com o valor (R$ 300,00)',
        (html.indexOf('de compra ainda a vencer') >= 0) === vc && (!vc || html.indexOf(fmt32(300)) >= 0));
      t('32h: ' + rot + ' o aviso das parcelas vencidas sem marca (contadas como pagas no vencimento) so aparece com o dinheiro LIGADO, com o valor (R$ 100,00) e diz que estao sem conta cadastrada',
        (html.indexOf('já vencidas sem marca de paga estão contadas como pagas no dia do vencimento') >= 0) === vc
        && (!vc || (html.indexOf('(' + fmt32(100) + ')') >= 0 && html.indexOf('delas sem conta cadastrada') >= 0)));
      t('32h: ' + rot + ' os avisos da colecao (semChegada e saida sem data) so aparecem com a colecao LIGADA, com os valores (R$ 35,00 e R$ 15,00)',
        (html.indexOf('como chegada') >= 0) === vk && (html.indexOf('da coleção sem data registrada') >= 0) === vk && (!vk || (html.indexOf(fmt32(35)) >= 0 && html.indexOf(fmt32(15)) >= 0)));
    });
    /* sem pendencia nenhuma nao ha aviso nenhum, com tudo ligado */
    reset();
    M().push(compra32('h8', { data: '2026-01-10', valor: 100 }));
    M().push(compra32('h9', { data: '2026-02-01', valor: 40, situacao: 'Trocado', dataSaida: '2026-03-01' }));
    M().push(compra32('h10', { data: '2026-01-20', valor: 300, qtd: 3, pgTipo: 'Parcelado', nParc: 3, pgParcelas: { 1: { d: '2026-02-01', v: 100 }, 2: { d: '2026-03-01', v: 100 }, 3: { d: '2026-04-01', v: 100 } } }));
    M().push(compra32('h11', { data: '2026-01-30', valor: 20, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção' }));
    const limpo = A('graficoLinhaEstoque')(A('serieEstoque')(), A('serieDinheiro')(), A('serieColecao')(), true, true);
    t('32h: sem nenhum contador acima de zero nao aparece aviso (⚠) em lugar nenhum, com tudo ligado, e o HTML continua sem NaN/undefined/null',
      limpo.indexOf('⚠') < 0 && !/NaN|undefined|null/.test(limpo) && limpo.indexOf('<svg') >= 0, (limpo.match(/⚠.{0,80}/) || [''])[0]);
    /* curva PLANA (todos os pontos iguais): a escala nao pode dividir por zero */
    reset();
    M().push(compra32('h20', { data: '2026-01-10', valor: 100 }));
    M().push(compra32('h21', { data: '2026-02-01', valor: 50, situacao: 'Trocado', dataSaida: '2026-02-01' }));      /* entra e sai no mesmo dia: 100 -> 100 */
    const planoPos = A('serieEstoque')();
    const combos = [[false, false], [true, false], [false, true], [true, true]];
    const htmlsPlano = combos.map(([vc, vk]) => A('graficoLinhaEstoque')(planoPos, A('serieDinheiro')(), A('serieColecao')(), vc, vk));
    t('32h: curva PLANA acima de zero (100 -> 100): o HTML sai sem NaN/undefined/null nas 4 combinacoes (a escala nao divide por zero)',
      S32(planoPos) === S32([{ data: '2026-01-10', total: 100 }, { data: '2026-02-01', total: 100 }]) && htmlsPlano.every(h => h.indexOf('<svg') >= 0 && !/NaN|undefined|null/.test(h)), S32(planoPos));
    reset();
    M().push(compra32('h22', { data: '2026-01-10', valor: 30, situacao: 'Trocado', dataSaida: '2026-01-10' }));
    M().push(compra32('h23', { data: '2026-02-01', valor: 30, situacao: 'Trocado', dataSaida: '2026-02-01' }));
    const planoZero = A('serieEstoque')();
    const htmlsZero = combos.map(([vc, vk]) => A('graficoLinhaEstoque')(planoZero, A('serieDinheiro')(), A('serieColecao')(), vc, vk));
    t('32h: curva PLANA em zero (0 -> 0) tambem sai sem NaN/undefined/null nas 4 combinacoes',
      S32(planoZero) === S32([{ data: '2026-01-10', total: 0 }, { data: '2026-02-01', total: 0 }]) && htmlsZero.every(h => h.indexOf('<svg') >= 0 && !/NaN|undefined|null/.test(h)), S32(planoZero));
    /* rotulos do eixo X: de tantos em tantos pontos, e o ultimo SEMPRE aparece, ancorado no fim */
    reset();
    for (let i = 1; i <= 10; i++) M().push(compra32('hx' + i, { data: '2026-03-' + String(i).padStart(2, '0'), valor: 10 * i }));
    const htmlX = A('graficoLinhaEstoque')(A('serieEstoque')(), A('serieDinheiro')(), A('serieColecao')(), false, false);
    const ancoras = (htmlX.match(/<text x="[^"]*" y="187" text-anchor="\w+"[^>]*>[^<]*<\/text>/g) || []).map(x => [x.match(/text-anchor="(\w+)"/)[1], x.match(/>([^<]*)<\/text>/)[1]]);
    t('32h: com 10 pontos o eixo X rotula de 2 em 2 (5 rotulos) mais o ULTIMO, sempre, ancorado no fim: 6 rotulos, do 01/03 ao 10/03',
      ancoras.length === 6 && ancoras.slice(0, 5).every(a => a[0] === 'middle') && ancoras[5][0] === 'end' && ancoras[0][1] === '01/03' && ancoras[5][1] === '10/03', S32(ancoras));
    /* sem curva pra desenhar: os avisos nao se perdem */
    reset();
    M().push(compra32('h12', { data: '2026-02-10', valor: 25, situacao: 'Trocado' }));
    const vazio = A('graficoLinhaEstoque')(A('serieEstoque')(), A('serieDinheiro')(), A('serieColecao')(), true, true);
    t('32h: sem historico pra desenhar a mensagem diz isso e o aviso de baixa sem data continua la (nao se perde com a curva)',
      vazio.indexOf('Ainda não há histórico') >= 0 && vazio.indexOf('de estoque sem data de saída registrada') >= 0 && vazio.indexOf('<svg') < 0 && !/NaN|undefined|null/.test(vazio));
    reset();
    M().push(compra32('h13', { data: '2026-02-10', valor: 25 }));
    const umPonto = A('graficoLinhaEstoque')(A('serieEstoque')(), A('serieDinheiro')(), A('serieColecao')(), false, false);
    t('32h: com um ponto so a mensagem diz que a curva nasce com duas datas (sem svg, sem NaN)', umPonto.indexOf('Só existe um ponto') >= 0 && umPonto.indexOf('<svg') < 0 && !/NaN|undefined|null/.test(umPonto));
  });

  /* ---------- 32i: vEstoque (a aba: card "Ainda nao confirmado" e a lista) ---------- */
  await bloco32('i', async () => {
    setg('tela', 'estoque');
    const c = capturas32();
    const cardValor = html => { const m = html.match(/Ainda não confirmado[^<]*<\/div><div class="v"[^>]*>([^<]*)<\/div>/); return m ? m[1] : null; };
    /* mistura: remanescente + pre-venda + separada pra colecao (nao confirmada) + separada ja confirmada (fora) */
    M().push(compra32('i1', { data: '2026-09-01', qtd: 2, valor: 20, situacao: 'Pedido' }));
    const pvI = preVenda32('i1', 1, 'Fulano', { dataSaida: '2026-09-02', dataVenda: '2026-09-02' });   /* pai i1 = 10 (Pedido); filho = 10 (pre-vendido) */
    M().push(compra32('i2', { data: '2026-09-01', qtd: 3, valor: 30, situacao: 'Pedido' }));
    c.resposta = '1'; A('separarParaColecao')('i2');                                                    /* pai i2 = 20 (Pedido); filho = 10 (coleção) */
    const colI = M().find(m => m.loteOrigem === 'i2' && A('sitDe')(m) === 'Coleção');
    M().push(compra32('i3', { data: '2026-09-01', valor: 99, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção', origemPedido: true, dataChegada: '2026-09-10' }));
    let html = A('vEstoque')();
    t('32i: o rotulo do card e "Ainda não confirmado" (nao mais "Pedidos a caminho (ainda não chegaram)")',
      html.indexOf('Ainda não confirmado') >= 0 && html.indexOf('Pedidos a caminho (ainda não chegaram)') < 0);
    t('32i: o valor do card e a soma de TUDO que a lista mostra (10 + 10 + 20 + 10 = R$ 50,00) — e nao o motor().pedido (R$ 30,00), que so soma o que ainda esta marcado Pedido',
      cardValor(html) === fmt32(50) && A('motor')().pedido === 30, 'card=' + cardValor(html) + ' motor().pedido=' + A('motor')().pedido);
    t('32i: o card bate com a soma do que pedidosAgrupados() lista (remanescentes + pecas + colecao)',
      cardValor(html) === fmt32(A('pedidosAgrupados')().reduce((s, gr) => s + gr.remanescentes.reduce((a, m) => a + m.valor, 0) + gr.pecas.reduce((a, p) => a + p.peca.valor, 0) + gr.colecao.reduce((a, m) => a + m.valor, 0), 0)));
    t('32i: cada linha da lista tem o botao ligado ao registro certo — remanescente: p/ coleção + chegou; pre-vendida: chegouPeca com o nome do comprador; separada: chegouPeca',
      html.indexOf("separarParaColecao('i1')") >= 0 && html.indexOf("chegouPedido('i1')") >= 0 && html.indexOf("chegouPedido('i2')") >= 0
      && html.indexOf("chegouPeca('" + pvI.peca.id + "')") >= 0 && html.indexOf('Fulano') >= 0 && html.indexOf('vendido · aguardando chegada') >= 0
      && html.indexOf("chegouPeca('" + colI.id + "')") >= 0 && html.indexOf('Separado pra coleção') >= 0 && html.indexOf('não vai ser vendido') >= 0);
    t('32i: cada linha da lista mostra o valor da PROPRIA peca: R$ 10,00 nas tres de 10 (remanescente i1, pre-vendida, separada) e R$ 20,00 no remanescente i2',
      (html.match(/<b>R\$ 10,00<\/b>/g) || []).length === 3 && (html.match(/<b>R\$ 20,00<\/b>/g) || []).length === 1, S32(html.match(/<b>R\$ [^<]*<\/b>/g)));
    t('32i: a peca de colecao que JA chegou (i3) nao aparece na lista', html.indexOf("chegouPeca('i3')") < 0 && html.indexOf('99,00') < 0);
    /* o caminho do usuario: toca em "chegou" numa linha e a aba mostra o resultado */
    c.confirmar = true; A('chegouPeca')(colI.id);
    html = A('vEstoque')();
    t('32i: depois de confirmar a chegada da peca separada o card cai pra R$ 40,00 e a linha some (o resto continua)',
      cardValor(html) === fmt32(40) && html.indexOf("chegouPeca('" + colI.id + "')") < 0 && html.indexOf("chegouPeca('" + pvI.peca.id + "')") >= 0, 'card=' + cardValor(html));
    /* G1: pedido INTEIRO separado pra colecao */
    reset();
    M().push(compra32('i4', { data: '2026-09-01', qtd: 3, valor: 45, situacao: 'Pedido' }));
    c.resposta = '3'; A('separarParaColecao')('i4');
    html = A('vEstoque')();
    t('32i: [G1] pedido INTEIRO separado pra colecao: o card mostra o valor da peca (R$ 45,00) e NAO R$ 0,00, mesmo com motor().pedido zerado',
      A('motor')().pedido === 0 && cardValor(html) === fmt32(45), 'card=' + cardValor(html) + ' motor().pedido=' + A('motor')().pedido);
    t('32i: [G1] a linha "Separado pra coleção" esta na lista e nao existe "Ainda sem comprador"', html.indexOf('Separado pra coleção') >= 0 && html.indexOf('Ainda sem comprador') < 0);
    /* pedido sem colecao e sem tipo: o titulo do grupo nunca fica em branco */
    reset();
    M().push(compra32('i6', { data: '2026-09-01', valor: 10, situacao: 'Pedido', cat: '', colecao: '' }));
    html = A('vEstoque')();
    t('32i: pedido sem colecao e sem tipo aparece com o titulo "item" (nunca em branco) e o card mostra o valor', html.indexOf('>item</div>') >= 0 && cardValor(html) === fmt32(10), 'card=' + cardValor(html));
    /* nada a caminho */
    reset();
    M().push(compra32('i5', { data: '2026-09-01', valor: 10 }));
    html = A('vEstoque')();
    t('32i: sem nada a caminho o card mostra R$ 0,00 e a lista diz "Nada a caminho agora."', cardValor(html) === fmt32(0) && html.indexOf('Nada a caminho agora.') >= 0, 'card=' + cardValor(html));
  });

  /* ---------- 32j: ciclo de vida de origemPedido (chegouPedido e a EDICAO pelo formulario, salvar()) ---------- */
  await bloco32('j', async () => {
    const c = capturas32();
    /* origemPedido nao pode "vazar" pra um filho de CONSUMO depois de a peca ja ter chegado ao estoque */
    reset();
    M().push(compra32('j1', { data: '2026-09-01', qtd: 3, valor: 30, situacao: 'Pedido', origemPedido: true }));
    A('chegouPedido')('j1');
    const fj = A('baixarLote')('j1', 1, 'Coleção', { dataSaida: '2026-09-15' });
    t('32j: depois de chegouPedido, um CONSUMO (baixarLote pra Coleção) NAO herda origemPedido no filho — senao ele reapareceria em "Pedidos a caminho" como se ainda nao tivesse chegado',
      fj.id !== 'j1' && !('origemPedido' in fj) && A('sitDe')(fj) === 'Coleção' && A('pedidosAgrupados')().length === 0, S32(fj));
    /* a edicao pelo formulario: salvar() com a Situacao mudando */
    const editar = (rec, sitNova) => {
      reset(); M().push(rec);
      setg('editId', rec.id); setg('tipoSel', 'COMPRA'); setg('tela', 'lancar'); setg('pgTipo', 'À vista'); setg('_fotosPend', []);
      setg('_db', null); setg('_syncReady', false); setg('_restaurando', false); setg('excluidos', {}); setg('_baseH', {});
      Object.keys(campos32).forEach(k => delete campos32[k]);
      Object.assign(campos32, { f_val: String(rec.valor), f_data: rec.data, f_jogo: 'Pokémon', f_cat: 'ETB', f_col: '151', f_idi: '—', f_qtd: String(rec.qtd), f_cp: 'F', f_sit: sitNova, f_taxa: '0', f_pg: 'À vista' });
      ctx.document.getElementById = elCampo32;
      A('salvar')();
      return M().find(m => m.id === rec.id);
    };
    let d0 = hoje32();
    let r = editar(compra32('j2', { data: '2026-09-01', qtd: 2, valor: 20, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção', origemPedido: true }), 'Em estoque');
    t('32j: [salvar] editar a Situacao de Coleção pra Em estoque grava a mudanca (a edicao foi mesmo salva)', !!r && A('sitDe')(r) === 'Em estoque' && c.toasts.some(x => /Alteração salva/.test(x)), S32([r, c.toasts]));
    t('32j: [salvar] Coleção -> Em estoque REMOVE origemPedido e NAO carimba dataChegada (a peca ja existia fisicamente; carimbar "hoje" reescreveria a historia da curva de estoque)',
      !('origemPedido' in r) && r.dataChegada === undefined, S32(r));
    const fj2 = A('baixarLote')('j2', 1, 'Coleção', { dataSaida: '2026-09-16' });
    t('32j: [salvar] e o CONSUMO seguinte dessa peca nao herda origemPedido', !('origemPedido' in fj2) && A('pedidosAgrupados')().length === 0, S32(fj2));
    r = editar(compra32('j3', { data: '2026-09-01', qtd: 2, valor: 20, situacao: 'Pedido', destino: 'Vender', origemPedido: true }), 'Em estoque');
    t('32j: [salvar] Pedido -> Em estoque carimba dataChegada = hoje e REMOVE origemPedido (mesmo o "de sobra")', A('sitDe')(r) === 'Em estoque' && ehHoje32(r.dataChegada, d0) && !('origemPedido' in r), S32(r));
    r = editar(compra32('j4', { data: '2026-09-01', qtd: 2, valor: 20, situacao: 'Pedido', destino: 'Vender', dataChegada: '2026-08-30' }), 'Em estoque');
    t('32j: [salvar] Pedido -> Em estoque que JA tinha dataChegada nao a sobrescreve (fica 30/08)', r.dataChegada === '2026-08-30', S32(r));
    r = editar(compra32('j5', { data: '2026-09-01', qtd: 2, valor: 20, situacao: 'Coleção', destino: 'Coleção', destIni: 'Coleção', origemPedido: true }), 'Coleção');
    t('32j: [salvar] controle — editar SEM mudar a Situacao (Coleção -> Coleção) MANTEM origemPedido e nao carimba dataChegada (a peca ainda nao chegou de verdade)',
      A('sitDe')(r) === 'Coleção' && r.origemPedido === true && r.dataChegada === undefined, S32(r));
    r = editar(compra32('j6', { data: '2026-09-01', qtd: 2, valor: 20, situacao: 'Em estoque' }), 'Em estoque');
    t('32j: [salvar] controle — editar uma peca que ja esta Em estoque nao carimba dataChegada', A('sitDe')(r) === 'Em estoque' && r.dataChegada === undefined, S32(r));
  });

  /* ---------- 32k: soltarIntrusa (limpeza de origemPedido ao soltar a peca de um lote com a conta quebrada) ---------- */
  await bloco32('k', async () => {
    const c = capturas32();
    /* lote de 100 (raiz 60 + filho legitimo 40) com uma "intrusa" de 25 grudada: soma 125, referencia 100 */
    const familia = (sitIntr, extras) => {
      reset();
      M().push(compra32('kr', { valor: 60, qtd: 6, valorOrig: 100, destIni: 'Em estoque' }));
      M().push(compra32('kf', { valor: 40, qtd: 4, loteOrigem: 'kr' }));
      M().push(compra32('ki', Object.assign({ valor: 25, qtd: 2, loteOrigem: 'kr', situacao: sitIntr, origemPedido: true }, extras || {})));
    };
    familia('Em estoque');
    const dg = A('diagLote')('kr');
    t('32k: [fixture] diagLote acha a peca ki como a intrusa (soma 125 x referencia 100)', !!dg && !!dg.intrusa && dg.intrusa.id === 'ki' && !dg.ambiguo && dg.dif === 25, S32(dg && { intrusa: dg.intrusa && dg.intrusa.id, dif: dg.dif, amb: dg.ambiguo }));
    A('soltarIntrusa')('kr');
    const msg1 = c.confirms[c.confirms.length - 1];
    let ki = M().find(m => m.id === 'ki');
    t('32k: a pergunta nomeia a peca e mostra a conta que vai fechar: "Soltar "151 · ETB" (2 un · R$ 25,00)" e "fecha: R$ 100,00 = R$ 100,00" (sem o aviso de TROCADA, que e so do Trocado)',
      msg1.indexOf('Soltar "151 · ETB" (2 un · ' + fmt32(25) + ') deste lote?') === 0 && msg1.indexOf('fecha: ' + fmt32(100) + ' = ' + fmt32(100)) >= 0 && !/TROCADA/.test(msg1), msg1);
    t('32k: a observacao da peca solta comeca pela nota "[solta do lote em ...]" (sem "undefined" de observacao vazia)',
      ki.obs.indexOf('[solta do lote em ') === 0 && !/undefined/.test(ki.obs), ki.obs);
    t('32k: intrusa Em estoque com origemPedido:true: ao soltar perde o campo, vira raiz propria (sem loteOrigem) e segue Em estoque',
      !('origemPedido' in ki) && !('loteOrigem' in ki) && A('sitDe')(ki) === 'Em estoque' && ki.valorOrig === 25, S32(ki));
    t('32k: e a conta do lote fecha (diagLote devolve null), nada foi apagado (3 registros) e ficou a nota na observacao',
      A('diagLote')('kr') === null && M().length === 3 && /solta do lote/.test(ki.obs), S32([A('diagLote')('kr'), M().length, ki.obs]));
    familia('Trocado', { trocaId: 'tr1', dataTroca: '2026-08-20' });
    A('soltarIntrusa')('kr');
    const msg2 = c.confirms[c.confirms.length - 1];
    ki = M().find(m => m.id === 'ki');
    t('32k: para a intrusa Trocado a pergunta avisa que ela esta marcada como TROCADA sem troca registrada',
      /TROCADA sem troca registrada/.test(msg2), msg2);
    t('32k: intrusa Trocado (marcada como trocada sem troca registrada) volta pra Em estoque, destino Vender, e perde origemPedido, dataTroca e trocaId',
      A('sitDe')(ki) === 'Em estoque' && ki.destino === 'Vender' && !('origemPedido' in ki) && !('dataTroca' in ki) && !('trocaId' in ki) && !('loteOrigem' in ki), S32(ki));
    familia('Coleção', { destino: 'Coleção' });
    A('soltarIntrusa')('kr');
    ki = M().find(m => m.id === 'ki');
    t('32k: intrusa Coleção MANTEM origemPedido (ela ainda nao confirmou a chegada; limpar seria o erro contrario), continua Coleção e ganha vida propria (sem loteOrigem)',
      A('sitDe')(ki) === 'Coleção' && ki.origemPedido === true && !('loteOrigem' in ki) && A('diagLote')('kr') === null, S32(ki));
    /* sem intrusa (conta fecha): nao mexe em nada */
    reset();
    M().push(compra32('kr', { valor: 60, qtd: 6, valorOrig: 100 }));
    M().push(compra32('kf', { valor: 40, qtd: 4, loteOrigem: 'kr' }));
    const antes = foto32(), nConf = c.confirms.length;
    A('soltarIntrusa')('kr');
    t('32k: lote com a conta fechada (sem intrusa) — soltarIntrusa nao muda nada e nem chega a perguntar', foto32() === antes && c.confirms.length === nConf, S32([c.confirms.length, nConf]));
  });
}).catch(e=>{fail++;console.log('  FALHOU  secao 32 explodiu -> '+((e&&e.stack)||e));}).then(async()=>{
  /* ===== 33. PARCELA PAGA ALEM DO PLANO (M-1) E PECA JA CONFIRMADA QUE VOLTA (19/09/2026) =====
     Decisao do Felype ("nao entendi. pode auditar umas 3x e resolver"): compra parcelada cujo numero de parcelas foi editado
     DEPOIS de pagar (4x virou 3x com a parcela 4 ja marcada) deixa uma marca com indice MAIOR que nParc. Ate hoje as telas de
     dinheiro so liam 1..nParc e esse dinheiro sumia em silencio. Agora ele conta em contasPagas (Fluxo de caixa > pagas, com
     "desmarcar"), saldoFisicoConta e serieDinheiro (grafico, com aviso contado), a Projecao do caixa desconta so o excedente que
     o valor da compra nao cobre (por conta, no mesmo escopo do saldo por emissao) e o Diagnostico so afirma o que o codigo faz.
     Duas auditorias adversariais + a leitura "como o Felype" moldaram cada caso (G1, G2, M1, M3, M4, m1 da rodada 1; M-A, M-B,
     m-2, m-3, m-6 da rodada 2). O agente de testes achou de quebra que a peca vendida ANTES de chegar e depois CONFIRMADA
     (chegouPeca) voltava pra "Pedido" quando a venda era desfeita — voltaDe() resolve.
     Como esta secao e construida (mesmo padrao da 32): cada bloco monta o PROPRIO fixture com reset(), nao depende de ordem e
     restaura no finally tudo o que mexe; um bloco que explode vira UMA linha FALHOU e os outros seguem. Datas fixas no passado
     (fev-mai/2026), pra o teste nao envelhecer. O filtro de periodo do app (padrao: ultimos 30 dias) e zerado no bloco, senao
     as parcelas de fevereiro sumiriam da tela por causa do filtro e nao por causa do codigo.
     Controle negativo (19/09/2026): cada mutacao no app abaixo deixa VERMELHOS os blocos citados —
       voltaDe sem olhar dataChegada: 33n | contasPagas com Math.ceil trocado por floor: 33e | helper sem a chave canonica: 33a |
       helper sem a data ISO: 33a 33c | excessoPagoAlemDoPlano sem o escopo da conta/data-base: 33h | rotulo "(x.pn>1||x.alem)" sem
       o "||x.alem": 33f | texto "fora do plano de N×" trocado por "N de M": 33f | saldoFisicoConta sem a linha das parcelas alem do
       plano: 33b 33d 33h | aviso do grafico sem pagasAlem: 33b 33k | Diagnostico com o texto antigo: 33j |
       desmarcarParcela com o texto antigo: 33m.
     3a rodada (19/09/2026: 27 mutacoes do revisor de substancia, a correcao M9 do revisor de numeros e as minhas; todas vermelhas):
       Diagnostico voltando a oferecer "desmarque" como saida igual: 33j | Diagnostico prometendo "saldos" quando nenhum saldo debita a marca: 33j |
       desmarcar sem o aviso "cancele e acerte o nº de parcelas": 33m | desmarcar sem o Math.ceil (plano fracionario): 33m |
       excedente escopado pela COMPRA (conta/data da compra) em vez da MARCA (conta de quem pagou/data do pagamento): 33h |
       excedente sem o filtro de compra de troca: 33h | excedente sem o filtro nParc>0: 33h | excedente negativo somando na projecao: 33h |
       saldoFisicoConta atribuindo a parcela alem do plano a conta da compra em vez da conta do pagamento: 33h |
       papel sem o texto "fora do plano": 33g | papel da nota sem o "||x.alem": 33g | salvar sem a pergunta ao reduzir o parcelamento: 33o |
       salvar sem a trava do nº de parcelas inteiro: 33o | voltaDe fora de devolver/desvincular: 33n.
     4a rodada (19/09/2026, revisor independente do delta da 3a; todas vermelhas): pergunta do salvar sem comparar com o plano ANTERIOR (dispara em toda
       edicao de compra que ja esta fora do plano e o Cancelar jogava fora a edicao): 33o | pergunta do salvar em compra de troca: 33o |
       teto do nº de parcelas: 33o | excedente sem o peso por cadastro (dois cadastros de conta com o mesmo nome): 33h.
     CONHECIDO e ADIADO, sem teste de proposito: G-1 (pai e filho de baixarLote duplicam o pagamento em contasPagas e
     saldoFisicoConta, e a curva so dedupa enquanto a referencia compartilhada existe) — a raiz esta em baixarLote e e a
     prioridade da proxima sessao; M-A (aPagar/contasPagas somam abertura/troca dentro da nota); nParc fracionario (o formulario passou a recusar; em
     dado antigo o rotulo "do plano"/"fora do plano" da parcela do teto diverge entre telas, os numeros fecham); marca DENTRO do plano sem data legivel
     (o saldo debita e a curva nao), 1 centavo de rateio entre Pagas e Saldo e a venda no App que cai HOJE (aReceber ainda a lista e saldoFisicoConta ja a credita: a
     projecao a desconta um dia a mais) — todos pre-existentes. Este bloco NAO afirma nada
     sobre lote fracionado nas telas oficiais, so que a marca alem do plano de um lote na mesma sessao conta UMA vez na curva. */
  console.log('');
  console.log('=== 33. parcela paga alem do plano nas telas de dinheiro; peca ja confirmada nao volta pra Pedido ===');
  const fmt33 = g('fmt');
  const r2_33 = x => Math.round(x * 100) / 100;
  const S33 = s => JSON.stringify(s);
  const ultimo33 = s => (s.length ? s[s.length - 1].total : 0);
  const compra33 = (idc, extra) => Object.assign({ id: idc, tipo: 'COMPRA', data: '2026-01-10', jogo: 'Pokémon', cat: 'ETB', colecao: '151', qtd: 1, valor: 300,
    situacao: 'Em estoque', destino: 'Vender', contraparte: 'Loja', conta: 'X', pgTipo: 'Parcelado', nParc: 3, venc1: '2026-02-01' }, extra || {});
  /* n marcas de 100, nas datas 01/02, 01/03, 01/04, 01/05... de 2026 (todas no passado) */
  const marcas33 = n => { const o = {}; for (let i = 1; i <= n; i++) o[i] = { d: '2026-0' + (i + 1) + '-01', v: 100 }; return o; };
  const banco33 = () => [{ nome: 'X', saldoIni: 1000, saldoData: '' }];
  const sfis33 = () => A('saldoFisicoConta')({ nome: 'X', saldoIni: 1000, saldoData: '' });
  const alem33 = () => A('contasPagas')().filter(x => x.alem);
  const totPagas33 = () => r2_33(A('contasPagas')().reduce((s, x) => s + x.valor, 0));
  const proj33 = () => A('projecaoCaixa')().atual;
  const exc33 = () => { throw new Error('exc33: excessoPagoAlemDoPlano saiu do app (a projecao parte do saldo fisico); reescrever este teste'); };
  /* a tela do Fluxo de caixa com todos os grupos abertos, como o "expandir tudo" faz */
  const telaContas33 = () => { A('vContas')(); const ex = {}; g('_ctKeys').forEach(k => { ex[k] = true; }); setg('ctExp', ex); return A('vContas')(); };
  /* pre-venda = o que salvar() faz numa venda de item 'Pedido' (mesmo helper da 32, que mora dentro do closure dela) */
  const preVenda33 = (idPai, qtd, quem, extras) => {
    const ex = Object.assign({ dataVenda: '2026-09-01', dataSaida: '2026-09-01' }, extras || {});
    const peca = A('baixarLote')(idPai, qtd, 'Vendido', ex);
    const venda = { id: 'V_' + peca.id, tipo: 'VENDA', data: ex.dataVenda, valor: 99, origemId: idPai, vendaDe: 'pedido', contraparte: quem, qtd: peca.qtd, custoOrigem: peca.valor };
    M().push(venda);
    if (peca.id !== idPai) peca.vendaRef = venda.id;
    return { peca, venda };
  };
  /* tudo o que os blocos mexem; cada bloco devolve o app ao estado em que o achou */
  const G33 = ['contasBanc', 'ctExp', 'ctSec', 'ctPess', 'ctJogo', 'ctConta', 'ctCat', 'perDe', 'perAte', 'perSel', 'fxSelMode', 'fxSel', 'ctAgrupo', '_psec',
    'render', 'toast', 'diarioReg', 'imprimir', 'tela', 'editId', 'tipoSel', 'pgTipo', '_fotosPend', '_db', '_syncReady', '_restaurando', '_baseH', 'excluidos',
    'navHist', '_pendVolta', '_lancarDirty', 'notaItens', 'notaHead'];
  /* objetos de estado que o app muda NO LUGAR (uma copia rasa guarda o que o bloco encontrou); os demais (ex.: _db) voltam pela mesma referencia */
  const PLANOS33 = new Set(['ctExp', 'ctSec', 'fxSel', '_psec', '_baseH', 'excluidos', 'notaHead']);
  const copia33 = (v, n) => Array.isArray(v) ? v.slice() : ((PLANOS33.has(n) && v && typeof v === 'object') ? Object.assign({}, v) : v);
  const neutro33 = () => ({ contasBanc: banco33(), ctExp: {}, ctSec: {}, ctPess: '', ctJogo: '', ctConta: '', ctCat: '', perDe: '', perAte: '', perSel: 'tudo',
    fxSelMode: false, fxSel: {}, ctAgrupo: 'mes', _psec: { pagar: true, receber: true, saldo: false, pagas: false, extrato: false },
    render: () => {}, toast: () => {}, diarioReg: () => {}, imprimir: () => {} });
  const FUNCS33 = ['parcelasAlemDoPlano', 'gruposParcelados', 'projecaoCaixa', 'contasPagas', 'saldoFisicoConta', 'serieDinheiro', 'serieEstoque', 'serieColecao',
    'provaReal', 'vContas', 'voltaDe', 'desmarcarParcela', 'graficoLinhaEstoque', 'imprimirFluxoGo', 'execExcl', 'execDev', 'desvincular', 'chegouPeca', 'baixarLote', 'motor', 'sitDe', 'aPagar',
    'marcaEntraNoSaldo', 'salvar', 'salvarNota'];
  const faltam33 = FUNCS33.filter(n => { try { return typeof A(n) !== 'function'; } catch (e) { return true; } });
  t('33a: [pre-requisito] o app carregado tem as ' + FUNCS33.length + ' funcoes da parcela paga alem do plano que esta secao exercita', faltam33.length === 0,
    'FALTAM no app: ' + faltam33.join(', ') + ' — este teste esta rodando contra um build sem a parcela paga alem do plano?');
  const bloco33 = async (rot, corpo) => {
    if (faltam33.length) return;   /* o pre-requisito ja acusou; sem as funcoes cada bloco so repetiria o mesmo erro */
    const salvos = [];
    const orig = { confirm: ctx.confirm, prompt: ctx.prompt, alert: ctx.alert, geb: ctx.document.getElementById, ins: ctx.document.body.insertAdjacentHTML };
    try {
      G33.forEach(n => { try { salvos.push([n, copia33(g(n), n)]); } catch (e) { /* nome que este build nao tem */ } });
      reset();
      const nz = neutro33();
      Object.keys(nz).forEach(n => { try { setg(n, nz[n]); } catch (e) { /* idem */ } });
      await corpo();
    } catch (e) { t('33' + rot + ': o bloco explodiu antes de terminar (o que vinha depois dele NAO foi provado)', false, String((e && e.stack) || e).slice(0, 700)); }
    finally {
      ctx.confirm = orig.confirm; ctx.prompt = orig.prompt; ctx.alert = orig.alert; ctx.document.getElementById = orig.geb; ctx.document.body.insertAdjacentHTML = orig.ins;
      descongela();
      salvos.forEach(([n, v]) => { try { setg(n, v); } catch (e) { /* idem */ } });
      reset();
    }
  };

  /* ---- 33a: o helper que decide o que e "parcela alem do plano" ---- */
  await bloco33('a', () => {
    const f = A('parcelasAlemDoPlano'), ks = (pg, nP) => f(pg, nP).map(e => e.k), d = '2026-05-01';
    const raras = { 4: { d }, '4.0': { d }, ' 5 ': { d }, '+6': { d }, '4e0': { d }, abc: { d }, '-1': { d }, '0': { d }, '2.5': { d } };
    t('33a: so conta chave inteira CANONICA maior que o plano ("4" sim; "4.0", " 5 ", "+6", "4e0", "abc", "-1", "0", "2.5" nao — e a chave que o desmarcar apaga)',
      S33(ks(raras, 3)) === '[4]', S33(ks(raras, 3)));
    t('33a: so entra o que passa do plano (k > nP): com o plano em 3, a chave 3 fica de fora e a 4 e a 5 entram, ordenadas',
      S33(ks({ 5: { d }, 3: { d }, 4: { d } }, 3)) === '[4,5]', S33(ks({ 5: { d }, 3: { d }, 4: { d } }, 3)));
    const datas = { 4: { d: '2026-05-01T10:00' }, 5: { d: '01/05/2026' }, 6: { d: '' }, 7: { d: '2026-13-45' }, 8: { v: 100 }, 9: null, 10: '2026-05-01' };
    t('33a: a data tem de ser ISO real AAAA-MM-DD (com hora, no formato BR, vazia, inexistente, ausente ou marca nula NAO contam; o legado, so a data em texto, conta)',
      S33(ks(datas, 3)) === '[10]', S33(ks(datas, 3)));
    t('33a: pg vazio, nulo, indefinido ou que nao e objeto devolve lista vazia sem lancar',
      f(null, 3).length === 0 && f(undefined, 3).length === 0 && f('x', 3).length === 0 && f({}, 3).length === 0 && f(5, 3).length === 0, '');
  });

  /* ---- 33b: caso central, compra solo — as telas de dinheiro, o aviso e o desmarcar ---- */
  await bloco33('b', () => {
    M().push(compra33('s1', { pgParcelas: marcas33(4) }));
    const sd = A('serieDinheiro')();
    t('33b: a curva de dinheiro conta as 4 parcelas pagas (400) mesmo com o plano em 3x, e nao ha parcela em aberto', r2_33(ultimo33(sd)) === -400 && sd.semPagar === 0, S33([ultimo33(sd), sd.semPagar]));
    t('33b: o aviso conta 1 parcela paga a mais, de R$ 100', sd.pagasAlem === 1 && r2_33(sd.pagasAlemValor) === 100, S33([sd.pagasAlem, sd.pagasAlemValor]));
    const al = alem33();
    t('33b: Fluxo de caixa > pagas lista a parcela 4 de 3 como "alem" do plano, com valor 100 e o desmarcar (pagaManual)',
      al.length === 1 && al[0].pi === 4 && al[0].pn === 3 && r2_33(al[0].valor) === 100 && al[0].pagaManual === true, S33(al.map(x => ({ pi: x.pi, pn: x.pn, v: x.valor, pm: x.pagaManual }))));
    t('33b: a lista de pagas soma as 4 parcelas (400), nenhuma a mais nem a menos', totPagas33() === 400, String(totPagas33()));
    t('33b: o saldo fisico da conta debita as 4 (1000 - 400 = 600)', r2_33(sfis33()) === 600, String(sfis33()));
    t('33b: a lista de A PAGAR nao ganha linha nenhuma (marca paga nunca vira "a pagar")', A('aPagar')().length === 0 && A('aPagar')(true).length === 0, S33([A('aPagar')().length, A('aPagar')(true).length]));
    ctx.confirm = () => true;
    A('desmarcarParcela')('s1', 4);
    const sd2 = A('serieDinheiro')();
    t('33b: desmarcar a parcela 4 tira a marca e as telas voltam JUNTAS ao numero sem ela (curva -300, saldo 700, projecao 700, pagas 300, sem linha alem, sem aviso)',
      !(4 in M()[0].pgParcelas) && r2_33(ultimo33(sd2)) === -300 && r2_33(sfis33()) === 700 && r2_33(proj33()) === 700 && totPagas33() === 300 && alem33().length === 0 && sd2.pagasAlem === 0,
      S33([Object.keys(M()[0].pgParcelas), ultimo33(sd2), sfis33(), proj33(), totPagas33(), alem33().length, sd2.pagasAlem]));
  });

  /* ---- 33c: bordas de dado (nenhuma tela pode lancar, e so a marca valida conta) ---- */
  await bloco33('c', () => {
    const base = () => ({ 1: { d: '2026-02-01', v: 100 }, 2: { d: '2026-03-01', v: 100 }, 3: { d: '2026-04-01', v: 100 } });
    const casos = [
      ['marca alem do plano SEM data', Object.assign(base(), { 4: { v: 100 } }), 300, 0],
      ['marca alem do plano com data no formato BR (torta)', Object.assign(base(), { 4: { d: '01/05/2026', v: 100 } }), 300, 0],
      ['chaves fora do padrao (abc, 2.5, -1, 0, "4.0")', Object.assign(base(), { abc: { d: '2026-05-01', v: 9 }, '2.5': { d: '2026-05-01', v: 9 }, '-1': { d: '2026-05-01', v: 9 }, '0': { d: '2026-05-01', v: 9 }, '4.0': { d: '2026-05-01', v: 9 } }), 300, 0],
      ['formato legado (so a data em texto) usa valor/nParc = 100', { 1: '2026-02-01', 2: '2026-03-01', 3: '2026-04-01', 4: '2026-05-01' }, 400, 1],
      ['marca alem do plano sem valor (v ausente) cai no rateio valor/nParc', Object.assign(base(), { 4: { d: '2026-05-01' } }), 400, 1],
    ];
    casos.forEach(([rot, pg, esperado, nAlem]) => {
      reset(); setg('contasBanc', banco33());
      M().push(compra33('b1', { pgParcelas: pg }));
      let sd, msg = '';
      try { sd = A('serieDinheiro')(); A('contasPagas')(); sfis33(); A('projecaoCaixa')(); telaContas33(); } catch (e) { msg = String((e && e.message) || e); }
      t('33c: ' + rot + ' — nenhuma tela lanca; a curva mostra -' + esperado + ' e ' + nAlem + ' parcela(s) alem do plano',
        !msg && r2_33(ultimo33(sd)) === -esperado && sd.pagasAlem === nAlem, S33([msg, sd && ultimo33(sd), sd && sd.pagasAlem]));
    });
  });

  /* ---- 33d: nota (a cabeca carrega o cronograma e a marca alem do plano) ---- */
  await bloco33('d', () => {
    M().push(compra33('n1', { valor: 200, notaId: 'N9', nParc: 2, pgParcelas: { 1: { d: '2026-02-01', v: 150 }, 2: { d: '2026-03-01', v: 150 }, 3: { d: '2026-04-01', v: 150 } } }));
    M().push(compra33('n2', { valor: 400, notaId: 'N9', nParc: 2 }));
    const sd = A('serieDinheiro')(), al = alem33();
    t('33d: nota parcelada em 2x com 3 parcelas pagas (450): a curva conta as 3, uma delas alem do plano, e nada fica em aberto',
      r2_33(ultimo33(sd)) === -450 && sd.pagasAlem === 1 && sd.semPagar === 0, S33([ultimo33(sd), sd.pagasAlem, sd.semPagar]));
    t('33d: Fluxo de caixa > pagas mostra a parcela 3 de 2 da nota, com os dados da nota (cabeca n1)',
      al.length === 1 && al[0].pi === 3 && al[0].pn === 2 && al[0].m.id === 'n1' && !!al[0].nota && al[0].nota.parcela === 3 && al[0].nota.nP === 2,
      S33(al.map(x => ({ pi: x.pi, pn: x.pn, id: x.m.id, nota: x.nota }))));
    t('33d: o saldo fisico debita as 3 parcelas da nota (1000 - 450 = 550)', r2_33(sfis33()) === 550, String(sfis33()));
    /* nota em que a PRIMEIRA (que seria a cabeca) e a vista: a cabeca passa a ser o proximo item parcelado e a marca alem do plano dele conta */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('m1', { valor: 200, notaId: 'N8', pgTipo: 'À vista', nParc: 0 }));
    M().push(compra33('m2', { valor: 400, notaId: 'N8', nParc: 2, pgParcelas: { 1: { d: '2026-02-01', v: 100 }, 2: { d: '2026-03-01', v: 100 }, 3: { d: '2026-04-01', v: 100 } } }));
    const sd2 = A('serieDinheiro')();
    t('33d: nota em que o primeiro item e a vista: a cabeca e o item parcelado, a marca alem do plano dele conta (curva -500 = 200 a vista + 300 pagos)',
      sd2.pagasAlem === 1 && r2_33(ultimo33(sd2)) === -500, S33([sd2.pagasAlem, ultimo33(sd2), sd2.semPagar]));
  });

  /* ---- 33e: nParc fracionario (o laco normal do contasPagas vai ate o TETO; o helper dele tem de acompanhar) ---- */
  await bloco33('e', () => {
    [3.5, 2.9].forEach(np => {
      reset(); setg('contasBanc', banco33());
      M().push(compra33('f1', { nParc: np, pgParcelas: marcas33(4) }));
      const sd = A('serieDinheiro')();
      t('33e: nParc ' + np + ' com 4 marcas de 100: a lista de pagas soma 400 (nenhuma parcela contada duas vezes), a curva -400 e o saldo 600',
        totPagas33() === 400 && r2_33(ultimo33(sd)) === -400 && r2_33(sfis33()) === 600, S33([totPagas33(), ultimo33(sd), sfis33()]));
    });
  });

  /* ---- 33f: a tela do Fluxo de caixa (rotulos, desmarcar, subtitulo) ---- */
  await bloco33('f', () => {
    M().push(compra33('s1', { pgParcelas: marcas33(4) }));
    let html = telaContas33();
    t('33f: a linha da parcela alem do plano diz "4 · fora do plano de 3×" (e nao "4 de 3", que parece conta errada) e as do plano seguem "1 de 3"',
      html.indexOf('4 · fora do plano de 3×') >= 0 && html.indexOf('1 de 3') >= 0 && html.indexOf('4 de 3') < 0, '');
    t('33f: cada linha paga tem o desmarcar dela, inclusive a da parcela 4', html.indexOf("desmarcarParcela('s1',4)") >= 0 && html.indexOf("desmarcarParcela('s1',1)") >= 0, '');
    t('33f: o subtitulo da secao Pagas cita as "parcelas pagas a mais"', html.indexOf('parcelas pagas a mais') >= 0, '');
    const semAtributos = html.replace(/\son\w+="[^"]*"/g, '');
    t('33f: nenhuma palavra estranha na tela (NaN, undefined, null)', !/NaN|undefined|null/.test(semAtributos), (semAtributos.match(/.{20}(NaN|undefined|null).{20}/) || [''])[0]);
    /* plano reduzido a 1x: o rotulo nao pode sumir (senao 3 linhas iguais, todas "paga", sem dizer qual e qual) */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('u1', { nParc: 1, pgParcelas: marcas33(3) }));
    html = telaContas33();
    t('33f: com o plano reduzido a 1x, as parcelas 2 e 3 aparecem como "fora do plano de 1×" e cada uma com o proprio desmarcar',
      html.indexOf('2 · fora do plano de 1×') >= 0 && html.indexOf('3 · fora do plano de 1×') >= 0 && html.indexOf("desmarcarParcela('u1',2)") >= 0 && html.indexOf("desmarcarParcela('u1',3)") >= 0, '');
    /* nota */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('n1', { valor: 200, notaId: 'N9', nParc: 2, pgParcelas: { 1: { d: '2026-02-01', v: 150 }, 2: { d: '2026-03-01', v: 150 }, 3: { d: '2026-04-01', v: 150 } } }));
    M().push(compra33('n2', { valor: 400, notaId: 'N9', nParc: 2 }));
    html = telaContas33();
    t('33f: na nota o rotulo tambem diz "3 · fora do plano de 2×" e o desmarcar aponta pra CABECA da nota (n1), onde a marca mora',
      html.indexOf('3 · fora do plano de 2×') >= 0 && html.indexOf("desmarcarParcela('n1',3)") >= 0, '');
    /* nota com o plano reduzido a 1x: o rotulo tambem nao pode sumir (o "||x.alem" da nota so faz diferenca aqui) */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('w1', { valor: 200, notaId: 'N7', nParc: 1, pgParcelas: { 1: { d: '2026-02-01', v: 200 }, 2: { d: '2026-03-01', v: 100 } } }));
    M().push(compra33('w2', { valor: 100, notaId: 'N7', nParc: 1 }));
    html = telaContas33();
    t('33f: nota com o plano reduzido a 1x: a parcela 2 aparece como "2 · fora do plano de 1×", com o desmarcar da cabeca (w1)',
      html.indexOf('2 · fora do plano de 1×') >= 0 && html.indexOf("desmarcarParcela('w1',2)") >= 0, '');
  });

  /* ---- 33g: a folha impressa ---- */
  await bloco33('g', () => {
    M().push(compra33('s1', { pgParcelas: marcas33(4) }));
    const cap = [];
    ctx.document.body.insertAdjacentHTML = (pos, h) => { cap.push(String(h)); };
    ctx.document.getElementById = idc => ({ checked: idc === 'ps_pagas', value: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, remove() {}, dataset: {} });
    A('imprimirFluxoGo')();
    const papel = cap.join('');
    t('33g: a folha impressa lista a parcela alem do plano na coluna Parc. como 4/3 (as do plano seguem 1/3, 2/3, 3/3)',
      papel.indexOf('4/3') >= 0 && papel.indexOf('1/3') >= 0 && papel.indexOf('2/3') >= 0 && papel.indexOf('3/3') >= 0, (papel.match(/.{0,30}4\/3.{0,30}/) || [papel.slice(0, 120)])[0]);
    t('33g: a folha impressa nao tem NaN nem undefined', papel.length > 200 && !/NaN|undefined/.test(papel), papel.slice(0, 120));
    /* plano reduzido a 1x: a coluna Parc. tambem tem de dizer qual parcela e qual (o "||x.alem" do papel so faz diferenca aqui) */
    reset(); setg('contasBanc', banco33()); cap.length = 0;
    M().push(compra33('s2', { nParc: 1, pgParcelas: marcas33(2) }));
    A('imprimirFluxoGo')();
    const papel1 = cap.join('');
    t('33g: com o plano reduzido a 1x, a folha impressa mostra a parcela alem do plano como 2/1 e a do plano continua sem numero (1x nao tem "1/1")',
      papel1.indexOf('>2/1<') >= 0 && papel1.indexOf('>1/1<') < 0, (papel1.match(/.{0,40}\/1.{0,20}/) || [papel1.slice(0, 120)])[0]);
    t('33g: a descricao da linha do papel diz "fora do plano de 3×" (so na parcela alem do plano) — no papel a coluna Parc. diz 4/3, que sozinha parece conta errada',
      papel.indexOf('fora do plano de 3×') >= 0 && (papel.match(/fora do plano/g) || []).length === 1, (papel.match(/.{0,50}fora do plano.{0,20}/) || [papel.slice(0, 120)])[0]);
    /* nota com o plano reduzido a 1x, no papel (o "||x.alem" do ramo da NOTA so faz diferenca aqui) */
    reset(); setg('contasBanc', banco33()); cap.length = 0;
    M().push(compra33('w1', { valor: 200, notaId: 'N7', nParc: 1, pgParcelas: { 1: { d: '2026-02-01', v: 200 }, 2: { d: '2026-03-01', v: 100 } } }));
    M().push(compra33('w2', { valor: 100, notaId: 'N7', nParc: 1 }));
    A('imprimirFluxoGo')();
    const papelN = cap.join('');
    t('33g: nota com o plano reduzido a 1x: o papel mostra a parcela 2 como 2/1, com "fora do plano de 1×" na descricao',
      papelN.indexOf('>2/1<') >= 0 && papelN.indexOf('fora do plano de 1×') >= 0, (papelN.match(/.{0,60}\/1.{0,60}/) || [papelN.slice(0, 120)])[0]);
  });

  /* ---- 33h: a Projecao do caixa (por conta, no mesmo escopo do saldo por emissao) ---- */
  await bloco33('h', () => {
    /* A projecao parte do saldo FISICO (a soma de saldoFisicoConta das contas) e so soma o que ainda vai acontecer. Sem parcela a vencer, venda a receber
       nem despesa a pagar ela e IGUAL a ele, por construcao (19/09/2026: o "excedente" que a projecao abatia, e a reconstrucao "por emissao" que o
       exigia, deixaram de existir). Os cenarios do M-1 (parcela paga alem do plano, valor corrigido, duas contas, data-base, troca, nota) provam isso:
       o "hoje" da Projecao e o numero do card Saldo por conta em todos eles. */
    const ig = (rot, esperado) => t('33h: ' + rot + ' — saldo fisico e projecao batem em ' + esperado, r2_33(sfis33()) === esperado && r2_33(proj33()) === esperado, S33([sfis33(), proj33()]));
    /* (R) 4x virou 3x com as 4 pagas e o valor igual */
    M().push(compra33('r1', { valor: 400, pgParcelas: marcas33(4) }));
    ig('4x virou 3x, 4 pagas, valor igual (400)', 600);
    /* (O) valor corrigido pra baixo depois de pagar: saiu 100 alem do valor, e as duas telas enxergam o mesmo dinheiro que saiu */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('o1', { valor: 300, pgParcelas: marcas33(4) }));
    ig('valor corrigido pra 300 depois de pagar 400', 600);
    reset(); setg('contasBanc', banco33());
    M().push(compra33('p2', { valor: 350, pgParcelas: marcas33(4) }));
    ig('valor 350 com 4 pagas de 100', 600);
    /* duas contas: cada compra debita a conta dela */
    reset(); setg('contasBanc', [{ nome: 'X', saldoIni: 1000, saldoData: '' }, { nome: 'Y', saldoIni: 500, saldoData: '' }]);
    M().push(compra33('x1', { valor: 400, conta: 'X', pgParcelas: marcas33(4) }));
    M().push(compra33('y1', { valor: 300, conta: 'Y', pgParcelas: marcas33(4) }));
    const cbX = { nome: 'X', saldoIni: 1000, saldoData: '' }, cbY = { nome: 'Y', saldoIni: 500, saldoData: '' };
    t('33h: duas contas: o saldo fisico total e a projecao batem em 700 (600 em X + 100 em Y)',
      r2_33(A('saldoFisicoConta')(cbX) + A('saldoFisicoConta')(cbY)) === 700 && r2_33(proj33()) === 700,
      S33([A('saldoFisicoConta')(cbX), A('saldoFisicoConta')(cbY), proj33()]));
    /* compra SEM conta: nao entra em saldo nenhum, entao nao pode mexer na projecao */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('c0', { valor: 300, conta: '', pgParcelas: marcas33(4) }));
    t('33h: compra sem conta com parcela alem do plano nao mexe em saldo nem na projecao (ficam em 1000 e 1000)', r2_33(sfis33()) === 1000 && r2_33(proj33()) === 1000, S33([sfis33(), proj33()]));
    /* compra anterior a data-base da conta: ja esta dentro do saldo inicial */
    reset(); const base0601 = { nome: 'X', saldoIni: 1000, saldoData: '2026-06-01' }; setg('contasBanc', [base0601]);
    M().push(compra33('c1', { valor: 300, pgParcelas: marcas33(4) }));
    t('33h: compra anterior a data-base da conta (01/06) nao mexe na projecao nem no saldo fisico (1000 e 1000)', r2_33(A('saldoFisicoConta')(base0601)) === 1000 && r2_33(proj33()) === 1000, S33([A('saldoFisicoConta')(base0601), proj33()]));
    /* zero contas cadastradas (o estado real do Felype hoje): a marca alem do plano nao muda a projecao */
    reset(); setg('contasBanc', []);
    M().push(compra33('z1', { valor: 300, pgParcelas: marcas33(4) }));
    let com, sem, msg = '';
    try { com = proj33(); delete M()[0].pgParcelas; sem = proj33(); } catch (e) { msg = String((e && e.message) || e); }
    t('33h: sem nenhuma conta cadastrada a projecao nao lanca e e a mesma com ou sem a marca alem do plano', !msg && com === sem, S33([msg, com, sem]));
    /* sem marca alem do plano */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('p1', { valor: 300, pgParcelas: marcas33(3) }));
    t('33h: sem marca alem do plano projecao e saldo fisico seguem iguais (700)', r2_33(proj33()) === 700 && r2_33(sfis33()) === 700, S33([proj33(), sfis33()]));
    /* nota: o valor que cobre e a soma dos itens parcelados */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('n1', { valor: 200, notaId: 'N9', nParc: 2, pgParcelas: { 1: { d: '2026-02-01', v: 100 }, 2: { d: '2026-03-01', v: 100 }, 3: { d: '2026-04-01', v: 100 } } }));
    M().push(compra33('n2', { valor: 100, notaId: 'N9', nParc: 2 }));
    t('33h: nota de 300 com 3 pagas de 100 (uma alem do plano): as duas telas batem em 700', r2_33(sfis33()) === 700 && r2_33(proj33()) === 700, S33([sfis33(), proj33()]));
    /* marcas que somam MENOS que o valor */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('f1', { valor: 500, pgParcelas: marcas33(4) }));
    t('33h: valor 500 com 4 pagas de 100 (o valor cobre mais do que foi pago): as duas telas batem em 600', r2_33(sfis33()) === 600 && r2_33(proj33()) === 600, S33([sfis33(), proj33()]));
    /* compra de troca: o saldo fisico a ignora (nao entra em conta nenhuma) */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('k9', { origem: 'TROCA', valor: 300, pgParcelas: marcas33(4) }));
    t('33h: compra de troca com parcela alem do plano: nao mexe no saldo fisico nem na projecao (ficam em 1000 e 1000)', r2_33(sfis33()) === 1000 && r2_33(proj33()) === 1000, S33([sfis33(), proj33()]));
    /* "Parcelado" com nParc 0 (dado antigo): as telas o tratam como a vista */
    reset(); setg('contasBanc', banco33());
    M().push(compra33('j9', { nParc: 0, valor: 100, pgParcelas: marcas33(2) }));
    t('33h: compra "Parcelado" com nParc 0 (dado antigo, tratada como a vista): saldo fisico e projecao batem em 900', r2_33(sfis33()) === 900 && r2_33(proj33()) === 900, S33([sfis33(), proj33()]));
    /* a parcela alem do plano paga de OUTRA conta sai dessa conta (saldo fisico), e o total das duas contas segue batendo com a projecao */
    reset(); setg('contasBanc', [{ nome: 'X', saldoIni: 1000, saldoData: '' }, { nome: 'Y', saldoIni: 500, saldoData: '' }]);
    const pgY = marcas33(4); pgY[4].conta = 'Y';
    M().push(compra33('x2', { valor: 300, conta: 'X', pgParcelas: pgY }));
    const sX = A('saldoFisicoConta')({ nome: 'X', saldoIni: 1000, saldoData: '' }), sY = A('saldoFisicoConta')({ nome: 'Y', saldoIni: 500, saldoData: '' });
    t('33h: parcela alem do plano paga da conta Y: sai de Y (X 700, Y 400) e o total das duas contas bate com a projecao (1100)', r2_33(sX) === 700 && r2_33(sY) === 400 && r2_33(proj33()) === 1100, S33([sX, sY, proj33()]));
    /* ESCOPO PELA MARCA (3a rodada do M-1): quem decide se a parcela alem do plano saiu do saldo fisico e a conta de quem pagou + a data do PAGAMENTO */
    const alvo = (contas, mov, rot, sfEsperado) => {
      reset(); setg('contasBanc', contas.map(c => Object.assign({}, c))); M().push(mov);
      const sf = r2_33(contas.reduce((a, c) => a + A('saldoFisicoConta')(Object.assign({}, c)), 0)), pj = r2_33(proj33());
      t('33h: ' + rot + ' — saldo fisico ' + sfEsperado + ' e a projecao bate com ele', sf === sfEsperado && pj === sfEsperado, S33([sf, pj]));
    };
    alvo([{ nome: 'X', saldoIni: 1000, saldoData: '2026-03-15' }], compra33('g1', { data: '2026-01-10', venc1: '2026-02-01', pgParcelas: { 4: { d: '2026-05-01', v: 100 } } }),
      'compra ANTES da data-base da conta, so a parcela 4 (alem do plano) marcada, paga DEPOIS dela: as parcelas 1 e 2 (01/02 e 01/03) ficam dentro do saldo inicial, a 3 (01/04, vencida sem marca) conta como paga e debita, e a 4 debita', 800);
    alvo([{ nome: 'X', saldoIni: 1000, saldoData: '' }], compra33('g2', { pgParcelas: Object.assign(marcas33(3), { 4: { d: '2026-05-01', v: 100, conta: 'Z' } }) }),
      'parcela alem do plano paga de uma conta EXCLUIDA depois (Z fora do cadastro: nenhum saldo a debita)', 700);
    alvo([{ nome: 'X', saldoIni: 1000, saldoData: '2026-05-01' }], compra33('g3', { data: '2026-05-10', venc1: '2026-05-10', pgParcelas: { 1: { d: '2026-05-10', v: 100 }, 2: { d: '2026-06-10', v: 100 }, 3: { d: '2026-07-10', v: 100 }, 4: { d: '2026-04-01', v: 100 } } }),
      'parcela alem do plano paga ANTES da data-base da conta, compra depois dela (a marca ja esta no saldo inicial)', 700);
    alvo([{ nome: 'X', saldoIni: 1000, saldoData: '2026-04-01' }], compra33('g4', { data: '2026-01-10', valor: 500, venc1: '2026-02-01',
      pgParcelas: { 1: { d: '2026-02-01', v: 100 }, 2: { d: '2026-03-01', v: 100 }, 3: { d: '2026-03-20', v: 100 }, 4: { d: '2026-05-01', v: 100 } } }),
      'compra ANTES da data-base cujo valor nao foi todo pago (as 3 do plano ficaram dentro do saldo inicial): a parcela alem do plano paga depois da data-base sai do saldo fisico', 900);
    /* dois cadastros com o MESMO nome (o app nao barra dado antigo): saldoFisicoConta debita nos dois, e a projecao e a soma deles */
    reset(); setg('contasBanc', [{ nome: 'X', saldoIni: 1000, saldoData: '' }, { nome: 'X', saldoIni: 0, saldoData: '' }]);
    M().push(compra33('dup', { valor: 300, pgParcelas: marcas33(4) }));
    const sfDup = r2_33(g('contasBanc').reduce((a, c) => a + A('saldoFisicoConta')(Object.assign({}, c)), 0));
    t('33h: dois cadastros de conta com o mesmo nome: a projecao e a soma do saldo fisico dos dois — 200 e 200', sfDup === 200 && r2_33(proj33()) === 200, S33([sfDup, proj33()]));
  });

  /* ---- 33i: chave herdada de Object.prototype e custo ---- */
  await bloco33('i', () => {
    M().push(compra33('k1', { notaId: 'constructor', pgParcelas: marcas33(4) }));
    let msg = '';
    try { A('projecaoCaixa')(); A('serieDinheiro')(); A('contasPagas')(); A('aPagar')(); } catch (e) { msg = String((e && e.message) || e); }
    t('33i: nota cujo id e "constructor" (chave herdada de Object.prototype) nao quebra a projecao, a curva nem as listas', !msg, msg);
    reset(); setg('contasBanc', banco33());
    for (let i = 0; i < 4000; i++) M().push(compra33('q' + i, { valor: 30, notaId: 'NT' + Math.floor(i / 3), nParc: 3, pgParcelas: (i % 3 === 0) ? marcas33(4) : undefined }));
    const t0 = Date.now(); A('projecaoCaixa')(); A('serieDinheiro')(); A('contasPagas')(); const ms = Date.now() - t0;
    t('33i: a projecao, a curva e a lista de pagas numa base de 4.000 itens em notas de 3 rodam com folga (menos de 2 s no total) e nao lancam', ms < 2000, ms + ' ms');
  });

  /* ---- 33j: o Diagnostico so afirma o que o codigo faz ---- */
  await bloco33('j', () => {
    const achados = () => A('provaReal')().A.filter(x => /^Parcela (paga a mais|marcada numa compra)/.test(x.titulo));
    const casos = [
      ['V1 parcelada + chave canonica + data ISO: diz que JA ESTA CONTADA e como acertar', compra33('d1', { pgParcelas: marcas33(4) }),
        x => /^Parcela paga a mais do que o plano da compra: /.test(x.titulo) && /já está contada \(Fluxo de caixa › pagas, saldos e gráfico de dinheiro\)/.test(x.detalhe)
          && /Se ela foi paga de verdade, acerte o nº de parcelas da compra: o botão abaixo abre o lançamento/.test(x.detalhe)
          && /Só desmarque a parcela se esse pagamento nunca aconteceu \(Fluxo de caixa › pagas, com o período em "tudo"\)/.test(x.detalhe) && x.detalhe.indexOf(' ou desmarque') < 0,
        () => r2_33(sfis33()) === 600 && alem33().length === 1],
      ['V1 sem data na compra: a lista de pagas nao exige mais a data da compra (o 1o vencimento manda), entao o texto promete as tres telas e elas contam de fato', compra33('d1', { data: '', pgParcelas: marcas33(4) }),
        x => /já está contada \(Fluxo de caixa › pagas, saldos e gráfico de dinheiro\)/.test(x.detalhe),
        () => r2_33(sfis33()) === 600 && alem33().length === 1 && r2_33(ultimo33(A('serieDinheiro')())) === -400],
      ['V2 parcelada com a marca invalida (data torta): diz que NAO entra nas contas e o saldo confirma (so as 3 do plano)', compra33('d1', { pgParcelas: Object.assign(marcas33(3), { 4: { d: '01/05/2026', v: 100 } }) }),
        x => /^Parcela paga a mais do que o plano da compra: /.test(x.titulo) && /não entra nas contas \(data inválida ou número fora do padrão\)/.test(x.detalhe) && x.detalhe.indexOf('já está contada') < 0,
        () => r2_33(sfis33()) === 700 && alem33().length === 0],
      ['V3 compra editada pra a vista com as marcas: diz que a marca NAO conta em conta nenhuma (o valor inteiro ja conta na data da compra) e nao fala em "0×"',
        compra33('d1', { pgTipo: 'À vista', nParc: 0, pgParcelas: marcas33(2) }),
        x => /^Parcela marcada numa compra que hoje é à vista: /.test(x.titulo) && /essa compra não é mais parcelada/.test(x.detalhe) && /não entra em conta nenhuma/.test(x.detalhe) && x.detalhe.indexOf('0×') < 0,
        () => r2_33(sfis33()) === 700 && totPagas33() === 300 && alem33().length === 0],
      ['V4 compra de troca que virou parcelada: diz que NENHUMA tela de dinheiro conta a marca (M-A, 19/09/2026: aPagar e contasPagas passaram a ignorar `origem`, como os saldos e a curva)', compra33('d1', { origem: 'TROCA', pgParcelas: marcas33(4) }),
        x => /^Parcela marcada numa compra de troca ou de caixa aberta: /.test(x.titulo) && /Nenhuma tela de dinheiro conta essa marca/.test(x.detalhe),
        () => r2_33(sfis33()) === 1000 && alem33().length === 0 && totPagas33() === 0 && A('aPagar')().length === 0 && r2_33(ultimo33(A('serieDinheiro')())) === 0],
    ];
    /* a marca que nenhum saldo debita (pagamento antes da data-base da conta; conta de quem pagou fora do cadastro): o texto NAO promete "saldos" */
    const cbBase51 = { nome: 'X', saldoIni: 1000, saldoData: '2026-05-01' };
    casos.push(
      ['V1 com a marca paga ANTES da data-base da conta: o texto so promete a lista de pagas e o grafico (nenhum saldo a debita)',
        compra33('d1', { data: '2026-05-10', venc1: '2026-05-10', pgParcelas: { 1: { d: '2026-05-10', v: 100 }, 2: { d: '2026-06-10', v: 100 }, 3: { d: '2026-07-10', v: 100 }, 4: { d: '2026-04-01', v: 100 } } }),
        x => /já está contada \(Fluxo de caixa › pagas e gráfico de dinheiro\)/.test(x.detalhe) && x.detalhe.indexOf('saldos') < 0,
        () => r2_33(A('saldoFisicoConta')(cbBase51)) === 700 && alem33().length === 1, [cbBase51]],
      ['V1 com a marca paga de uma conta que nao esta mais no cadastro: idem, sem "saldos"',
        compra33('d1', { pgParcelas: Object.assign(marcas33(3), { 4: { d: '2026-05-01', v: 100, conta: 'Z' } }) }),
        x => /já está contada \(Fluxo de caixa › pagas e gráfico de dinheiro\)/.test(x.detalhe) && x.detalhe.indexOf('saldos') < 0,
        () => r2_33(sfis33()) === 700 && alem33().length === 1, null]);
    casos.forEach(([rot, mov, okTexto, okRealidade, contas]) => {
      reset(); setg('contasBanc', contas || banco33());
      M().push(mov);
      const a = achados();
      t('33j: ' + rot + ' — o texto', a.length >= 1 && okTexto(a[0]), S33(a.map(x => [x.titulo, x.detalhe])));
      t('33j: ' + rot + ' — e a realidade das telas bate com o que o texto promete', okRealidade(), S33([sfis33(), alem33().length, totPagas33()]));
    });
    reset(); setg('contasBanc', banco33());
    M().push(compra33('d9', { pgParcelas: marcas33(3) }));
    t('33j: sem marca alem do plano o Diagnostico nao acusa nada desta classe', achados().length === 0, S33(achados()));
  });

  /* ---- 33k: o aviso do grafico ---- */
  await bloco33('k', () => {
    M().push(compra33('a1', { pgParcelas: marcas33(4) }));
    const gr = (cx, col) => A('graficoLinhaEstoque')(A('serieEstoque')(), A('serieDinheiro')(), A('serieColecao')(), cx, col);
    const ligado = gr(true, false), desligado = gr(false, false);
    t('33k: com o dinheiro ligado o grafico avisa "1 parcela paga a mais do que o plano da compra (R$ 100,00)" e diz que o dinheiro esta contado',
      ligado.indexOf('1 parcela paga a mais do que o plano da compra (' + fmt33(100) + ')') >= 0 && ligado.indexOf('Esse dinheiro está contado aqui') >= 0, (ligado.match(/parcela[^<]{0,160}/) || [''])[0]);
    t('33k: com o dinheiro desligado o aviso some (como os outros avisos do dinheiro)', desligado.indexOf('paga a mais do que o plano') < 0, '');
    t('33k: nenhum dos dois traz NaN ou undefined', !/NaN|undefined/.test(ligado + desligado), '');
  });

  /* ---- 33l: lote fracionado (G-1): a marca alem do plano e REPARTIDA entre pai e filho, sem objeto compartilhado ---- */
  await bloco33('l', () => {
    M().push(compra33('p1', { qtd: 3, pgParcelas: marcas33(4) }));
    const filho = A('baixarLote')('p1', 1, 'Vendido', { dataVenda: '2026-06-01', dataSaida: '2026-06-01' });
    const sd = A('serieDinheiro')();
    t('33l: lote fracionado (G-1, 19/09/2026): o pedaco nasce SEM pgParcelas e a marca alem do plano fica inteira no dono da compra — R$ 100 de parcela paga a mais, contados UMA vez, nem 1 centavo a mais nem a menos',
      filho.id !== 'p1' && filho.pgParcelas === undefined && r2_33(M()[0].pgParcelas[4].v) === 100 && sd.pagasAlem === 1 && r2_33(sd.pagasAlemValor) === 100 && r2_33(ultimo33(sd)) === -400,
      S33([filho.pgParcelas, M()[0].pgParcelas[4], sd.pagasAlem, sd.pagasAlemValor, ultimo33(sd)]));
    setg('movs', JSON.parse(JSON.stringify(M())));
    const sd2 = A('serieDinheiro')(), al2 = alem33();
    t('33l: e depois de RECARREGAR o app (JSON.parse) o resultado e o mesmo: a parcela alem do plano conta uma vez na curva (-400), na lista de pagas (1 linha) e no saldo (600)',
      sd2.pagasAlem === 1 && r2_33(sd2.pagasAlemValor) === 100 && r2_33(ultimo33(sd2)) === -400 && al2.length === 1 && r2_33(sfis33()) === 600, S33([sd2.pagasAlem, ultimo33(sd2), al2.length, sfis33()]));
  });

  /* ---- 33m: o texto do desmarcar diz o que de fato acontece ---- */
  await bloco33('m', () => {
    M().push(compra33('s1', { pgParcelas: marcas33(4) }));
    const msgs = [], toasts = [];
    let resp = false;
    ctx.confirm = q => { msgs.push(String(q)); return resp; };
    setg('toast', m => { toasts.push(String(m)); });
    A('desmarcarParcela')('s1', 4);
    t('33m: cancelar o desmarcar nao apaga a marca (a pergunta foi feita 1 vez e nada foi avisado)', msgs.length === 1 && (4 in M()[0].pgParcelas) && toasts.length === 0, S33([msgs.length, Object.keys(M()[0].pgParcelas), toasts]));
    resp = true;
    A('desmarcarParcela')('s1', 4);
    A('desmarcarParcela')('s1', 3);
    t('33m: parcela FORA do plano: a pergunta diz que ela deixa de contar como paga e NAO volta pro "a pagar" (nao existe "a pagar" pra ela); a do plano segue "Ela volta pro a pagar"',
      msgs.length === 3 && /fora do plano da compra \(3×\)/.test(msgs[1]) && /não volta pro "a pagar"/.test(msgs[1]) && msgs[1].indexOf('Ela volta') < 0 && /Ela volta pro "a pagar"/.test(msgs[2]),
      S33(msgs));
    t('33m: a pergunta da parcela fora do plano protege quem pagou de verdade: manda cancelar e acertar o nº de parcelas da compra (desmarcar deixaria o saldo fisico dizendo que saiu menos dinheiro do que saiu)',
      /Se esse pagamento aconteceu de verdade, cancele e acerte o nº de parcelas da compra/.test(msgs[1]) && msgs[2].indexOf('cancele') < 0, S33(msgs));
    t('33m: o aviso na tela tambem: "deixou de contar como paga" pra fora do plano e "voltou pro a pagar" pra do plano',
      toasts.length === 2 && /deixou de contar como paga/.test(toasts[0]) && /voltou pro a pagar/.test(toasts[1]), S33(toasts));
    /* plano fracionario (dado antigo): a parcela 4 de um plano de 3,5 e parcela DO plano (as listas de pagar/pagas usam o teto), entao volta pro "a pagar" */
    reset(); setg('contasBanc', banco33()); msgs.length = 0;
    M().push(compra33('f1', { nParc: 3.5, pgParcelas: marcas33(4) }));
    A('desmarcarParcela')('f1', 4);
    t('33m: plano fracionario (3,5): a parcela 4 e do plano (teto), entao a pergunta diz "Ela volta pro a pagar" e nao fala em fora do plano',
      msgs.length === 1 && /Ela volta pro "a pagar"/.test(msgs[0]) && msgs[0].indexOf('fora do plano') < 0, S33(msgs));
  });

  /* ---- 33n: peca vendida ANTES de chegar e depois CONFIRMADA nao volta pra Pedido quando a venda e desfeita ---- */
  await bloco33('n', () => {
    const vd = A('voltaDe');
    t('33n: venda de peca vendida antes de chegar (vendaDe pedido), chegada NAO confirmada: volta pra Pedido', vd({ vendaDe: 'pedido' }, {}) === 'Pedido' && vd({ vendaDe: 'pedido' }, null) === 'Pedido', '');
    t('33n: a mesma peca com dataChegada gravada ja esta na mao: volta pra Em estoque', vd({ vendaDe: 'pedido' }, { dataChegada: '2026-09-10' }) === 'Em estoque', '');
    t('33n: venda de colecao volta pra Coleção mesmo com dataChegada; venda normal e venda ausente voltam pra Em estoque',
      vd({ vendaTipo: 'colecao', vendaDe: 'pedido' }, { dataChegada: '2026-09-10' }) === 'Coleção' && vd({ vendaDe: 'estoque' }, {}) === 'Em estoque' && vd(null, {}) === 'Em estoque' && vd(undefined, undefined) === 'Em estoque', '');
    /* ponta a ponta: pre-venda -> chegada confirmada -> excluir a venda devolvendo o produto */
    ctx.confirm = () => true;
    M().push(compra33('vp', { pgTipo: 'À vista', nParc: 0, qtd: 2, valor: 200, situacao: 'Pedido', destino: 'Vender', conta: '' }));
    let pv = preVenda33('vp', 1, 'Fulano');
    A('chegouPeca')(pv.peca.id);
    A('execExcl')(pv.venda.id, 'vendaVolta');
    let peca = M().find(m => m.id === pv.peca.id);
    let mt = A('motor')();
    t('33n: peca pre-vendida com chegada CONFIRMADA e venda excluida "devolvendo o produto": volta pra Em estoque, mantem a dataChegada e entra no estoque disponivel (100; os outros 100 seguem no pedido)',
      A('sitDe')(peca) === 'Em estoque' && !!peca.dataChegada && r2_33(mt.estoque) === 100 && r2_33(mt.pedido) === 100, S33([A('sitDe')(peca), peca.dataChegada, mt.estoque, mt.pedido]));
    reset(); setg('contasBanc', banco33());
    M().push(compra33('vq', { pgTipo: 'À vista', nParc: 0, qtd: 2, valor: 200, situacao: 'Pedido', destino: 'Vender', conta: '' }));
    pv = preVenda33('vq', 1, 'Fulano');
    A('execExcl')(pv.venda.id, 'vendaVolta');
    peca = M().find(m => m.id === pv.peca.id);
    mt = A('motor')();
    t('33n: a mesma peca SEM chegada confirmada volta pra Pedido (ainda nao chegou — o que o desfazer sempre fez): estoque 0 e pedido 200',
      A('sitDe')(peca) === 'Pedido' && !peca.dataChegada && r2_33(mt.estoque) === 0 && r2_33(mt.pedido) === 200, S33([A('sitDe')(peca), peca.dataChegada, mt.estoque, mt.pedido]));
    /* os outros dois caminhos que devolvem a peca: a DEVOLUCAO (execDev) e o "desfazer vinculo" (desvincular) */
    const caminho = (rot, id0, confirmada, agir) => {
      reset(); setg('contasBanc', banco33()); ctx.confirm = () => true;
      M().push(compra33(id0, { pgTipo: 'À vista', nParc: 0, qtd: 2, valor: 200, situacao: 'Pedido', destino: 'Vender', conta: '' }));
      const v = preVenda33(id0, 1, 'Fulano');
      if (confirmada) A('chegouPeca')(v.peca.id);
      agir(v);
      const pc = M().find(m => m.id === v.peca.id), esperado = confirmada ? 'Em estoque' : 'Pedido';
      t('33n: ' + rot + ' — chegada ' + (confirmada ? 'CONFIRMADA' : 'NAO confirmada') + ': a peca volta pra ' + esperado, A('sitDe')(pc) === esperado && !('dataVenda' in pc) && !('vendaRef' in pc), S33([A('sitDe')(pc), pc.dataVenda, pc.vendaRef]));
    };
    caminho('devolucao (execDev)', 'vr1', true, v => A('execDev')(v.venda.id));
    caminho('devolucao (execDev)', 'vr2', false, v => A('execDev')(v.venda.id));
    caminho('desfazer vinculo (desvincular)', 'vr3', true, v => A('desvincular')(v.venda.id));
    caminho('desfazer vinculo (desvincular)', 'vr4', false, v => A('desvincular')(v.venda.id));
  });

  /* ---- 33o: salvar() — nº de parcelas inteiro e a pergunta ao REDUZIR o parcelamento de compra que ja tem parcela paga com numero maior ---- */
  await bloco33('o', () => {
    const campos = {};
    const elCampo = idc => ({
      get value() { return (idc in campos) ? campos[idc] : ''; }, set value(v) { campos[idc] = v; },
      checked: false, textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, children: [],
      appendChild() {}, remove() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, scrollIntoView() {}, focus() {},
      insertAdjacentHTML() {}, getAttribute() { return null; }, setAttribute() {}, removeAttribute() {}, closest() { return null; }, cloneNode() { return elCampo(idc); }
    });
    const avisos = [], perguntas = [];
    let resp = true;
    ctx.alert = m => { avisos.push(String(m)); };
    ctx.confirm = m => { perguntas.push(String(m)); return resp; };
    /* o que o formulario de EDICAO faz: abre a compra, muda o nº de parcelas e toca em salvar */
    const editar = (rec, nParcNovo, extra) => {
      reset(); M().push(rec);
      setg('editId', rec.id); setg('tipoSel', 'COMPRA'); setg('tela', 'lancar'); setg('pgTipo', 'Parcelado'); setg('_fotosPend', []);
      setg('_db', null); setg('_syncReady', false); setg('_restaurando', false); setg('excluidos', {}); setg('_baseH', {});
      Object.keys(campos).forEach(k => delete campos[k]);
      Object.assign(campos, { f_val: String(rec.valor), f_data: rec.data, f_jogo: 'Pokémon', f_cat: 'ETB', f_col: '151', f_idi: '—', f_qtd: String(rec.qtd), f_cp: 'Loja',
        f_sit: 'Em estoque', f_nparc: String(nParcNovo), f_venc1: rec.venc1, f_conta: 'X', f_taxa: '0', f_pg: 'Parcelado' }, extra || {});
      ctx.document.getElementById = elCampo;
      avisos.length = 0; perguntas.length = 0;
      A('salvar')();
      return M().find(m => m.id === rec.id);
    };
    const quatro = () => compra33('s1', { nParc: 4, valor: 400, pgParcelas: marcas33(4) });
    let r = editar(quatro(), 3);
    t('33o: reduzir de 4x pra 3x com a parcela 4 ja paga PERGUNTA antes (1 vez), dizendo que a parcela 4 ja esta marcada como paga, que passa a ficar FORA do plano e que o mais certo e manter o nº de parcelas',
      perguntas.length === 1 && /mudando o parcelamento para 3×/.test(perguntas[0]) && /a parcela 4 já está marcada como paga/.test(perguntas[0]) && /FORA do plano da compra/.test(perguntas[0]) && /o mais certo é manter o número de parcelas/.test(perguntas[0]),
      S33(perguntas));
    t('33o: respondendo OK, a edicao e salva (3x) e a marca da parcela 4 fica onde estava (o dinheiro segue contado)', r.nParc === 3 && (4 in r.pgParcelas) && avisos.length === 0, S33([r.nParc, Object.keys(r.pgParcelas), avisos]));
    resp = false;
    r = editar(quatro(), 3);
    t('33o: respondendo Cancelar, NADA e salvo: a compra segue em 4x com as 4 marcas', perguntas.length === 1 && r.nParc === 4 && Object.keys(r.pgParcelas).length === 4, S33([perguntas.length, r.nParc, Object.keys(r.pgParcelas)]));
    resp = true;
    r = editar(compra33('s2', { nParc: 5, valor: 500, pgParcelas: marcas33(5) }), 3);
    t('33o: com duas parcelas alem do novo plano a pergunta fala no plural: "as parcelas 4, 5 ... elas passam"',
      perguntas.length === 1 && /as parcelas 4, 5 já estão marcadas como pagas/.test(perguntas[0]) && /elas passam a ficar FORA do plano/.test(perguntas[0]), S33(perguntas));
    r = editar(compra33('s3', { nParc: 4, valor: 400, pgParcelas: marcas33(3) }), 3);
    /* [22/09] a pergunta de "marca fora do plano" continua NAO disparando aqui (a parcela 4 nunca foi paga) — mas a de DINHEIRO passou a
       disparar, e com razao: reduzir 4x pra 3x numa compra de R$ 400 com 3 parcelas pagas apaga a 4a do plano, e o pago cai de R$ 400 pra
       R$ 300, com R$ 100 voltando pro saldo da conta. Era exatamente isso que acontecia CALADO ate 21/09. */
    t('33o: reduzir de 4x pra 3x quando a parcela 4 ainda NAO foi paga nao dispara a pergunta de "fora do plano" — mas mostra os numeros do dinheiro que a mudanca mexe (pago 400 -> 300, a pagar 100 -> 0) antes de salvar',
      perguntas.length === 1 && /Mudar o plano assim mexe no dinheiro/.test(perguntas[0]) && /pago R\$ 400,00 → R\$ 300,00/.test(perguntas[0]) && !/marcada como paga/.test(perguntas[0]) && r.nParc === 3, S33([perguntas, r.nParc]));
    r = editar(quatro(), 4);
    t('33o: editar uma compra sem mudar o nº de parcelas nao pergunta nada', perguntas.length === 0 && r.nParc === 4, S33([perguntas, r.nParc]));
    r = editar(compra33('s4', { nParc: 3, valor: 300 }), 2);
    t('33o: compra sem nenhuma parcela paga (sem pgParcelas) reduz sem pergunta', perguntas.length === 0 && r.nParc === 2, S33([perguntas, r.nParc]));
    /* nº de parcelas tem de ser inteiro */
    ['3.5', '-2', '2.9', '999999', '1e3', '121'].forEach(v => {
      r = editar(quatro(), v);
      t('33o: nº de parcelas "' + v + '" e recusado com aviso claro (inteiro, de 1 a 120) e NADA e salvo (a compra segue em 4x)',
        avisos.length === 1 && /inteiro, de 1 a 120/.test(avisos[0]) && perguntas.length === 0 && r.nParc === 4, S33([avisos, perguntas, r.nParc]));
    });
    r = editar(compra33('s10', { nParc: 4, valor: 400 }), '120');
    t('33o: 120 parcelas (o teto) ainda e aceito', avisos.length === 0 && r.nParc === 120, S33([avisos, r.nParc]));
    r = editar(compra33('s5', { nParc: 4, valor: 400 }), '');
    t('33o: campo de parcelas vazio segue valendo 1 (como sempre) — sem aviso de inteiro', avisos.length === 0 && r.nParc === 1, S33([avisos, r.nParc]));
    /* 4a rodada: compra que JA esta na situacao (nParc 3, marca 4) — editar outra coisa nao pergunta nada, e o Cancelar nao pode jogar fora a edicao */
    const jaFora = () => compra33('s6', { nParc: 3, valor: 300, pgParcelas: marcas33(4) });
    r = editar(jaFora(), 3, { f_obs: 'texto novo' });
    t('33o: compra que JA tem a parcela 4 fora do plano de 3x: editar so a observacao NAO pergunta nada e salva (o Cancelar nao joga fora a edicao)',
      perguntas.length === 0 && r.obs === 'texto novo' && r.nParc === 3 && (4 in r.pgParcelas), S33([perguntas, r.obs, r.nParc]));
    r = editar(compra33('s7', { nParc: 3, valor: 300, pgParcelas: marcas33(5) }), 2);
    t('33o: ja com as parcelas 4 e 5 fora do plano de 3x, reduzir pra 2x pergunta SO da que a edicao deixa fora agora (a 3)',
      perguntas.length === 1 && /a parcela 3 já está marcada como paga/.test(perguntas[0]) && perguntas[0].indexOf('4') < 0 && perguntas[0].indexOf('5') < 0, S33(perguntas));
    r = editar(jaFora(), 4);
    t('33o: com a parcela 4 fora do plano de 3x, AUMENTAR pra 4x (o que acerta a compra) nao pergunta nada e a parcela passa a ser do plano',
      perguntas.length === 0 && r.nParc === 4 && A('parcelasAlemDoPlano')(r.pgParcelas, r.nParc).length === 0, S33([perguntas, r.nParc]));
    r = editar(compra33('s8', { origem: 'TROCA', nParc: 4, valor: 400, pgParcelas: marcas33(4) }), 3);
    t('33o: compra de troca (origem) nunca ganha a pergunta (as telas de dinheiro nao a tratam como parcelada)', perguntas.length === 0, S33(perguntas));
    r = editar(compra33('s9', { pgTipo: 'À vista', nParc: 0, valor: 300, pgParcelas: marcas33(4) }), 3);
    t('33o: compra que era a vista e virou 3x com a parcela 4 ja marcada pergunta (a marca passa a contar como fora do plano)',
      perguntas.length === 1 && /a parcela 4 já está marcada como paga/.test(perguntas[0]), S33(perguntas));
    /* a nota: a mesma trava na hora de salvar */
    reset(); avisos.length = 0;
    setg('notaItens', [{ cat: 'ETB', qtd: 1, valor: 100 }]);
    setg('notaHead', { frete: 0, taxa: 0, cp: 'Loja', conta: 'X', sit: 'Em estoque', data: '2026-03-01', num: '', pg: 'Parcelado', nParc: 3.5, venc1: '2026-04-01', obs: '' });
    A('salvarNota')();
    t('33o: nota com "3,5" parcelas e recusada com o mesmo aviso e nada e salvo', avisos.length === 1 && /inteiro, de 1 a 120/.test(avisos[0]) && M().length === 0, S33([avisos, M().length]));
    setg('notaItens', []);
  });
}).catch(e=>{fail++;console.log('  FALHOU  secao 33 explodiu -> '+((e&&e.stack)||e));}).then(async()=>{
  /* ===== 34. O PAGAMENTO E DA COMPRA (a nota, ou a familia do lote); PARCELA VENCIDA SEM MARCA CONTA COMO PAGA; UM RELOGIO SO (19/09/2026) =====
     Pedido do Felype ("pode auditar e revisar e entao resolver as pendencias que restaram"). Desenho em handoffs/anexos-tcg/design-resolucao-
     pendencias-20260919.md (secoes 10 e 11). O que esta secao prova:
       - G-1: dividir o lote (baixarLote, baixarBoosters) NAO cria nem some dinheiro pago: o pedaco nasce sem pgParcelas, as marcas ficam no dono da compra,
         a compra dividida tem UM cronograma (uma linha por parcela, com o total da compra) e tudo segue igual depois de recarregar (JSON.parse);
       - apagar o pedaco que guarda o pagamento passa o pagamento pra quem fica (execExcl, compraSobra reparte por valor entre as compras que sobram);
       - M-C: tirar um item da nota leva a parte dele do pagamento; M-A: abertura/troca nunca entra no cronograma;
       - R1: parcela vencida SEM marca conta como paga no dia do vencimento em TODAS as telas (saldo fisico, curva, projecao, pagas, a pagar);
         vencimento HOJE ainda e a pagar; a marca, quando existe, manda (data, valor e conta reais); marca sem data legivel vale no vencimento;
       - R2: a Projecao parte do saldo FISICO e so soma o que ainda vai acontecer, com escopo (contas cadastradas; o resto vai pra "fora das contas");
       - R3: venda no App com repasse HOJE ainda e "a receber" e o saldo fisico ainda nao a credita;
       - um relogio so (hojeISO, local): 10h, 20h59, 21h01 e 22h30 de Sao Paulo dao o mesmo "hoje" em todas as telas e em quem grava "hoje";
       - vencimento (dia 29-31, data invalida, sem data), plano editado num pedaco vale pra compra inteira, nome de conta repetido, valor gravado que o
         select nao conhece, dica dos pagamentos que o periodo esconde, Diagnostico por compra.
     Cada bloco monta o PROPRIO fixture, congela o relogio quando a data importa e devolve o app ao estado em que o achou (mesmo padrao das secoes 32 e 33). */
  console.log('');
  console.log('=== 34. o pagamento e da compra; parcela vencida sem marca conta como paga; um relogio so ===');
  const S34 = s => JSON.stringify(s);
  const r34 = x => Math.round(x * 100) / 100;
  const fmt34 = g('fmt');
  const compra34 = (idc, extra) => Object.assign({ id: idc, tipo: 'COMPRA', data: '2026-01-10', jogo: 'Pokémon', cat: 'ETB', colecao: '151', qtd: 1, valor: 300,
    situacao: 'Em estoque', destino: 'Vender', contraparte: 'Loja', conta: 'X', pgTipo: 'Parcelado', nParc: 3, venc1: '2026-02-01' }, extra || {});
  const banco34 = nomes => (nomes || ['X']).map(n => ({ nome: n, saldoIni: 1000, saldoData: '' }));
  const sf34 = cb => A('saldoFisicoConta')(Object.assign({}, cb));
  const totSf34 = () => r34(g('contasBanc').reduce((s, cb) => s + sf34(cb), 0));
  const soma34 = L => r34(L.reduce((s, x) => s + x.valor, 0));
  const telaContas34 = () => { A('vContas')(); const ex = {}; g('_ctKeys').forEach(k => { ex[k] = true; }); setg('ctExp', ex); return A('vContas')(); };
  /* a foto dos numeros de dinheiro: dividir, recarregar e apagar/repassar pedaco tem de deixar TUDO igual */
  const foto34 = () => {
    const ap = A('aPagar')().filter(x => x.pi), av = A('aPagar')(true), pg = A('contasPagas')().filter(x => x.pi), sd = A('serieDinheiro')(), pj = A('projecaoCaixa')();
    return { aPagarN: ap.length, aPagar: soma34(ap), vencN: av.length, venc: soma34(av), pagasN: pg.length, pagas: soma34(pg),
      saldos: g('contasBanc').map(cb => r34(sf34(cb))), emissao: g('contasBanc').map(cb => r34(A('saldoConta')(Object.assign({}, cb)))),
      curva: sd.length ? r34(sd[sd.length - 1].total) : 0, semPagar: sd.semPagar, semPagarValor: sd.semPagarValor, pres: sd.presumidas, presValor: sd.presumidasValor, alem: sd.pagasAlem,
      proj: [pj.atual, pj.d30, pj.d60, pj.d90] };
  };
  const vendeu34 = (idPai, qtd, quem, extras) => {
    const ex = Object.assign({ dataVenda: '2026-09-01', dataSaida: '2026-09-01' }, extras || {});
    const peca = A('baixarLote')(idPai, qtd, 'Vendido', ex);
    const venda = { id: 'V_' + peca.id, tipo: 'VENDA', data: ex.dataVenda, valor: 99, origemId: idPai, vendaDe: 'estoque', contraparte: quem || 'Cli', qtd: peca.qtd, custoOrigem: peca.valor };
    M().push(venda);
    if (peca.id !== idPai) peca.vendaRef = venda.id;
    return { peca, venda };
  };
  const G34 = ['contasBanc', 'ctExp', 'ctSec', 'ctPess', 'ctJogo', 'ctConta', 'ctCat', 'perDe', 'perAte', 'perSel', 'fxSelMode', 'fxSel', 'ctAgrupo', '_psec',
    'render', 'toast', 'diarioReg', 'imprimir', 'tela', 'editId', 'tipoSel', 'pgTipo', '_fotosPend', '_db', '_syncReady', '_restaurando', '_baseH', 'excluidos',
    'navHist', '_pendVolta', '_lancarDirty', 'notaItens', 'notaHead', 'pgs'];
  const PLANOS34 = new Set(['ctExp', 'ctSec', 'fxSel', '_psec', '_baseH', 'excluidos', 'notaHead']);
  const copia34 = (v, n) => Array.isArray(v) ? v.slice() : ((PLANOS34.has(n) && v && typeof v === 'object') ? Object.assign({}, v) : v);
  const neutro34 = () => ({ contasBanc: banco34(), ctExp: {}, ctSec: {}, ctPess: '', ctJogo: '', ctConta: '', ctCat: '', perDe: '', perAte: '', perSel: 'tudo',
    fxSelMode: false, fxSel: {}, ctAgrupo: 'mes', _psec: { pagar: true, receber: true, saldo: false, pagas: false, extrato: false },
    render: () => {}, toast: () => {}, diarioReg: () => {}, imprimir: () => {} });
  const FUNCS34 = ['gruposParcelados', 'vencParcelaISO', 'hojeISO', 'dataOk', 'marcasDoGrupo', 'repassaMarcas', 'repartirPagamentos', 'repartePagamentoDaNota', 'separarDaNotaFaz',
    'aPagar', 'aReceber', 'contasPagas', 'saldoFisicoConta', 'saldoConta', 'serieDinheiro', 'projecaoCaixa', 'execExcl', 'baixarLote', 'baixarBoosters', 'desmarcarParcela',
    'confirmarPagarParcela', 'marcarPago', 'salvar', 'salvarConta', 'selOpts', 'provaReal', 'vContas', 'imprimirFluxoGo', 'graficoLinhaEstoque'];
  const faltam34 = FUNCS34.filter(n => { try { return typeof A(n) !== 'function'; } catch (e) { return true; } });
  t('34a: [pre-requisito] o app carregado tem as ' + FUNCS34.length + ' funcoes desta secao', faltam34.length === 0, 'FALTAM no app: ' + faltam34.join(', '));
  const bloco34 = async (rot, corpo, pre) => {
    if (faltam34.length) return;
    const salvos = [];
    const orig = { confirm: ctx.confirm, prompt: ctx.prompt, alert: ctx.alert, geb: ctx.document.getElementById, ins: ctx.document.body.insertAdjacentHTML };
    try {
      G34.forEach(n => { try { salvos.push([n, copia34(g(n), n)]); } catch (e) { /* nome que este build nao tem */ } });
      reset();
      const nz = neutro34();
      Object.keys(nz).forEach(n => { try { setg(n, nz[n]); } catch (e) { /* idem */ } });
      await corpo();
    } catch (e) { t((pre || '34') + rot + ': o bloco explodiu antes de terminar (o que vinha depois dele NAO foi provado)', false, String((e && e.stack) || e).slice(0, 700)); }
    finally {
      ctx.confirm = orig.confirm; ctx.prompt = orig.prompt; ctx.alert = orig.alert; ctx.document.getElementById = orig.geb; ctx.document.body.insertAdjacentHTML = orig.ins;
      descongela();
      salvos.forEach(([n, v]) => { try { setg(n, v); } catch (e) { /* idem */ } });
      reset();
    }
  };
  const campos34 = {};
  const elCampo34 = idc => ({
    get value() { return (idc in campos34) ? campos34[idc] : ''; }, set value(v) { campos34[idc] = v; },
    checked: false, textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, children: [],
    appendChild() {}, remove() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, scrollIntoView() {}, focus() {},
    insertAdjacentHTML() {}, getAttribute() { return null; }, setAttribute() {}, removeAttribute() {}, closest() { return null; }, cloneNode() { return elCampo34(idc); }
  });

  /* ---- 34a: R1 — a parcela vencida SEM marca conta como paga no dia do vencimento, em todas as telas ---- */
  await bloco34('a', () => {
    congela(2026, 9, 21, 10, 0);
    M().push(compra34('a1', { valor: 300, nParc: 3, venc1: '2026-08-15' }));      /* 15/08 e 15/09 vencidas sem marca; 15/10 a vencer */
    const av = A('aPagar')(true), ap = A('aPagar')().filter(x => x.pi), pg = A('contasPagas')(), sd = A('serieDinheiro')(), pj = A('projecaoCaixa')();
    t('34a: as 2 parcelas vencidas sem marca (15/08 e 15/09, R$ 100) ficam em aPagar(true) e a que vence em 15/10 em aPagar(): toda parcela sem marca esta em UMA das duas listas',
      av.length === 2 && ap.length === 1 && S34(av.map(x => x.pi)) === '[1,2]' && ap[0].pi === 3 && r34(ap[0].valor) === 100 && av.every(x => r34(x.valor) === 100), S34([av.map(x => x.pi), ap.map(x => x.pi)]));
    t('34a: a lista de pagas mostra as 2 vencidas como parcela SEM MARCA (presumida), sem o desmarcar — e nao mostra a que ainda vai vencer',
      pg.filter(x => x.presumida).length === 2 && pg.filter(x => x.pagaManual).length === 0 && pg.filter(x => x.pi).length === 2, S34(pg.map(x => [x.pi, x.presumida, x.pagaManual])));
    t('34a: o saldo fisico debita as 2 vencidas (1000 - 200 = 800)', r34(sf34(g('contasBanc')[0])) === 800, String(sf34(g('contasBanc')[0])));
    t('34a: a curva sai -100 em 15/08 e -200 em 15/09, avisa 1 a vencer (R$ 100) e 2 contadas como pagas (R$ 200, com conta cadastrada: nenhuma "sem conta")',
      S34(sd) === S34([{ data: '2026-08-15', total: -100 }, { data: '2026-09-15', total: -200 }]) && sd.semPagar === 1 && sd.semPagarValor === 100 && sd.presumidas === 2 && sd.presumidasValor === 200 && sd.presSemConta === 0,
      S34([sd, sd.semPagar, sd.presumidas, sd.presumidasValor, sd.presSemConta]));
    t('34a: a projecao parte de 800 (o saldo fisico) e so a parcela de 15/10 entra nos horizontes: +30 dias = 700',
      pj.atual === 800 && pj.d30 === 700 && pj.d60 === 700 && pj.d90 === 700 && pj.temContas === true, S34(pj));
    /* sem contas cadastradas: a curva conta quantas das vencidas estao "sem conta" */
    setg('contasBanc', []);
    const sd2 = A('serieDinheiro')();
    t('34a: sem conta cadastrada as 2 vencidas contadas como pagas dizem que estao sem conta (R$ 200 que nao entram em saldo nenhum)', sd2.presumidas === 2 && sd2.presSemConta === 2 && sd2.presSemContaValor === 200, S34([sd2.presumidas, sd2.presSemConta, sd2.presSemContaValor]));
  });

  /* ---- 34b: o dia do vencimento (hoje = a pagar) e o dia do repasse (R3) ---- */
  await bloco34('b', () => {
    congela(2026, 9, 21, 10, 0);
    M().push(compra34('b1', { valor: 200, nParc: 2, venc1: '2026-09-21', data: '2026-09-01' }));       /* a 1a vence HOJE, a 2a em 21/10 */
    const cb = g('contasBanc')[0];
    t('34b: a parcela que vence HOJE ainda e "a pagar" (as 2 estao em aPagar(), nenhuma em aPagar(true)) e nao entra no saldo fisico (1000) nem na curva (semPagar 2, R$ 200)',
      A('aPagar')().filter(x => x.pi).length === 2 && A('aPagar')(true).length === 0 && sf34(cb) === 1000 && A('serieDinheiro')().semPagar === 2 && A('serieDinheiro')().length === 0
      && A('contasPagas')().filter(x => x.pi).length === 0,
      S34([A('aPagar')().filter(x => x.pi).length, sf34(cb), A('serieDinheiro')(), A('contasPagas')().filter(x => x.pi).length]));
    M().push({ id: 'b2', tipo: 'VENDA', data: '2026-09-07', valor: 100, taxa: 10, canal: 'App', recDias: 14, conta: 'X', contraparte: 'Cli', qtd: 1 });     /* repasse: 21/09 = hoje */
    t('34b: venda no App com repasse HOJE ainda e "a receber" e o saldo fisico ainda NAO a credita (1000) — os dois lados do dia concordam',
      A('aReceber')().length === 1 && sf34(cb) === 1000, S34([A('aReceber')().length, sf34(cb)]));
    congela(2026, 9, 22, 10, 0);
    t('34b: no dia seguinte o repasse ja caiu (sai do a receber, o saldo credita o liquido 90) e a parcela de 21/09 virou vencida sem marca (-100): 1000 + 90 - 100 = 990',
      A('aReceber')().length === 0 && sf34(cb) === 990 && A('aPagar')(true).length === 1, S34([A('aReceber')().length, sf34(cb), A('aPagar')(true).length]));
  });

  /* ---- 34c: a marca manda (data, valor e conta reais) e marcar com os valores presumidos nao muda nada ---- */
  await bloco34('c', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X', 'Y']));
    M().push(compra34('c1', { valor: 300, nParc: 3, venc1: '2026-08-15' }));
    /* a lista de "vencidas sem marca" e os contadores dela encolhem por definicao (a parcela agora TEM marca); todo o resto do dinheiro fica igual */
    const semVenc = f => { const c = Object.assign({}, f); ['vencN', 'venc', 'pres', 'presValor'].forEach(k => delete c[k]); return c; };
    const antes = foto34();
    M()[0].pgParcelas = { 1: { d: '2026-08-15', v: 100, conta: 'X' } };
    t('34c: marcar a parcela vencida com os valores que o app ja presumia (dia do vencimento, R$ 100, conta da compra) nao muda NENHUM numero de dinheiro (saldos, curva, pagas, a vencer, projecao); so a lista de vencidas sem marca encolhe (2 -> 1)',
      S34(semVenc(foto34())) === S34(semVenc(antes)) && antes.vencN === 2 && foto34().vencN === 1, S34([foto34(), antes]));
    M()[0].pgParcelas = { 1: { d: '2026-09-01', v: 90, conta: 'Y' } };
    const cbX = g('contasBanc')[0], cbY = g('contasBanc')[1], sd = A('serieDinheiro')(), pg = A('contasPagas')().filter(x => x.pi);
    t('34c: a marca manda: parcela 1 paga de Y em 01/09 por R$ 90 — X debita so a vencida sem marca (1000 - 100), Y debita os 90 (910)',
      r34(sf34(cbX)) === 900 && r34(sf34(cbY)) === 910, S34([sf34(cbX), sf34(cbY)]));
    t('34c: a curva pos a marca na data dela (-90 em 01/09) e a vencida sem marca no vencimento (-190 em 15/09); a lista de pagas traz a marcada com o valor pago (90) e o desmarcar',
      S34(sd) === S34([{ data: '2026-09-01', total: -90 }, { data: '2026-09-15', total: -190 }]) && pg.filter(x => x.pagaManual && r34(x.valor) === 90).length === 1 && pg.length === 2,
      S34([sd, pg.map(x => [x.pi, x.valor, x.pagaManual, x.presumida])]));
  });

  /* ---- 34d: marca sem data legivel: o saldo e a curva contam JUNTOS, no dia do vencimento (antes o saldo debitava e a curva nao) ---- */
  await bloco34('d', () => {
    congela(2026, 9, 21, 10, 0);
    M().push(compra34('d1', { valor: 300, nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { v: 100 }, 2: 'lixo' } }));
    let msg = '';
    try { A('contasPagas')(); A('aPagar')(); telaContas34(); A('projecaoCaixa')(); } catch (e) { msg = String((e && e.message) || e); }
    const sd = A('serieDinheiro')(), cb = g('contasBanc')[0];
    t('34d: marca sem data (parcela 1) e marca com "data" que nao e data (parcela 2) valem no dia do vencimento: curva -100 em 15/08 e -200 em 15/09, saldo 800 — e nenhuma tela lanca',
      !msg && S34(sd) === S34([{ data: '2026-08-15', total: -100 }, { data: '2026-09-15', total: -200 }]) && sf34(cb) === 800, S34([msg, sd, sf34(cb)]));
  });

  /* ---- 34e: o vencimento de cada parcela ---- */
  await bloco34('e', () => {
    congela(2026, 9, 21, 10, 0);
    const v = (b, i, extra) => A('vencParcelaISO')(Object.assign({ venc1: b, data: '2026-01-05' }, extra || {}), i);
    t('34e: dia 31 cai no ultimo dia do mes mais curto (31/01 -> 28/02 -> 31/03 -> 30/04) em vez de pular pro mes seguinte, e em ano bissexto vale 29/02',
      S34([1, 2, 3, 4].map(i => v('2026-01-31', i))) === S34(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']) && v('2028-01-31', 2) === '2028-02-29' && v('2026-01-29', 2) === '2026-02-28' && v('2026-01-30', 2) === '2026-02-28',
      S34([1, 2, 3, 4].map(i => v('2026-01-31', i))));
    t('34e: a virada do ano (30/11 -> 30/12 -> 30/01 do ano seguinte; 31/12 -> 31/01 -> 28/02)', v('2026-11-30', 3) === '2027-01-30' && v('2026-12-31', 2) === '2027-01-31' && v('2026-12-31', 3) === '2027-02-28', S34([v('2026-11-30', 3), v('2026-12-31', 2), v('2026-12-31', 3)]));
    t('34e: 1o vencimento invalido cai na data da compra; sem nenhuma data legivel devolve vazio', v('2026-13-45', 2, { data: '2026-05-10' }) === '2026-06-10' && v('2026-02-30', 1, { data: '2026-05-10' }) === '2026-05-10' && v('', 1, { data: '' }) === '' && v('lixo', 1, { data: '' }) === '',
      S34([v('2026-13-45', 2, { data: '2026-05-10' }), v('2026-02-30', 1, { data: '2026-05-10' }), v('', 1, { data: '' })]));
    let mono = true;
    ['2026-01-29', '2026-01-30', '2026-01-31', '2026-03-31', '2026-08-31', '2026-12-31', '2028-02-29'].forEach(b => { for (let i = 1; i < 36; i++) if (v(b, i) > v(b, i + 1)) mono = false; });
    t('34e: o vencimento nunca anda pra tras: a parcela i+1 vence no mesmo dia ou depois da i (36 parcelas, 7 datas-base de borda)', mono, '');
    M().push(compra34('e1', { valor: 300, nParc: 3, data: '', venc1: '' }));
    const ap = A('aPagar')(), av = A('aPagar')(true);
    t('34e: compra sem nenhuma data legivel NUNCA some: as 3 parcelas ficam em "a pagar" com vencimento hoje, nao entram como vencidas e nao lancam',
      ap.filter(x => x.pi).length === 3 && av.length === 0 && ap.every(x => !x.pi || (r34(x.valor) === 100 && isFinite(x.venc.getTime()))), S34([ap.length, av.length]));
    M().push(compra34('e2', { valor: 300, nParc: 3, data: '2026-08-01', venc1: '2026-13-45' }));
    const diag = A('provaReal')().A.filter(x => /^Vencimento inválido em compra parcelada/.test(x.titulo));
    t('34e: e o Diagnostico acusa o vencimento invalido — sem nenhuma data (e1) e com o 1o vencimento torto mas a data da compra boa (e2) — dizendo o que o app faz (conta a partir da data da compra, ou como "a vencer hoje")',
      diag.length === 2 && diag.every(x => /a vencer hoje/.test(x.detalhe)), S34(diag.map(x => [x.titulo, x.detalhe])));
    t('34e: a compra com o 1o vencimento torto (e2) usa a data da compra: 3 parcelas 01/08, 01/09 (vencidas sem marca) e 01/10 (a vencer)', A('aPagar')(true).filter(x => x.m.id === 'e2').length === 2 && A('aPagar')().filter(x => x.pi && x.m.id === 'e2').length === 1, S34([A('aPagar')(true).length, A('aPagar')().length]));
  });

  /* ---- 34f: G-1 — dividir o lote nao muda nenhum numero de dinheiro; um cronograma por compra ---- */
  await bloco34('f', () => {
    congela(2026, 9, 21, 10, 0);
    M().push(compra34('f1', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-14', v: 100 } } }));
    const f0 = foto34();
    const p1 = A('baixarLote')('f1', 1, 'Vendido', { dataVenda: '2026-09-01', dataSaida: '2026-09-01' });
    const p2 = A('baixarLote')('f1', 1, 'Coleção', { dataSaida: '2026-09-02' });
    const pai = M().find(m => m.id === 'f1');
    t('34f: os pedacos nascem SEM pgParcelas (nenhum objeto compartilhado) e o pai guarda a marca inteira', p1.pgParcelas === undefined && p2.pgParcelas === undefined && pai.pgParcelas[1].v === 100 && pai.qtd === 1, S34([p1.pgParcelas, p2.pgParcelas, pai.pgParcelas]));
    t('34f: dividir o lote em 3 pedacos nao muda NENHUM numero: a pagar, vencidas, pagas, saldos, por emissao, curva, avisos e projecao', S34(foto34()) === S34(f0), S34([foto34(), f0]));
    const ap = A('aPagar')().filter(x => x.pi), pg = A('contasPagas')().filter(x => x.pi);
    t('34f: a compra dividida tem UMA linha por parcela (nao uma por pedaco), com o valor da parcela da compra inteira (100), o total (300) e a marca "3 pedacos da mesma compra"',
      ap.length === 1 && pg.length === 2 && ap[0].tot === 300 && r34(ap[0].valor) === 100 && ap[0].fam && ap[0].fam.n === 3 && ap[0].m.id === 'f1', S34([ap.length, pg.length, ap[0] && ap[0].fam]));
    const html = telaContas34();
    t('34f: a tela do Fluxo de caixa diz "3 pedacos da mesma compra" e o total 300 na linha da parcela; e a lista de Pagas nao chama de "atrasado" o que ja foi pago (a de a pagar so chama o que de fato passou da data)',
      html.indexOf('3 pedaços da mesma compra') >= 0 && html.indexOf(fmt34(300)) >= 0 && html.indexOf('atrasado') < 0, (html.match(/.{40}atrasado.{20}/) || [''])[0]);
    setg('movs', JSON.parse(JSON.stringify(M())));
    t('34f: e depois de RECARREGAR o app (JSON.parse) tudo segue igual — o pagamento nao passa a contar em dobro', S34(foto34()) === S34(f0), S34([foto34(), f0]));
    /* boosters: a caixa vira pedaco de 3 boosters + booster solto + o resto da caixa (divisao em 3) */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('f2', { valor: 800, qtd: 2, cat: 'Booster Box', boosters: 4, nParc: 4, venc1: '2026-07-10', pgParcelas: { 1: { d: '2026-07-10', v: 200 }, 2: { d: '2026-08-11', v: 200 } } }));
    const b0 = foto34();
    const pb = A('baixarBoosters')('f2', 3, 'Vendido', { dataVenda: '2026-09-01', dataSaida: '2026-09-01' });
    const filhos = M().filter(m => m.loteOrigem === 'f2');
    t('34f: divisao de boosters em 3 (3 vendidos + 1 solto + o resto da caixa): os dois filhos nascem sem pgParcelas e nenhum numero de dinheiro muda',
      filhos.length === 2 && filhos.every(x => x.pgParcelas === undefined) && M().find(m => m.id === 'f2').pgParcelas[2].v === 200 && S34(foto34()) === S34(b0), S34([filhos.length, foto34(), b0]));
    setg('movs', JSON.parse(JSON.stringify(M())));
    t('34f: e depois de recarregar, os boosters seguem iguais', S34(foto34()) === S34(b0), S34([foto34(), b0]));
  });

  /* ---- 34g: desmarcar tira a marca de TODOS os pedacos (dado antigo com a mesma marca em dois) ---- */
  await bloco34('g', () => {
    congela(2026, 9, 21, 10, 0);
    M().push(compra34('g1', { valor: 300, qtd: 2, nParc: 3, venc1: '2026-10-10', pgParcelas: { 1: { d: '2026-09-10', v: 100 } } }));
    const g2 = A('baixarLote')('g1', 1, 'Coleção', { dataSaida: '2026-09-11' });
    g2.pgParcelas = { 1: { d: '2026-09-10', v: 100 } };            /* dado antigo: a mesma marca copiada no pedaco */
    t('34g: a marca duplicada em dois pedacos conta UMA vez (pagas 1 linha de 100, curva -100)', A('contasPagas')().filter(x => x.pagaManual).length === 1 && r34(ultimoCurva34()) === -100, S34([A('contasPagas')().filter(x => x.pagaManual).length, ultimoCurva34()]));
    A('desmarcarParcela')('g1', 1);
    t('34g: desmarcar tira a marca dos DOIS pedacos (senao a que sobrasse reapareceria) e a parcela 1 volta pro a pagar, uma vez so',
      !('1' in (M().find(m => m.id === 'g1').pgParcelas || {})) && !('1' in (g2.pgParcelas || {})) && A('aPagar')().filter(x => x.pi === 1).length === 1 && A('contasPagas')().filter(x => x.pagaManual).length === 0,
      S34([M().find(m => m.id === 'g1').pgParcelas, g2.pgParcelas, A('aPagar')().filter(x => x.pi).length]));
    function ultimoCurva34() { const s = A('serieDinheiro')(); return s.length ? s[s.length - 1].total : 0; }
  });

  /* ---- 34h: pagar a parcela de uma compra dividida marca o dono UMA vez, com o "hoje" LOCAL (22h30 ainda e o mesmo dia) ---- */
  await bloco34('h', () => {
    congela(2026, 9, 21, 22, 30);                     /* em UTC ja e 22/09 01h30 */
    M().push(compra34('h1', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-09-25' }));
    A('baixarLote')('h1', 1, 'Vendido', { dataVenda: '2026-09-01', dataSaida: '2026-09-01' });
    A('baixarLote')('h1', 1, 'Coleção', { dataSaida: '2026-09-02' });
    const linha = A('aPagar')().filter(x => x.pi === 1)[0];
    ctx.document.getElementById = idc => elCampo34(idc);
    campos34.pp_conta = 'X';
    A('confirmarPagarParcela')(linha.m.id, 1, 3, 100);
    const marcados = M().filter(m => m.pgParcelas && m.pgParcelas[1]);
    t('34h: pagar a parcela 1 da compra dividida marca UM pedaco (o dono da linha), com a data de HOJE local (21/09, nao 22/09 do UTC), R$ 100 e a conta escolhida',
      marcados.length === 1 && marcados[0].id === linha.m.id && marcados[0].pgParcelas[1].d === '2026-09-21' && marcados[0].pgParcelas[1].v === 100 && marcados[0].pgParcelas[1].conta === 'X', S34(marcados.map(m => [m.id, m.pgParcelas])));
    t('34h: a parcela sai do a pagar (2 restam), entra em pagas uma vez, e o saldo fisico debita 100 hoje', A('aPagar')().filter(x => x.pi).length === 2 && A('contasPagas')().filter(x => x.pagaManual).length === 1 && sf34(g('contasBanc')[0]) === 900,
      S34([A('aPagar')().filter(x => x.pi).length, A('contasPagas')().filter(x => x.pagaManual).length, sf34(g('contasBanc')[0])]));
    /* o dono da compra e quem ja guarda as marcas, mesmo que nao seja o primeiro pedaco: o pagamento novo vai pro MESMO pedaco (senao as marcas se espalham) */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('h3', { valor: 300, qtd: 2, nParc: 3, venc1: '2026-10-10' }));
    const h3f = A('baixarLote')('h3', 1, 'Coleção', { dataSaida: '2026-09-02' });
    h3f.pgParcelas = { 1: { d: '2026-09-10', v: 100 } };                 /* quem guarda o pagamento e o pedaco (nao o primeiro registro) */
    const l2 = A('aPagar')().filter(x => x.pi === 2)[0];
    A('confirmarPagarParcela')(l2.m.id, 2, 3, 100);
    t('34h: o dono e o pedaco que ja guarda a marca (mesmo nao sendo o primeiro): a linha aponta pra ele e o pagamento novo vai pro MESMO pedaco (as marcas nao se espalham)',
      l2.m.id === h3f.id && M().filter(m => m.pgParcelas && m.pgParcelas[2]).length === 1 && h3f.pgParcelas[2] && h3f.pgParcelas[2].v === 100 && M().find(m => m.id === 'h3').pgParcelas === undefined,
      S34(M().map(m => [m.id, m.pgParcelas])));
    /* marcarPago (despesa) grava o mesmo "hoje" local */
    M().push({ id: 'h2', tipo: 'DESPESA', data: '2026-09-20', valor: 10, status: 'apagar', natureza: 'ordinaria', cat: 'Frete', conta: 'X' });
    A('marcarPago')('h2');
    t('34h: marcar uma despesa como paga grava a data de hoje LOCAL (22h30 de 21/09 -> 2026-09-21)', M().find(m => m.id === 'h2').dataPagamento === '2026-09-21', M().find(m => m.id === 'h2').dataPagamento);
  });

  /* ---- 34i: apagar o pedaco que guarda o pagamento NAO apaga o pagamento ---- */
  await bloco34('i', () => {
    congela(2026, 9, 21, 10, 0);
    const soma = () => r34(M().filter(m => m.pgParcelas).reduce((s, m) => s + Object.keys(m.pgParcelas).reduce((a, k) => a + (+(m.pgParcelas[k].v) || 0), 0), 0));
    /* (1) apagar (venda + pedaco) o pedaco que guarda a marca, sobrando outros pedacos */
    M().push(compra34('i1', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15' }));
    const va = vendeu34('i1', 1, 'A'), vb = vendeu34('i1', 1, 'B');
    va.peca.pgParcelas = { 1: { d: '2026-08-15', v: 100, conta: 'X' } };          /* o pedaco A guarda o pagamento (dado antigo ou 2a divisao) */
    const antes = foto34().pagas, pagoAntes = soma();
    A('execExcl')(va.venda.id, 'vendaTudo');
    const sobra = M().filter(m => m.tipo === 'COMPRA');
    t('34i: apagar (venda + peca) o pedaco que guardava a marca passa a marca pra um pedaco que fica: o total PAGO se conserva (R$ 100) e a parcela 1 segue paga uma vez',
      !M().some(m => m.id === va.peca.id) && sobra.length === 2 && soma() === pagoAntes && A('contasPagas')().filter(x => x.pagaManual).length === 1 && r34(A('contasPagas')().filter(x => x.pagaManual)[0].valor) === 100,
      S34([sobra.map(m => [m.id, m.pgParcelas]), soma(), pagoAntes]));
    /* (2) o pedaco apagado nao guardava marca: nada muda no pagamento */
    const vb2 = vb;
    const p0 = soma();
    A('execExcl')(vb2.venda.id, 'vendaTudo');
    t('34i: apagar um pedaco que NAO guardava marca nao mexe no pagamento (mesmo total pago, a marca segue na compra)', soma() === p0 && M().filter(m => m.tipo === 'COMPRA').length === 1 && A('contasPagas')().filter(x => x.pagaManual).length === 1, S34([soma(), p0]));
    /* (3) apagar so o que nao vendeu: os pedacos vendidos viram compras proprias e o pagamento e REPARTIDO por valor entre elas */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('i2', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 100, conta: 'X' } } }));
    const sa = vendeu34('i2', 1, 'A'), sb = vendeu34('i2', 1, 'B');
    const p1 = soma();
    A('execExcl')('i2', 'compraSobra');
    const vivos = M().filter(m => m.tipo === 'COMPRA');
    t('34i: apagar so o que nao vendeu (as 2 pecas vendidas viram compras proprias): o pagamento de R$ 100 e repartido por valor entre elas (50 + 50) e o total pago se conserva',
      vivos.length === 2 && vivos.every(x => !x.loteOrigem && x.pgParcelas && x.pgParcelas[1].v === 50) && soma() === p1 && p1 === 100, S34([vivos.map(m => [m.id, m.loteOrigem, m.pgParcelas]), soma(), p1]));
    t('34i: cada compra que sobrou fecha sozinha: 2 linhas pagas da parcela 1 (50 cada) e 1 vencida sem marca da parcela 2 de cada uma (33,33)', A('contasPagas')().filter(x => x.pagaManual).length === 2 && A('contasPagas')().filter(x => x.presumida).length === 2, S34(A('contasPagas')().map(x => [x.pi, x.valor, x.pagaManual, x.presumida])));
    /* (3b) dado antigo: a marca copiada em varios pedacos (G-1); ao repartir o pagamento entre as compras que sobram, a copia velha (valor cheio) nao pode voltar a valer */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('i4', { valor: 600, qtd: 6, nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 200, conta: 'X' } } }));
    const c1 = vendeu34('i4', 2, 'A'), c2 = vendeu34('i4', 1, 'B');
    const gnt = vendeu34(c1.peca.id, 1, 'A2');                                   /* neto: pedaco de um pedaco vendido */
    c1.peca.pgParcelas = { 1: { d: '2026-08-15', v: 200, conta: 'X' } }; gnt.peca.pgParcelas = { 1: { d: '2026-08-15', v: 200, conta: 'X' } };   /* copias velhas, valor cheio */
    const p4 = soma();
    A('execExcl')('i4', 'compraSobra');
    const gs4 = A('gruposParcelados')();
    const sub1 = gs4.find(x => x.membros.some(m => m.id === c1.peca.id)), sub2 = gs4.find(x => x.membros.some(m => m.id === c2.peca.id));
    t('34i: apagar so o que nao vendeu com COPIAS VELHAS da marca dentro da mesma subfamilia: o pagamento de R$ 200 e repartido por valor (subfamilia do pedaco de 2 un. com o neto = 200 de 300 -> 133,33; a do outro pedaco = 66,67) e a copia de valor cheio nao volta a valer',
      sub1 && sub2 && sub1.membros.length === 2 && r34(sub1.marcas[1].v) === 133.33 && r34(sub2.marcas[1].v) === 66.67 && r34(sub1.marcas[1].v + sub2.marcas[1].v) === 200, S34(gs4.map(x => [x.chave, x.membros.map(m => m.id), x.marcas])));
    /* (4) apagar a compra inteira leva o pagamento junto */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('i3', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 100 } } }));
    vendeu34('i3', 1, 'A');
    A('execExcl')('i3', 'compraTudo');
    t('34i: apagar a compra inteira leva tudo, inclusive o pagamento (nada sobra em movs)', M().filter(m => m.tipo === 'COMPRA').length === 0 && soma() === 0, S34(M().length));
    /* (5) nota: apagar o item que e a cabeca (guarda as marcas) passa as marcas pro proximo item */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('n1', { valor: 100, notaId: 'N1', nParc: 2, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 150, conta: 'X' } } }));
    M().push(compra34('n2', { valor: 200, notaId: 'N1', nParc: 2, venc1: '2026-08-15' }));
    M().push({ id: 'vn1', tipo: 'VENDA', data: '2026-09-01', valor: 99, origemId: 'n1', vendaDe: 'estoque', contraparte: 'Cli', qtd: 1, custoOrigem: 100 });
    M().find(m => m.id === 'n1').vendaRef = 'vn1'; M().find(m => m.id === 'n1').situacao = 'Vendido';
    A('execExcl')('vn1', 'vendaTudo');
    t('34i: nota: apagar o item que era a cabeca (e guardava a marca de R$ 150) passa a marca pro item que fica — a nota segue com a parcela 1 paga (150)',
      !M().some(m => m.id === 'n1') && M().find(m => m.id === 'n2').pgParcelas && M().find(m => m.id === 'n2').pgParcelas[1].v === 150 && A('contasPagas')().filter(x => x.pagaManual).length === 1, S34(M().map(m => [m.id, m.pgParcelas])));
  });

  /* ---- 34j: M-C — tirar um item da nota leva a parte dele do pagamento; pedacos do mesmo lote que saem da nota se somam ---- */
  await bloco34('j', () => {
    congela(2026, 9, 21, 10, 0);
    const somaV = () => r34(M().filter(m => m.pgParcelas).reduce((s, m) => s + Object.keys(m.pgParcelas).reduce((a, k) => a + (+(m.pgParcelas[k].v) || 0), 0), 0));
    const nota = () => { reset(); setg('contasBanc', banco34());
      M().push(compra34('n1', { valor: 100, notaId: 'N1', nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 200, conta: 'X' } } }));
      M().push(compra34('n2', { valor: 200, notaId: 'N1', nParc: 3, venc1: '2026-08-15' }));
      M().push(compra34('n3', { valor: 300, notaId: 'N1', nParc: 3, venc1: '2026-08-15' })); };
    nota();
    A('separarDaNotaFaz')('n2');
    const n2 = M().find(m => m.id === 'n2'), n1 = M().find(m => m.id === 'n1'), n3 = M().find(m => m.id === 'n3');
    t('34j: tirar o item de 200 da nota de 600 (marca de 200 na cabeca) leva 1/3 do pagamento: o item fica com R$ 66,67, a nota com R$ 133,33 e o total pago se conserva (200)',
      !n2.notaId && n2.pgParcelas[1].v === 66.67 && r34((n1.pgParcelas || {})[1] ? n1.pgParcelas[1].v : (n3.pgParcelas || {})[1].v) === 133.33 && somaV() === 200, S34(M().map(m => [m.id, m.notaId, m.pgParcelas])));
    t('34j: o item solto e a nota seguem cada um com o proprio cronograma: linha da nota 3x de 133,33... e a do item 3x de 66,67, sem marca de ninguem sumida',
      A('contasPagas')().filter(x => x.pagaManual).length === 2, S34(A('contasPagas')().map(x => [x.m.id, x.pi, x.valor, x.pagaManual])));
    /* tirar a CABECA: o resto da nota continua com a sua parte */
    nota();
    A('separarDaNotaFaz')('n1');
    const c1 = M().find(m => m.id === 'n1'), r2 = M().filter(m => m.notaId === 'N1');
    t('34j: tirar a cabeca da nota (n1, R$ 100 de 600 = 1/6 do pagamento de 200): ela leva 33,33 e o resto da nota fica com 166,67 num item so (o total pago se conserva)',
      !c1.notaId && c1.pgParcelas[1].v === 33.33 && r2.length === 2 && r2.filter(m => m.pgParcelas).length === 1 && r34(r2.filter(m => m.pgParcelas)[0].pgParcelas[1].v) === 166.67 && somaV() === 200, S34(M().map(m => [m.id, m.notaId, m.pgParcelas])));
    /* dois pedacos do MESMO lote saem da nota, um de cada vez: as partes se SOMAM na compra deles (nao vale a maior) */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('m1', { valor: 300, qtd: 3, notaId: 'N2', nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 90, conta: 'X' } } }));
    M().push(compra34('m9', { valor: 300, notaId: 'N2', nParc: 3, venc1: '2026-08-15' }));       /* outro item da nota: 300 */
    const q1 = A('baixarLote')('m1', 1, 'Coleção', { dataSaida: '2026-09-02' }), q2 = A('baixarLote')('m1', 1, 'Coleção', { dataSaida: '2026-09-03' });
    A('separarDaNotaFaz')(q1.id); A('separarDaNotaFaz')(q2.id);
    const alone = M().filter(m => !m.notaId), noteLeft = M().filter(m => m.notaId === 'N2');
    const parteSolta = alone.reduce((s, m) => s + (m.pgParcelas && m.pgParcelas[1] ? m.pgParcelas[1].v : 0), 0);
    t('34j: dois pedacos do mesmo lote (100 cada, de uma nota de 600 com marca de 90) saem da nota um de cada vez: a parte deles SOMA em vez de valer so a maior — 15 + 15 = 30 na compra deles, 60 fica na nota',
      alone.length === 2 && r34(parteSolta) === 30 && r34(noteLeft.filter(m => m.pgParcelas).reduce((s, m) => s + m.pgParcelas[1].v, 0)) === 60 && somaV() === 90
      && A('gruposParcelados')().find(x => !x.nota && x.chave === 'F:m1').marcas[1].v === 30 && A('gruposParcelados')().find(x => x.nota).marcas[1].v === 60, S34([alone.map(m => [m.id, m.pgParcelas]), noteLeft.map(m => [m.id, m.pgParcelas]), somaV()]));
    /* juntar em nota: compras DIFERENTES com a mesma parcela marcada somam; pedacos do mesmo lote com a marca duplicada (dado antigo) valem uma vez so */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('ja', { valor: 100, nParc: 2, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 50, conta: 'X' } } }));
    M().push(compra34('jb', { valor: 200, nParc: 2, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-16', v: 100, conta: 'X' } } }));
    ctx.prompt = () => '7';
    A('juntarNotaCore')(['ja', 'jb']);
    const gn = A('gruposParcelados')().find(x => x.nota);
    t('34j: juntar em nota duas compras DIFERENTES que ja tinham a parcela 1 marcada (50 e 100) soma o pagamento na nota (150) — o total pago se conserva',
      gn && gn.membros.length === 2 && gn.marcas[1].v === 150 && somaV() === 150, S34(M().map(m => [m.id, m.notaId, m.pgParcelas])));
    reset(); setg('contasBanc', banco34());
    M().push(compra34('jc', { valor: 300, qtd: 3, nParc: 2, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 150, conta: 'X' } } }));
    const jcp = A('baixarLote')('jc', 1, 'Coleção', { dataSaida: '2026-09-02' });
    jcp.pgParcelas = { 1: { d: '2026-08-15', v: 150, conta: 'X' } };                     /* copia antiga do mesmo pagamento */
    M().push(compra34('jd', { valor: 100, nParc: 2, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 50, conta: 'X' } } }));   /* tambem marcada: sem isso a parcela 1 dela, vencida, sumia dentro da marca da outra (revisao de 21/09) */
    const pagoAntes = soma34(A('contasPagas')().filter(x => x.pagaManual));
    A('juntarNotaCore')(['jc', jcp.id, 'jd']);
    const gn2 = A('gruposParcelados')().find(x => x.nota);
    t('34j: juntar em nota pedacos do MESMO lote com a marca duplicada (dado antigo) conta o pagamento UMA vez (150 + os 50 da outra compra = 200, nao 350) e o total pago se conserva',
      gn2 && gn2.membros.length === 3 && gn2.marcas[1].v === 200 && M().filter(m => m.pgParcelas).length === 1 && pagoAntes === 200 && soma34(A('contasPagas')().filter(x => x.pagaManual)) === 200, S34([pagoAntes, M().map(m => [m.id, m.notaId, m.pgParcelas])]));
    /* desfazer a nota reparte o pagamento por valor entre os itens */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('da', { valor: 100, notaId: 'ND', nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 100, conta: 'X' } } }));
    M().push(compra34('db', { valor: 200, notaId: 'ND', nParc: 3, venc1: '2026-08-15' }));
    A('desfazerNotaFaz')('ND');
    const gs = A('gruposParcelados')();
    t('34j: desfazer a nota (100 + 200 com R$ 100 pagos) reparte o pagamento por valor: 33,33 no item de 100 e 66,67 no de 200, e o total pago se conserva; nenhum item fica devendo o que a nota ja pagou',
      gs.length === 2 && r34(gs.find(x => x.dono.id === 'da').marcas[1].v) === 33.33 && r34(gs.find(x => x.dono.id === 'db').marcas[1].v) === 66.67 && somaV() === 100 && M().every(m => !m.notaId),
      S34(M().map(m => [m.id, m.notaId, m.pgParcelas])));
    reset(); setg('contasBanc', banco34());
    M().push(compra34('ea', { valor: 200, qtd: 2, notaId: 'NE', nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 100, conta: 'X' } } }));
    M().push(compra34('eb', { valor: 100, notaId: 'NE', nParc: 3, venc1: '2026-08-15' }));
    A('baixarLote')('ea', 1, 'Coleção', { dataSaida: '2026-09-02' });
    A('desfazerNotaFaz')('NE');
    const gs2 = A('gruposParcelados')();
    t('34j: desfazer a nota com um item dividido em 2 pedacos: os pedacos seguem UMA compra so e recebem a parte do lote inteiro (200 de 300 -> 66,67 num pedaco so), o outro item 33,33',
      gs2.length === 2 && r34(gs2.find(x => x.membros.length === 2).marcas[1].v) === 66.67 && r34(gs2.find(x => x.membros.length === 1).marcas[1].v) === 33.33 && somaV() === 100 && M().filter(m => m.pgParcelas).length === 2,
      S34(M().map(m => [m.id, m.loteOrigem, m.pgParcelas])));
  });

  /* ---- 34k: M-A — abertura e troca dentro do cronograma nao contam ---- */
  await bloco34('k', () => {
    congela(2026, 9, 21, 10, 0);
    M().push(compra34('k1', { valor: 300, notaId: 'NA', nParc: 3, venc1: '2026-08-15' }));
    M().push(compra34('k2', { valor: 50, notaId: 'NA', nParc: 3, venc1: '2026-08-15', origem: 'ABERTURA', loteOrigem: 'k1' }));
    M().push(compra34('k3', { valor: 80, origem: 'TROCA', nParc: 2, venc1: '2026-08-15', data: '2026-08-01' }));
    const sd = A('serieDinheiro')();
    t('34k: a abertura dentro da nota (50) e a troca marcada como parcelada (80) nao entram no cronograma: a nota e 300 (parcela 100), as listas so tem a nota e a curva soma so as vencidas dela',
      A('aPagar')(true).length === 2 && A('aPagar')().length === 1 && A('aPagar')().concat(A('aPagar')(true)).every(x => r34(x.valor) === 100) && A('contasPagas')().filter(x => x.pi).length === 2
      && S34(sd) === S34([{ data: '2026-08-15', total: -100 }, { data: '2026-09-15', total: -200 }]) && sf34(g('contasBanc')[0]) === 800, S34([A('aPagar')(true).length, A('aPagar')().length, sd, sf34(g('contasBanc')[0])]));
  });

  /* ---- 34l: o plano de pagamento editado num pedaco vale pra compra inteira ---- */
  await bloco34('l', () => {
    congela(2026, 9, 21, 10, 0);
    const avisos = [], perguntas = [];
    ctx.alert = m => { avisos.push(String(m)); };
    ctx.confirm = m => { perguntas.push(String(m)); return true; };
    const editar = (id, campos) => {
      const rec = M().find(m => m.id === id);
      setg('editId', id); setg('tipoSel', 'COMPRA'); setg('tela', 'lancar'); setg('pgTipo', 'Parcelado'); setg('_fotosPend', []);
      setg('_db', null); setg('_syncReady', false); setg('_restaurando', false); setg('_baseH', {});
      Object.keys(campos34).forEach(k => delete campos34[k]);
      Object.assign(campos34, { f_val: String(rec.valor), f_data: rec.data, f_jogo: 'Pokémon', f_cat: 'ETB', f_col: '151', f_idi: '—', f_qtd: String(rec.qtd), f_cp: 'Loja',
        f_sit: 'Em estoque', f_nparc: String(rec.nParc), f_venc1: rec.venc1, f_conta: rec.conta, f_taxa: '0', f_pg: 'Parcelado' }, campos || {});
      ctx.document.getElementById = elCampo34;
      avisos.length = 0; perguntas.length = 0;
      A('salvar')();
    };
    M().push(compra34('l1', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15' }));
    const ped = A('baixarLote')('l1', 1, 'Coleção', { dataSaida: '2026-09-02' });      /* o pedaco (nao e o dono da compra) */
    editar(ped.id, { f_nparc: '6' });
    t('34l: mudar o nº de parcelas no PEDACO (3 -> 6) vale pra compra inteira: os dois registros ficam em 6x e a lista tem 6 parcelas de 50 (nao 3)',
      M().filter(m => m.tipo === 'COMPRA').every(m => m.nParc === 6) && A('aPagar')(true).length + A('aPagar')().length === 6 && A('aPagar')().concat(A('aPagar')(true)).every(x => r34(x.valor) === 50),
      S34([M().map(m => [m.id, m.nParc]), A('aPagar')().length, A('aPagar')(true).length]));
    editar(ped.id, { f_venc1: '2026-09-25' });
    t('34l: mudar o 1o vencimento no pedaco tambem vale pra compra inteira (as 6 parcelas passam a vencer a partir de 25/09: nenhuma vencida sem marca)',
      M().filter(m => m.tipo === 'COMPRA').every(m => m.venc1 === '2026-09-25') && A('aPagar')(true).length === 0 && A('aPagar')().length === 6, S34([M().map(m => [m.id, m.venc1]), A('aPagar')(true).length]));
    editar(ped.id, { f_conta: 'Y' });
    t('34l: mudar a conta no pedaco vale pra compra inteira; editar so a observacao NAO mexe no plano dos outros pedacos', M().filter(m => m.tipo === 'COMPRA').every(m => m.conta === 'Y'), S34(M().map(m => [m.id, m.conta])));
    /* a pergunta ao REDUZIR o parcelamento olha o pagamento da compra (que mora no dono), mesmo editando um pedaco que nao o guarda */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('l2', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 100 }, 2: { d: '2026-09-15', v: 100 }, 3: { d: '2026-09-16', v: 100 } } }));
    const ped2 = A('baixarLote')('l2', 1, 'Coleção', { dataSaida: '2026-09-02' });
    editar(ped2.id, { f_nparc: '2' });
    /* [22/09] eram DUAS perguntas seguidas sobre a MESMA edicao (a 2a virava "OK" no automatico) — agora e UMA so, com os dois textos */
    t('34l: reduzir de 3x pra 2x editando o PEDACO (que nao guarda a marca) pergunta UMA vez so, e essa pergunta diz as duas coisas: a parcela 3 da compra ja esta paga E o plano vale pros 2 pedacos',
      perguntas.length === 1 && /a parcela 3 já está marcada como paga/.test(perguntas[0]) && /o plano de pagamento é um só/.test(perguntas[0]) && /o número de parcelas/.test(perguntas[0]) && M().filter(m => m.tipo === 'COMPRA').every(m => m.nParc === 2), S34([perguntas, M().map(m => [m.id, m.nParc])]));
    /* editar sem mexer no plano nao propaga: o dono tem plano diferente e a edicao de outro campo do pedaco nao o sobrescreve */
    reset(); setg('contasBanc', banco34());
    M().push(compra34('l1', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15' }));
    A('baixarLote')('l1', 1, 'Coleção', { dataSaida: '2026-09-02' });
    const pedN = M().find(m => m.loteOrigem === 'l1');
    M().find(m => m.id === 'l1').nParc = 4;
    editar(pedN.id, { f_obs: 'so a observacao', f_nparc: String(M().find(m => m.id === pedN.id).nParc) });
    t('34l: editar so a observacao do pedaco nao propaga o plano dele (o dono continua em 4x)', M().find(m => m.id === 'l1').nParc === 4, S34(M().map(m => [m.id, m.nParc])));
    /* [revisao de 21/09/2026, disco M5] mudar o plano de UM pedaco mexe nos outros: pergunta antes, e o Cancelar deixa tudo como estava */
    reset(); setg('contasBanc', banco34(['X', 'Y']));
    M().push(compra34('l3', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15' }));
    const ped3 = A('baixarLote')('l3', 1, 'Coleção', { dataSaida: '2026-09-02' });
    ctx.confirm = m => { perguntas.push(String(m)); return false; };
    editar(ped3.id, { f_conta: 'Y' });
    t('34l: mudar a CONTA num pedaco pergunta antes (a compra inteira muda de conta, no saldo e no extrato) e o Cancelar nao muda nada',
      perguntas.length === 1 && /a conta/.test(perguntas[0]) && /de uma conta para a outra/.test(perguntas[0]) && /inclusive nos que já foram vendidos/.test(perguntas[0]) && M().filter(m => m.tipo === 'COMPRA').every(m => m.conta === 'X'), S34([perguntas, M().map(m => [m.id, m.conta])]));
    ctx.confirm = m => { perguntas.push(String(m)); return true; };
    editar(ped3.id, { f_conta: 'Y', f_nparc: '6' });
    t('34l: mudar conta E parcelas juntas e UMA pergunta so, que diz as duas coisas; o OK muda a compra inteira',
      perguntas.length === 1 && /o número de parcelas e a conta/.test(perguntas[0]) && M().filter(m => m.tipo === 'COMPRA').every(m => m.conta === 'Y' && m.nParc === 6), S34([perguntas, M().map(m => [m.id, m.conta, m.nParc])]));
    /* os outros pedacos JA tem o valor novo: a edicao nao mexe em ninguem, entao nao pergunta */
    reset(); setg('contasBanc', banco34(['X', 'Y']));
    M().push(compra34('l5', { valor: 200, qtd: 2, nParc: 6, venc1: '2026-08-15' }));
    M().push(compra34('l6', { valor: 100, qtd: 1, nParc: 3, venc1: '2026-08-15', loteOrigem: 'l5' }));
    editar('l6', { f_nparc: '6' });
    t('34l: se os outros pedacos JA estao no valor novo (o dono ja e 6×) a edicao nao mexe em ninguem e nao pergunta', perguntas.length === 0 && M().every(m => m.nParc === 6), S34([perguntas, M().map(m => [m.id, m.nParc])]));
    /* compra sem pedacos e edicao que nao mexe nos outros nao perguntam */
    reset(); setg('contasBanc', banco34(['X', 'Y']));
    M().push(compra34('l4', { valor: 300, qtd: 1, nParc: 3, venc1: '2026-08-15' }));
    editar('l4', { f_conta: 'Y', f_nparc: '6' });
    /* [22/09] compra sem pedacos nao ganha a pergunta de PROPAGACAO (nao ha pedaco pra propagar) — mas a de DINHEIRO sim, porque esta
       compra tem 2 parcelas ja vencidas: trocar 3x por 6x muda o que a regra conta como pago (200 -> 100) e trocar X por Y leva R$ 200
       de uma conta pra outra. Ate 21/09 isso acontecia calado. */
    t('34l: compra sem pedacos nao pergunta sobre propagacao, mas mostra os numeros: pago 200 -> 100 e o dinheiro passando da conta X pra Y',
      perguntas.length === 1 && !/plano de pagamento é um só/.test(perguntas[0]) && /Mudar o plano assim mexe no dinheiro/.test(perguntas[0])
      && /pago R\$\s200,00 → R\$\s100,00/.test(perguntas[0]) && /conta "Y" R\$\s1\.000,00 → R\$\s900,00/.test(perguntas[0])
      && M()[0].conta === 'Y' && M()[0].nParc === 6, S34([perguntas, M().map(m => [m.id, m.conta, m.nParc])]));
  });

  /* ---- 34m: UM relogio so: 10h, 20h59, 21h01 e 22h30 de Sao Paulo dao o mesmo "hoje" em todas as telas de dinheiro ---- */
  await bloco34('m', () => {
    const inst = [[10, 0], [20, 59], [21, 1], [22, 30]];
    inst.forEach(([h, mi]) => {
      const rot = ('0' + h).slice(-2) + 'h' + ('0' + mi).slice(-2);
      congela(2026, 9, 21, h, mi);
      reset(); setg('contasBanc', banco34());
      M().push({ id: 'dH', tipo: 'DESPESA', data: '2026-09-21', valor: 40, status: 'apagar', natureza: 'ordinaria', cat: 'Luz', conta: 'X' });      /* hoje */
      M().push({ id: 'dA', tipo: 'DESPESA', data: '2026-09-22', valor: 15, status: 'apagar', natureza: 'ordinaria', cat: 'Agua', conta: 'X' });     /* amanha */
      M().push(compra34('mP', { valor: 100, nParc: 2, venc1: '2026-09-21', data: '2026-09-01' }));                                                      /* 1a vence hoje */
      const cb = g('contasBanc')[0], pj = A('projecaoCaixa')();
      /* [2026-09-22] o que este bloco mede e o RELOGIO, nao a regra da despesa; a regra mudou embaixo dele e os numeros foram refeitos:
         o saldo FISICO nao desconta despesa "a pagar" nenhuma (nem a de hoje) e fica em 1000; o "por emissao" continua descontando a de
         hoje (960) e a compra (-100) = 860. O que prova o relogio e o par HOJE/AMANHA: as 21h01 e as 22h30 (quando o UTC ja virou) a de
         amanha continua fora dos dois e a parcela de hoje continua a vencer. */
      t('34m: ' + rot + ' — hoje e 21/09 em todo lugar: a despesa "a pagar" de HOJE nao sai do saldo fisico (1000) mas sai do por emissao (860, com a compra), a de amanha nao sai de nenhum, a parcela que vence hoje ainda e a pagar',
        A('hojeISO')() === '2026-09-21' && sf34(cb) === 1000 && r34(A('saldoConta')(cb)) === 960 - 100 && A('aPagar')().filter(x => x.pi).length === 2 && A('aPagar')(true).length === 0, S34([A('hojeISO')(), sf34(cb), A('saldoConta')(cb)]));
      const ext = A('extratoRows')();
      t('34m: ' + rot + ' — o extrato de caixa (por emissao) traz a despesa de hoje e a compra, e nunca a despesa de amanha',
        ext.length === 2 && ext.every(r => r.id !== 'dA') && ext.some(r => r.id === 'dH'), S34(ext.map(r => [r.id, r.v])));
      t('34m: ' + rot + ' — a projecao nao conta a despesa de hoje duas vezes: parte de 1000 (o saldo fisico, que nao desconta despesa a pagar) e as 2 despesas (40 de hoje + 15 de amanha) e as 2 parcelas (100) entram: +30 dias = 1000 - 55 - 100 = 845',
        pj.atual === 1000 && pj.d30 === 845, S34(pj));
    });
    /* quem GRAVA "hoje": a data gravada e a de Sao Paulo, mesmo depois das 21h */
    congela(2026, 9, 21, 22, 30);
    reset(); setg('contasBanc', banco34());
    M().push({ id: 'dZ', tipo: 'DESPESA', data: '2026-09-21', valor: 10, status: 'apagar', natureza: 'ordinaria', cat: 'Luz', conta: 'X' });
    A('marcarPago')('dZ');
    t('34m: as 22h30 marcar despesa como paga grava 2026-09-21 (o "hoje" de Sao Paulo), nao 2026-09-22 (o do UTC)', M()[0].dataPagamento === '2026-09-21' && A('hojeISO')() === '2026-09-21', M()[0].dataPagamento);
  });

  /* ---- 34n: R2 — a projecao parte do saldo fisico e so soma o que ainda vai acontecer, com escopo ---- */
  await bloco34('n', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X']));                                   /* so X esta no cadastro */
    M().push(compra34('n1', { valor: 300, nParc: 3, venc1: '2026-10-05', conta: 'X', data: '2026-09-10' }));                        /* 3 parcelas a vencer em X: 05/10, 05/11, 05/12 */
    M().push(compra34('n2', { valor: 200, nParc: 2, venc1: '2026-10-06', conta: 'Z', data: '2026-09-10' }));                        /* 2 a vencer em Z (fora do cadastro) */
    M().push({ id: 'vX', tipo: 'VENDA', data: '2026-09-15', valor: 100, taxa: 10, canal: 'App', recDias: 14, conta: 'X', contraparte: 'Cli', qtd: 1 });       /* repasse 29/09: +90 em X */
    M().push({ id: 'vS', tipo: 'VENDA', data: '2026-09-15', valor: 50, taxa: 0, canal: 'App', recDias: 14, conta: '', contraparte: 'Cli', qtd: 1 });           /* sem conta: fora */
    M().push({ id: 'dF', tipo: 'DESPESA', data: '2026-10-10', valor: 30, status: 'apagar', natureza: 'ordinaria', cat: 'Luz', conta: 'X' });        /* futura em X */
    M().push({ id: 'dH', tipo: 'DESPESA', data: '2026-09-20', valor: 20, status: 'apagar', natureza: 'ordinaria', cat: 'Agua', conta: 'X' });       /* a pagar com data ja passada em X: [2026-09-22] NAO esta no saldo — esta na projecao */
    M().push({ id: 'dZ', tipo: 'DESPESA', data: '2026-09-20', valor: 25, status: 'apagar', natureza: 'ordinaria', cat: 'Gas', conta: 'Z' });        /* idem, mas em Z (fora do cadastro) */
    const cb = g('contasBanc')[0], pj = A('projecaoCaixa')();
    t('34n: a projecao parte do saldo FISICO da conta cadastrada (1000, porque despesa "a pagar" nao sai do bolso nem depois de vencer) e "hoje" e o mesmo numero do card Saldo por conta',
      pj.atual === 1000 && pj.atual === totSf34() && sf34(cb) === 1000, S34([pj.atual, totSf34(), sf34(cb)]));
    /* +30 dias (21/10): entra +90 (X, 29/09); saem 100 (parcela 05/10 de X), 30 (despesa 10/10 de X) e 20 (despesa de X vencida em 20/09, que entra em TODOS os horizontes) */
    t('34n: +30 dias so soma o que e de conta cadastrada: +90 da venda de X, -100 da parcela de X, -30 da despesa futura de X, -20 da despesa de X ja vencida = 940',
      pj.d30 === 940, S34(pj));
    t('34n: +90 dias (20/12): mais as parcelas de 05/11 e 05/12 de X (-200): 740', pj.d90 === 740, S34(pj));
    t('34n: o que e de conta fora do cadastro ou sem conta vai pra linha "fora das contas", nao pros numeros: entra 50 (venda sem conta), sai 200 (2 parcelas de Z) + 25 (despesa de Z ja vencida) = 225',
      pj.fora.entra === 50 && pj.fora.sai === 225 && pj.fora.n === 4, S34(pj.fora));
    const html = telaContas34();
    t('34n: a tela mostra a linha "Fora das contas cadastradas ... entra R$ 50,00 · sai R$ 225,00"', html.indexOf('Fora das contas cadastradas') >= 0 && html.indexOf('entra ' + fmt34(50)) >= 0 && html.indexOf('sai ' + fmt34(225)) >= 0, '');
    /* sem NENHUMA conta cadastrada: tudo entra e a projecao parte de zero, avisando */
    setg('contasBanc', []);
    const p0 = A('projecaoCaixa')();
    t('34n: sem nenhuma conta cadastrada todos os fluxos entram e a projecao parte de R$ 0,00 (temContas falso, nada em "fora")', p0.atual === 0 && p0.temContas === false && p0.fora.n === 0 && p0.d30 < 0, S34(p0));
    /* I9: nada some — o que esta a pagar (parcelas + despesas) e a receber e a soma do que esta dentro + fora dos numeros */
    setg('contasBanc', banco34(['X']));
    const ap = A('aPagar')(), ar = A('aReceber')(), pj2 = A('projecaoCaixa')();
    const dentroPag = r34(ap.filter(x => (x.m.conta || '') === 'X' && !(x.m.tipo === 'DESPESA' && x.m.data <= '2026-09-21')).reduce((s, x) => s + x.valor, 0));
    t('34n: conservacao: tudo o que esta em A pagar e A receber aparece na projecao (dentro) ou na linha fora — a projecao +90 = saldo - a pagar de X + a receber de X',
      pj2.d90 === r34(980 - dentroPag + r34(ar.filter(x => (x.m.conta || '') === 'X').reduce((s, x) => s + x.valor, 0))), S34([pj2.d90, dentroPag]));
  });

  /* ---- 34o: Diagnostico do pagamento fora do plano, por COMPRA (e nao por pedaco) ---- */
  await bloco34('o', () => {
    congela(2026, 9, 21, 10, 0);
    M().push(compra34('o1', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 100 }, 2: { d: '2026-09-15', v: 100 }, 3: { d: '2026-09-16', v: 100 }, 4: { d: '2026-09-17', v: 100 } } }));
    A('baixarLote')('o1', 1, 'Coleção', { dataSaida: '2026-09-02' });
    A('baixarLote')('o1', 1, 'Coleção', { dataSaida: '2026-09-03' });
    const a = A('provaReal')().A.filter(x => /^Parcela paga a mais do que o plano/.test(x.titulo));
    t('34o: compra dividida em 3 pedacos com uma parcela alem do plano gera UM achado (nao um por pedaco), e o botao abre o formulario de edicao do dono',
      a.length === 1 && /fecharModal\(\);abrir\('o1'\)/.test(a[0].acao || a[0].onclick || JSON.stringify(a[0])), S34(a));
    t('34o: o texto nao manda mais "tocar em editar" (o botao ja abre a edicao) e ainda diz onde a parcela esta contada', !/tocar em/.test(a[0].detalhe) && /já está contada \(Fluxo de caixa › pagas, saldos e gráfico de dinheiro\)/.test(a[0].detalhe), a[0].detalhe);
  });

  /* ---- 34p: conta com nome repetido; valor gravado que o select nao conhece; dica dos pagamentos que o periodo esconde; papel e Painel ---- */
  await bloco34('p', () => {
    congela(2026, 9, 21, 10, 0);
    const avisos = [];
    ctx.alert = m => { avisos.push(String(m)); };
    ctx.document.getElementById = elCampo34;
    setg('contasBanc', []); setg('pgs', ['Pix']);
    const grava = (idConta, nome) => { Object.keys(campos34).forEach(k => delete campos34[k]); Object.assign(campos34, { cb_nome: nome, cb_saldoIni: '0', cb_saldoData: '' }); avisos.length = 0; A('salvarConta')(idConta); };
    grava(null, 'Nubank');
    t('34p: criar a conta "Nubank" funciona', g('contasBanc').length === 1 && g('contasBanc')[0].nome === 'Nubank', S34(g('contasBanc')));
    grava(null, '  nubank ');
    t('34p: criar outra com o mesmo nome (sem diferenciar maiuscula nem espacos) e barrado, com o aviso, e nada e salvo', g('contasBanc').length === 1 && avisos.length === 1 && /Já existe uma conta chamada/.test(avisos[0]), S34([g('contasBanc').length, avisos]));
    grava(null, 'Inter');
    const idInter = g('contasBanc').find(c => c.nome === 'Inter').id;
    grava(idInter, 'NUBANK');
    t('34p: renomear uma conta pra um nome que ja existe tambem e barrado (e a conta segue com o nome de antes)', g('contasBanc').find(c => c.id === idInter).nome === 'Inter' && avisos.length === 1, S34([g('contasBanc').map(c => c.nome), avisos]));
    grava(idInter, 'Inter');
    t('34p: editar a conta sem trocar o nome nao acusa nada (so barra ao criar ou renomear)', avisos.length === 0 && g('contasBanc').length === 2, S34(avisos));
    /* dado antigo com nome repetido segue editavel sem trocar o nome */
    setg('contasBanc', [{ id: 'c1', nome: 'Dup', saldoIni: 0, saldoData: '' }, { id: 'c2', nome: 'dup', saldoIni: 0, saldoData: '' }]);
    grava('c2', 'dup');
    t('34p: conta antiga com nome repetido pode ser editada sem trocar o nome (nao trava o cadastro)', avisos.length === 0, S34(avisos));
    /* o select do formulario de edicao guarda o valor gravado que a lista nao tem */
    const so = A('selOpts');
    t('34p: o select de edicao mantem SELECIONADO o valor gravado que nao esta na lista (conta fora de "formas de pagamento"): salvar nao zera; valor da lista e valor vazio ficam como sempre',
      so(['Pix', 'Cartão'], 'Nubank').indexOf('<option selected>Nubank</option>') >= 0 && so(['Pix'], 'Pix').indexOf('<option selected>Pix</option>') >= 0 && so(['Pix'], 'Pix').split('selected').length === 2
      && so(['Pix'], '').indexOf('selected') < 0 && so(['Pix'], undefined).indexOf('selected') < 0, so(['Pix', 'Cartão'], 'Nubank'));
  });

  await bloco34('q', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34());
    setg('perSel', 'd30'); setg('perDe', '2026-08-22'); setg('perAte', '');
    M().push(compra34('q1', { valor: 300, nParc: 3, venc1: '2026-06-10', pgParcelas: { 1: { d: '2026-06-10', v: 100 }, 2: { d: '2026-09-15', v: 100 }, 3: { d: '2026-07-10', v: 100 } } }));
    const html = telaContas34();
    t('34q: quando o periodo escondeu pagamentos marcados como pagos (2 de junho e julho), a lista de Pagas diz "2 pagamentos marcados como pagos fora do periodo escolhido — toque pra ver tudo"',
      html.indexOf('2 pagamentos marcados como pagos fora do período escolhido — toque pra ver tudo') >= 0 && html.indexOf("setPer('tudo')") >= 0, (html.match(/pagamento[^<]{0,90}/) || [''])[0]);
    setg('perSel', 'tudo'); setg('perDe', ''); setg('perAte', '');
    t('34q: com o periodo em tudo a dica some', telaContas34().indexOf('fora do período escolhido') < 0, '');
    /* Painel e papel: o saldo por emissao vem rotulado; o papel imprime o FISICO com o por emissao ao lado */
    M().push(compra34('q2', { valor: 200, nParc: 2, venc1: '2026-10-10', data: '2026-09-10' }));       /* a vencer: sai da conta "por emissao" hoje, do fisico so no vencimento */
    let tabela = '';
    const geb0 = ctx.document.getElementById, ins0 = ctx.document.body.insertAdjacentHTML;
    ctx.document.getElementById = idc => ({ checked: idc === 'ps_saldo', value: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, remove() {}, dataset: {} });
    ctx.document.body.insertAdjacentHTML = (pos, h) => { tabela += h; };
    setg('imprimir', () => {});
    A('imprimirFluxoGo')();
    ctx.document.getElementById = geb0; ctx.document.body.insertAdjacentHTML = ins0;
    const cb = g('contasBanc')[0];
    t('34q: o papel do Fluxo imprime o saldo FISICO da conta (' + fmt34(sf34(cb)) + ') e, como difere, o "por emissao" (' + fmt34(A('saldoConta')(cb)) + ') ao lado; o Caixa projetado diz que e o saldo fisico',
      sf34(cb) === 700 && r34(A('saldoConta')(cb)) === 500 && tabela.indexOf('por emissão ' + fmt34(500)) >= 0 && tabela.indexOf('>' + fmt34(700) + '<') >= 0 && tabela.indexOf('Caixa projetado hoje (= saldo físico das contas)') >= 0, tabela.slice(150, 700));
  });
  /* ===== 36. REVISAO DE 21/09/2026 (tres faces: substancia, numero e limite) — o que a secao 35 nao exercitava =====
     As tres faces (confere-no-disco, confere-o-numero, confere-o-limite) atacaram a entrega de 19-21/09 e acharam o que o oraculo da secao 35 nao
     enxerga (ele so divide, recarrega, paga e desmarca): marca gravada por pedaco pelo app antigo, restaurar da Lixeira, juntar compras de plano
     diferente, parcela fracionada, dono do grupo que muda com a ordem da lista, `__proto__` no JSON, despesa com data de pagamento, valor de
     marca em texto. Cada bloco abaixo prova UM achado no caminho do usuario (a mesma funcao que a tela chama) e tem a mutacao correspondente
     no vacina (checks-suite.py, prefixo `rev7-`). */
  console.log('');
  console.log('=== 36. revisao de 21/09: uniao das marcas, restaurar da lixeira, juntar com plano diferente, fracao de parcela, dono estavel, __proto__ ===');
  const FUNCS36 = ['melhorMarca', 'juntaMudaODinheiro', 'resolveJunta', 'aplicaJunta', 'retratoJunta', 'textoJuntaBarrada', 'juntaOk', 'juntarNotaCore', 'desfazerNotaFaz', 'separarDaNotaFaz', 'valorOfertaParcela', 'parcelaTxt', 'pagarParcela',
    'confirmarPagarParcela', 'pgValor', 'verFicha', 'graficoLinhaEstoque', 'lixeiraGuarda', 'okCtG', 'dataDeISO', 'vConsultar', 'copiaMarcas', 'difsRetrato', 'causasJunta', 'idsComLote', 'juntarFx', 'juntarNota', 'abrirProvaReal', 'parcelasAlemDoPlano'];
  const faltam36 = FUNCS36.filter(n => { try { return typeof A(n) !== 'function'; } catch (e) { return true; } });
  t('36a: [pre-requisito] o app carregado tem as ' + FUNCS36.length + ' funcoes desta secao', faltam36.length === 0, 'FALTAM no app: ' + faltam36.join(', '));
  const bloco36 = (rot, corpo) => faltam36.length ? Promise.resolve() : bloco34(rot, corpo, '36');
  const n36 = s => String(s).replace(/ /g, ' ');
  /* o retrato do dinheiro: o que uma operacao de estrutura (dividir, juntar, separar, desfazer) nunca pode mexer */
  const dinheiro36 = () => { const f = foto34(); return { saldos: f.saldos, emissao: f.emissao, curva: f.curva, pagas: f.pagas, aPagar: f.aPagar, venc: f.venc, proj: f.proj }; };
  const semVenc36 = o => ({ saldos: o.saldos, curva: o.curva, pagas: o.pagas, aPagar: o.aPagar });   /* "vencidas sem marca" muda por definicao quando a parcela passa a ter marca */
  const diag36 = re => A('provaReal')().A.filter(x => re.test(x.titulo));
  const modal36 = fn => { let html = ''; const geb = ctx.document.getElementById, ins = ctx.document.body.insertAdjacentHTML;
    ctx.document.body.insertAdjacentHTML = (pos, h) => { html += h; }; ctx.document.getElementById = idc => elCampo34(idc);
    try { fn(); } finally { ctx.document.getElementById = geb; ctx.document.body.insertAdjacentHTML = ins; } return n36(html); };

  /* ---- 36b: a mesma parcela marcada em dois pedacos (o app ANTIGO marcava pedaco por pedaco): valores diferentes nao somem calados ---- */
  await bloco36('b', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34());
    M().push(compra34('r1', { valor: 200, qtd: 2, nParc: 3, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 66.67, conta: 'X' } } }));
    M().push(compra34('r2', { valor: 100, qtd: 1, nParc: 3, venc1: '2026-08-15', loteOrigem: 'r1', situacao: 'Vendido', pgParcelas: { 1: { d: '2026-08-15', v: 33.33, conta: 'X' } } }));
    const gr = A('gruposParcelados')(), aviso = diag36(/marcada como paga mais de uma vez/);
    t('36b: a MESMA parcela marcada em dois pedacos com valores diferentes conta a maior (66,67) e o Diagnostico avisa, com os dois valores e a soma (100,00)',
      gr.length === 1 && r34(gr[0].marcas[1].v) === 66.67 && aviso.length === 1 && /33,33/.test(n36(aviso[0].detalhe)) && /66,67/.test(n36(aviso[0].detalhe)) && /100,00/.test(n36(aviso[0].detalhe)),
      S34([gr.length, gr[0] && gr[0].marcas, aviso]));
    /* [rodada 6] pela TELA: o Diagnóstico aberto de verdade (antes só o dado era lido, e a tela nunca teve guarda) */
    const htmlP = modal36(() => A('abrirProvaReal')());
    t('36b: pela TELA (o Diagnóstico aberto de verdade, não só o dado): o aviso da marca duplicada chega ao modal com os dois valores, o que o app conta, a soma e o botão de abrir o lançamento',
      /marcada como paga mais de uma vez, com valores diferentes/.test(htmlP) && /33,33/.test(htmlP) && /66,67/.test(htmlP) && /O app conta só a maior/.test(htmlP) && /Se elas eram partes do MESMO pagamento/.test(htmlP) && /abrir o lançamento/.test(htmlP), htmlP.slice(0, 500));
    M().find(m => m.id === 'r2').pgParcelas = { 1: { d: '2026-08-15', v: 66.67, conta: 'X' } };
    t('36b: marcas IGUAIS da mesma parcela (o mesmo pagamento duplicado pelo fracionamento antigo) contam UMA vez e nao geram aviso',
      diag36(/marcada como paga mais de uma vez/).length === 0 && soma34(A('contasPagas')().filter(x => x.pagaManual)) === 66.67, S34([diag36(/mais de uma vez/), soma34(A('contasPagas')().filter(x => x.pagaManual))]));
    /* [revisao de 21/09] o desempate deixou de ser "a do 1º pedaco" (mudava conta e data de um pagamento so por atualizar): qualquer diferenca entre as marcas e aviso */
    M().find(m => m.id === 'r2').pgParcelas = { 1: { d: '2026-08-15', v: 66.66, conta: 'X' } };
    t('36b: 1 CENTAVO de diferenca entre as duas marcas (66,67 e 66,66) ja e aviso "valores diferentes" (a tolerancia e meio centavo, nao 50)', diag36(/marcada como paga mais de uma vez, com valores diferentes/).length === 1, S34(diag36(/mais de uma vez/)));
    M().find(m => m.id === 'r2').pgParcelas = { 1: { d: '2026-08-15', v: 66.67, conta: 'Z' } };
    const avC = diag36(/marcada como paga mais de uma vez, com contas diferentes/);
    t('36b: mesmo valor mas CONTAS diferentes (X e Z): aviso "contas diferentes" que diz qual o app conta (a conta "X", a primeira em ordem) e nao inventa aviso de valor',
      avC.length === 1 && /"X"/.test(n36(avC[0].detalhe)) && /contas diferentes \(X e Z\)/.test(n36(avC[0].detalhe)) && diag36(/valores diferentes/).length === 0, S34(diag36(/mais de uma vez/)));
    M().find(m => m.id === 'r2').pgParcelas = { 1: { d: '2026-08-10', v: 66.67, conta: 'X' } };
    const avD = diag36(/marcada como paga mais de uma vez, com datas diferentes/);
    t('36b: mesmo valor e conta mas DATAS diferentes (15/08 e 10/08): aviso "datas diferentes" e o app conta a mais antiga (10/08)',
      avD.length === 1 && /em 10\/08\/2026/.test(n36(avD[0].detalhe)) && /datas diferentes \(15\/08\/2026 e 10\/08\/2026\)/.test(n36(avD[0].detalhe)), S34(diag36(/mais de uma vez/)));
    M().find(m => m.id === 'r2').pgParcelas = { 1: { d: '2026-08-10', v: 66.67, conta: 'Z' } };
    t('36b: conta E data diferentes: um aviso so, que diz as duas coisas', diag36(/com contas e datas diferentes/).length === 1, S34(diag36(/mais de uma vez/)));
    /* [rodada 3] o aviso compara a data que o DINHEIRO usa (sem data legivel = o vencimento), nao a crua: marca sem data, marca legada em texto e texto solto nao geram aviso falso */
    M().find(m => m.id === 'r2').pgParcelas = { 1: { v: 66.67, conta: 'X' } };
    t('36b: marca SEM data (o dinheiro a conta no vencimento, 15/08) e marca com d = 15/08 sao o mesmo pagamento: nenhum aviso de datas', diag36(/marcada como paga mais de uma vez/).length === 0, S34(diag36(/mais de uma vez/)));
    M().find(m => m.id === 'r2').pgParcelas = { 1: '2026-08-15' };
    t('36b: marca no formato antigo (so a data, em texto) igual a data da outra: nenhum aviso', diag36(/marcada como paga mais de uma vez/).length === 0, S34(diag36(/mais de uma vez/)));
    M().find(m => m.id === 'r2').pgParcelas = { 1: '100' };
    t('36b: texto solto no lugar da marca ("100") nao vira "data" no aviso (o dinheiro o le como o vencimento): nenhum aviso e nenhum "100" impresso', diag36(/marcada como paga mais de uma vez/).length === 0, S34(diag36(/mais de uma vez/)));
    M().find(m => m.id === 'r2').pgParcelas = { 1: { v: 66.67, conta: 'X', d: '2026-08-16' } };
    const avD2 = diag36(/com datas diferentes/);
    t('36b: e data DE VERDADE diferente (15/08 e 16/08) continua avisando', avD2.length === 1 && /datas diferentes \(15\/08\/2026 e 16\/08\/2026\)/.test(n36(avD2[0].detalhe)), S34(diag36(/mais de uma vez/)));
    /* [rodada 4] parcela ALEM do plano: o dinheiro so conta marca com data ISO valida e nunca inventa vencimento — o aviso tambem nao */
    const alem = (m1, m2) => { M().find(m => m.id === 'r1').pgParcelas = { 4: m1 }; M().find(m => m.id === 'r2').pgParcelas = { 4: m2 }; };
    alem({ d: '2026-11-15', v: 100, conta: 'X' }, { v: 100, conta: 'X' });
    t('36b: parcela 4 (alem do plano de 3×): marca datada + marca SEM data: silencio — o dinheiro só conta a datada e o aviso não inventa o vencimento (15/11) pra sem-data', diag36(/marcada como paga mais de uma vez/).length === 0, S34(diag36(/mais de uma vez/)));
    alem({ d: '2026-08-10', v: 100, conta: 'X' }, { d: '2026-11-15', v: 100, conta: 'X' });
    const avA = diag36(/marcada como paga mais de uma vez, com datas diferentes/);
    t('36b: parcela 4 com DUAS datas válidas diferentes: avisa com as datas que existem (10/08 e 15/11) e diz a que o app conta (10/08)', avA.length === 1 && /datas diferentes \(10\/08\/2026 e 15\/11\/2026\)/.test(n36(avA[0].detalhe)) && /em 10\/08\/2026/.test(n36(avA[0].detalhe)), S34(diag36(/mais de uma vez/)));
    alem({ d: 'lixo', v: 100, conta: 'X' }, { d: '2026-02-30', v: 100, conta: 'X' });
    t('36b: parcela 4 com datas inválidas nas duas: silêncio (o dinheiro não conta nenhuma; o item 9 do Diagnóstico é quem fala dela)', diag36(/marcada como paga mais de uma vez/).length === 0, S34(diag36(/mais de uma vez/)));
    /* [rodada 5] o aviso de VALOR não some além do plano só porque uma marca está sem data (o revisor: 100 e 100 datadas + 500 sem data calavam) e o texto só promete o que o dinheiro faz */
    alem({ d: '2026-11-15', v: 100, conta: 'X' }, { v: 500, conta: 'X' });
    const avV = diag36(/marcada como paga mais de uma vez, com valores diferentes/);
    t('36b: parcela 4 (além do plano): uma marca datada de R$ 100 e outra SEM data de R$ 500 — o aviso de VALORES DIFERENTES aparece e diz que o app não conta nenhuma delas (a de maior valor não tem data legível)',
      avV.length === 1 && /R\$ 100,00 e R\$ 500,00/.test(n36(avV[0].detalhe)) && /O app não conta nenhuma delas/.test(n36(avV[0].detalhe)), S34(diag36(/mais de uma vez/)));
    t('36b: e além do plano o texto NÃO promete "no vencimento" (a parcela nem existe no plano): manda acertar o nº de parcelas da compra',
      !/no vencimento/.test(n36(avV[0] ? avV[0].detalhe : '')) && /acerte o nº de parcelas da compra/.test(n36(avV[0] ? avV[0].detalhe : '')), S34(diag36(/mais de uma vez/)));
    alem({ d: '2026-11-15', v: 100, conta: 'X' }, { d: '2026-11-20', v: 300, conta: 'X' });
    const avV2 = diag36(/marcada como paga mais de uma vez, com valores diferentes/);
    t('36b: parcela 4 com DUAS marcas datadas de valores diferentes (R$ 100 e R$ 300): avisa e diz que o app conta a maior (R$ 300,00)',
      avV2.length === 1 && /O app conta só a maior \(R\$ 300,00\)/.test(n36(avV2[0].detalhe)), S34(diag36(/mais de uma vez/)));
    alem({ d: '2026-12-01', v: 100, conta: 'X' }, { v: 100, conta: 'X' });
    t('36b: parcela 4: marca datada (01/12) + marca SEM data, mesmo valor e mesma conta: silêncio — a sem-data não ganha um "vencimento" inventado (15/11) que a faria parecer outra data',
      diag36(/marcada como paga mais de uma vez/).length === 0, S34(diag36(/mais de uma vez/)));
    /* [rodada 6] o aviso usa a MESMA regra do dinheiro (parcelasAlemDoPlano), não uma reescrita: o revisor achou o Diagnóstico se contradizendo em dois itens vizinhos (ano fora de 1900–2200) */
    alem({ d: '3000-01-01', v: 500, conta: 'X' }, { d: '3000-02-01', v: 100, conta: 'X' });
    const g3000 = A('gruposParcelados')()[0], avY = diag36(/marcada como paga mais de uma vez, com valores diferentes/);
    t('36b: parcela 4 (além do plano) com data de ANO 3000 — o dinheiro a CONTA (a regra dele é só "AAAA-MM-DD válida") —: o aviso diz que o app conta a maior (R$ 500,00) e NÃO diz que não conta nenhuma (o Diagnóstico não pode se contradizer com o item da parcela paga a mais)',
      A('parcelasAlemDoPlano')(g3000.marcas, g3000.nP).some(e => e.k === 4) && avY.length === 1 && /O app conta só a maior \(R\$ 500,00\)/.test(n36(avY[0].detalhe)) && !/não conta nenhuma/.test(n36(avY[0].detalhe)), S34(diag36(/mais de uma vez/)));
    alem({ d: '3000-01-01', v: 100, conta: 'X' }, { d: '3000-02-01', v: 100, conta: 'X' });
    const avY2 = diag36(/marcada como paga mais de uma vez, com datas diferentes/);
    t('36b: e duas marcas de ano 3000 com o MESMO valor e datas diferentes avisam "datas diferentes (01/01/3000 e 01/02/3000)" — a data que o aviso compara é a que o dinheiro usa, não o vencimento inventado',
      avY2.length === 1 && /datas diferentes \(01\/01\/3000 e 01\/02\/3000\)/.test(n36(avY2[0].detalhe)), S34(diag36(/mais de uma vez/)));
    M().find(m => m.id === 'r1').pgParcelas = { '4.0': { d: '2026-11-15', v: 500, conta: 'X' } }; M().find(m => m.id === 'r2').pgParcelas = { '4.0': { d: '2026-11-15', v: 100, conta: 'X' } };
    t('36b: chave de parcela fora do padrão ("4.0") em dois pedaços com valores diferentes: o aviso de marca duplicada CALA (o dinheiro nem lê essa marca) e quem fala dela é o de "número fora do padrão"',
      diag36(/marcada como paga mais de uma vez/).length === 0 && diag36(/número fora do padrão/).length >= 1, S34(A('provaReal')().A.map(x => x.titulo)));
    M().find(m => m.id === 'r1').pgParcelas = { 1: '2026-08-15' }; M().find(m => m.id === 'r2').pgParcelas = { 1: '2026-08-20' };
    const avL = diag36(/marcada como paga mais de uma vez, com datas diferentes/);
    t('36b: duas marcas no formato antigo (só a data, em texto) com datas diferentes: o aviso diz o valor que o app conta (R$ 100,00, o da parcela) e nunca "R$ -∞"',
      avL.length === 1 && /O app conta um pagamento só: R\$ 100,00/.test(n36(avL[0].detalhe)) && !/∞/.test(n36(avL[0].detalhe)), S34(diag36(/mais de uma vez/)));
    alem({ d: '2026-11-15', v: 100, conta: 'X' }, { v: 100, conta: 'Z' });
    t('36b: parcela 4 (além do plano): marca datada da conta X + marca SEM data da conta Z: silêncio — conta e data só se comparam entre marcas que o dinheiro conta (a sem-data nem entra)',
      diag36(/marcada como paga mais de uma vez/).length === 0, S34(diag36(/mais de uma vez/)));
  });

  /* ---- 36c: restaurar da Lixeira o lote apagado por "so o que nao vendeu" nao duplica o pagamento ---- */
  await bloco36('c', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34());
    M().push(compra34('K', { valor: 300, qtd: 3, nParc: 3, venc1: '2027-02-10', pgParcelas: { 1: { d: '2026-06-01', v: 100, conta: 'X' } } }));
    vendeu34('K', 1, 'Cli');
    setg('movs', JSON.parse(JSON.stringify(M())));                                   /* recarregou o app */
    const pagoManual = () => soma34(A('contasPagas')().filter(x => x.pagaManual)), guardados = [];
    const orig = g('lixeiraGuarda');
    setg('lixeiraGuarda', r => { (r || []).forEach(x => guardados.push(JSON.parse(JSON.stringify(x)))); });   /* o que o PROPRIO app manda pra Lixeira */
    try {
      const antes = pagoManual();
      A('execExcl')('K', 'compraSobra');
      const durante = pagoManual();
      guardados.forEach(m => { if (!M().some(x => x.id === m.id)) M().push(m); });      /* "restaurar" da Lixeira */
      const depois = pagoManual();
      t('36c: apagar so o que nao vendeu passa a marca pro pedaco que fica (100 -> 100) e RESTAURAR o lote apagado da Lixeira nao duplica o pagamento (continua 100, nao 200)',
        antes === 100 && durante === 100 && depois === 100 && guardados.length >= 1 && guardados.every(m => !m.pgParcelas), S34([antes, durante, depois, guardados.map(m => [m.id, m.pgParcelas])]));
    } finally { setg('lixeiraGuarda', orig); }
  });

  /* ---- 36d: a dica das Pagas conta as vencidas sem marca que o periodo escondeu ---- */
  await bloco36('d', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34());
    setg('perSel', 'd30'); setg('perDe', '2026-08-22'); setg('perAte', '');
    M().push(compra34('h1', { valor: 300, nParc: 3, venc1: '2026-05-10' }));           /* as 3 parcelas venceram (10/05, 10/06, 10/07) e ninguem marcou: contam como pagas, fora do periodo */
    const html = n36(telaContas34());
    t('36d: a dica das Pagas conta tambem as parcelas VENCIDAS SEM MARCA que o periodo escondeu (sao o grosso do historico), com o valor, e nao inventa "pagamentos marcados"',
      html.indexOf('3 parcelas vencidas sem marca (contadas como pagas no vencimento · R$ 300,00) fora do período escolhido — toque pra ver tudo') >= 0
      && html.indexOf('marcado como pago') < 0 && html.indexOf('marcados como pagos') < 0, (html.match(/parcela[^<]{0,120}fora do per[^<]{0,40}/) || [''])[0]);
    setg('perSel', 'tudo'); setg('perDe', '');
    t('36d: com o periodo em tudo a dica some', n36(telaContas34()).indexOf('fora do período escolhido') < 0, '');
  });

  /* ---- 36e: a parcela do pedaco e a da COMPRA (ficha, Consulta) ---- */
  await bloco36('e', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34());
    M().push(compra34('f1', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15' }));
    const p1 = A('baixarLote')('f1', 1, 'Coleção', { dataSaida: '2026-09-02' });          /* pedaco de R$ 100 (1/3 do lote): 100/3 = 33,33 NAO e a parcela dele */
    const gr = A('gruposParcelados')().find(x => x.membros.length === 2);
    t('36e: o texto da parcela de um pedaco de lote diz a parcela da COMPRA ("3× de R$ 100,00 (a compra toda: R$ 300,00)"), nao o valor do pedaco dividido por 3',
      n36(A('parcelaTxt')(p1, gr)) === '3× de R$ 100,00 (a compra toda: R$ 300,00)' && n36(A('parcelaTxt')(p1, gr, true)) === '3× de R$ 100,00 (a compra toda: R$ 300,00)', n36(A('parcelaTxt')(p1, gr)));
    M().push(compra34('f2', { valor: 150, qtd: 1, nParc: 3, venc1: '2026-08-15' }));
    const gs = A('gruposParcelados')().find(x => x.membros.length === 1);
    t('36e: compra sem pedacos: "3× de R$ 50,00" (e curto "3× R$ 50,00"); compra de troca (sem grupo) cai no valor/parcelas; a vista nao diz nada',
      n36(A('parcelaTxt')(gs.dono, gs)) === '3× de R$ 50,00' && n36(A('parcelaTxt')(gs.dono, gs, true)) === '3× R$ 50,00' && n36(A('parcelaTxt')({ pgTipo: 'Parcelado', nParc: 2, valor: 90 }, undefined)) === '2× de R$ 45,00'
      && A('parcelaTxt')({ pgTipo: 'À vista', nParc: 0, valor: 90 }, undefined) === '', S34([A('parcelaTxt')(gs.dono, gs), A('parcelaTxt')(gs.dono, gs, true)]));
    const ficha = modal36(() => A('verFicha')(p1.id));
    t('36e: a ficha do pedaco mostra a parcela da compra e nao "3× de R$ 33,33"', ficha.indexOf('3× de R$ 100,00 (a compra toda: R$ 300,00)') >= 0 && ficha.indexOf('3× de R$ 33,33') < 0, ficha.slice(0, 300));
    setg('consF', 'COMPRA'); setg('consVer', 'itens'); setg('consQ', ''); setg('consOrd', 'emissao'); setg('consJogo', 'todos'); setg('consCol', ''); setg('consCat', ''); setg('consPess', ''); setg('consConta', ''); setg('consGrupoFech', {}); setg('consMenu', false); setg('expandId', null);
    const lista = n36(A('vConsultar')());
    t('36e: a lista da Consulta tambem (o pedaco de R$ 100 mostra a parcela da compra, 3× de R$ 100,00, e nao 3× R$ 33,33)', lista.indexOf('3× de R$ 100,00 (a compra toda: R$ 300,00)') >= 0 && lista.indexOf('3× R$ 33,33') < 0, (lista.match(/3× [^<]{0,60}/g) || []).join(' | '));
  });

  /* ---- 36f: "de fora das contas" agora e de verdade; data do pagamento = vencimento quando ja venceu ---- */
  await bloco36('f', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X', 'Y']));
    M().push(compra34('m1', { valor: 300, nParc: 3, venc1: '2026-08-15', conta: 'X' }));    /* 1 e 2 vencidas (sem marca), 3 vence em 15/10 */
    const sx = () => g('contasBanc').map(cb => r34(sf34(cb)));
    const antes = sx();
    const modal = modal36(() => A('pagarParcela')('m1', 3, 3, 100));
    t('36f: o modal do "✓ paguei" oferece "de fora das contas cadastradas" com valor proprio (—) e a data de HOJE (parcela ainda nao vencida), sem passar de hoje',
      modal.indexOf('<option value="—">(de fora das contas cadastradas — não mexe em saldo nenhum)</option>') >= 0 && modal.indexOf('id="pp_data" type="date" value="2026-09-21" max="2026-09-21"') >= 0, modal.slice(0, 700));
    const modalVenc = modal36(() => A('pagarParcela')('m1', 1, 3, 100));
    t('36f: parcela JA VENCIDA: a data padrao do "Pago em" e o dia do vencimento (confirmar nao move o dinheiro no tempo)', modalVenc.indexOf('id="pp_data" type="date" value="2026-08-15" max="2026-09-21"') >= 0, modalVenc.slice(0, 700));
    Object.keys(campos34).forEach(k => delete campos34[k]);
    ctx.document.getElementById = elCampo34;
    campos34.pp_conta = '—'; campos34.pp_data = '';
    A('confirmarPagarParcela')('m1', 3, 3, 100);
    const mk = M()[0].pgParcelas[3];
    t('36f: escolher "de fora das contas" grava conta "—" e NAO debita conta nenhuma (antes o marcador caia na conta da compra: X ficava 100 a menos); a data vazia vira hoje',
      mk.conta === '—' && mk.d === '2026-09-21' && S34(sx()) === S34(antes) && A('marcaEntraNoSaldo')(M()[0], 3, mk) === 0, S34([mk, antes, sx()]));
    t('36f: o Diagnostico nao chama o "de fora das contas" de "conta excluida"', diag36(/conta excluída/).length === 0, S34(diag36(/conta exclu/)));
    campos34.pp_conta = 'Y'; campos34.pp_data = '2099-01-01';
    A('confirmarPagarParcela')('m1', 2, 3, 100);
    const mk2 = M()[0].pgParcelas[2];
    t('36f: "Pago em" no futuro (2099) volta pra hoje; a conta escolhida (Y) e a que fica gravada', mk2.d === '2026-09-21' && mk2.conta === 'Y', S34(mk2));
    campos34.pp_conta = 'X'; campos34.pp_data = '2026-08-16';
    A('confirmarPagarParcela')('m1', 1, 3, 100);
    t('36f: data valida no passado e respeitada', M()[0].pgParcelas[1].d === '2026-08-16', S34(M()[0].pgParcelas[1]));
    delete campos34.pp_conta; delete campos34.pp_data;
  });

  /* ---- 36g: confirmar as parcelas vencidas com o valor que o app oferece nao move o dinheiro (a ultima leva o residuo) ---- */
  await bloco36('g', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X']));
    M().push(compra34('c3', { valor: 1000, nParc: 3, venc1: '2026-07-15', conta: 'X' }));  /* 15/07, 15/08 e 15/09: as 3 vencidas, nenhuma marcada; cada parcela 333,3333… */
    const gr0 = A('gruposParcelados')()[0], antes = dinheiro36(), datasAntes = A('serieDinheiro')().map(p => p.data);
    t('36g: o valor oferecido: 333,33 · 333,33 · 333,34 (a ultima leva o residuo) e nunca a soma passa de 1000,00',
      A('valorOfertaParcela')(gr0, 1) === 333.33 && A('valorOfertaParcela')(gr0, 2) === 333.33 && A('valorOfertaParcela')(gr0, 3) === 333.34
      && r34(A('valorOfertaParcela')(gr0, 1) + A('valorOfertaParcela')(gr0, 2) + A('valorOfertaParcela')(gr0, 3)) === 1000, S34([1, 2, 3].map(i => A('valorOfertaParcela')(gr0, i))));
    ctx.document.getElementById = elCampo34;
    [1, 2, 3].forEach(i => {
      const html = modal36(() => A('pagarParcela')('c3', i, 3, gr0.vP));
      const dt = (html.match(/id="pp_data" type="date" value="([^"]+)"/) || [])[1], vl = (html.match(/confirmarPagarParcela\('c3',\d,3,([^)]+)\)/) || [])[1];
      Object.keys(campos34).forEach(k => delete campos34[k]); ctx.document.getElementById = elCampo34;
      campos34.pp_conta = 'X'; campos34.pp_data = dt;                                    /* o usuario aceita o que o app ofereceu */
      A('confirmarPagarParcela')('c3', i, 3, +vl);
    });
    const depois = dinheiro36(), marcas = M()[0].pgParcelas;
    t('36g: confirmar as 3 parcelas vencidas com o padrao do app (valor e data) NAO move o dinheiro: fisico, curva, pagas e a pagar ficam iguais, e as datas da curva tambem',
      S34(semVenc36(depois)) === S34(semVenc36(antes)) && S34(A('serieDinheiro')().map(p => p.data)) === S34(datasAntes) && r34(marcas[1].v + marcas[2].v + marcas[3].v) === 1000 && marcas[1].d === '2026-07-15' && marcas[3].d === '2026-09-15', S34([antes, depois, marcas]));
    delete campos34.pp_conta; delete campos34.pp_data;
  });

  /* ---- 36h: "vencido ou a vencer" e a curva diz quanto de venda no app ainda nao caiu ---- */
  await bloco36('h', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X']));
    M().push(compra34('o1', { valor: 300, nParc: 3, venc1: '2026-10-10', conta: 'W' }));  /* conta que NAO esta no cadastro: vai pra "fora das contas" */
    const tela = n36(telaContas34());
    t('36h: a linha "fora das contas cadastradas" diz que conta o que ja venceu tambem ("vencido ou a vencer até +90 dias")', tela.indexOf('vencido ou a vencer até +90 dias: entra') >= 0, (tela.match(/Fora das contas[^<]{0,160}/) || [''])[0]);
    reset();
    M().push({ id: 'va', tipo: 'VENDA', data: '2026-09-10', valor: 200, taxa: 10, canal: 'App', recDias: 30, conta: 'X', qtd: 1, contraparte: 'Cli', vendaDe: 'avulsa' });
    M().push({ id: 'vb', tipo: 'VENDA', data: '2026-09-15', valor: 100, taxa: 0, canal: 'App', recDias: 20, conta: 'X', qtd: 1, contraparte: 'Cli', vendaDe: 'avulsa' });
    M().push({ id: 'vc', tipo: 'VENDA', data: '2026-08-01', valor: 50, taxa: 0, canal: 'App', recDias: 10, conta: 'X', qtd: 1, contraparte: 'Cli', vendaDe: 'avulsa' });   /* ja caiu em 11/08 */
    const sd = A('serieDinheiro')();
    t('36h: a curva conta as vendas no app na data da VENDA, e diz quantas ainda nao cairam na conta e quanto (2 vendas, R$ 280,00 liquidos; a de agosto ja caiu)', sd.naoRepassadas === 2 && r34(sd.naoRepassadasValor) === 280, S34([sd.naoRepassadas, sd.naoRepassadasValor]));
    const serieVazia = Object.assign([], { semData: 0, semDataValor: 0 });
    const html = n36(A('graficoLinhaEstoque')(serieVazia, sd, serieVazia, true, false));
    t('36h: o aviso da curva diz "2 vendas no app (R$ 280,00) ainda nao cairam na conta: a curva as conta na data da venda, e o saldo por conta so depois do repasse"',
      html.indexOf('2 vendas no app (R$ 280,00) ainda não caíram na conta: a curva as conta na data da venda, e o saldo por conta só depois do repasse') >= 0, (html.match(/venda[^<]{0,160}/) || [''])[0]);
    M().splice(1, 2);
    const html1 = n36(A('graficoLinhaEstoque')(serieVazia, A('serieDinheiro')(), serieVazia, true, false));
    t('36h: uma venda so, no singular ("1 venda no app (R$ 180,00) ainda nao caiu na conta: a curva a conta")', html1.indexOf('1 venda no app (R$ 180,00) ainda não caiu na conta: a curva a conta na data da venda') >= 0, (html1.match(/venda[^<]{0,160}/) || [''])[0]);
  });

  /* ---- 36i: juntar compras NAO pode mexer no dinheiro — a juncao e ensaiada numa copia e barrada quando o dinheiro mexe (revisao de 21/09: a 1a trava so olhava "marca + plano diferente") ---- */
  await bloco36('i', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X']));
    const avisos = []; ctx.alert = m => { avisos.push(String(m)); }; ctx.confirm = () => true; ctx.prompt = () => '';
    const mkc = (id, valor, nP, marcas, extra) => compra34(id, Object.assign({ valor, qtd: 1, nParc: nP, venc1: '2026-08-15', conta: 'X', pgParcelas: marcas }, extra || {}));
    const m100 = () => ({ 1: { d: '2026-08-15', v: 100, conta: 'X' } });
    const estado = () => S34(M().map(m => [m.id, m.notaId, m.nParc, m.venc1, m.conta, m.pgParcelas]));
    const barrado = (rot, ids) => {
      const e0 = estado(), d0 = dinheiro36(); avisos.length = 0;
      const ok = A('juntarNotaCore')(ids);
      t('36i: ' + rot + ' — BARRADO, o aviso mostra os numeros do que mexeria, e nada muda (nem plano, nem nota, nem dinheiro)',
        ok === false && avisos.length === 1 && /Não deu pra juntar: juntar mudaria o dinheiro/.test(n36(avisos[0])) && /R\$ [\d.-]+,\d\d → R\$ [\d.-]+,\d\d/.test(n36(avisos[0])) && estado() === e0 && S34(dinheiro36()) === S34(d0), S34([ok, avisos, estado() === e0]));
      return avisos[0];
    };
    /* G — o caso da mensagem: 3× e 6×, a marca so na cabeca */
    M().push(mkc('ja', 300, 3, m100())); M().push(mkc('jb', 600, 6, undefined));
    barrado('3× e 6×, parcela paga so na 1ª (a cabeça)', ['ja', 'jb']);
    /* E e F — MESMO plano (3× e 3×), a marca so numa das duas: o dinheiro mexia mesmo assim (antes a trava nem olhava) */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('ea', 300, 3, m100())); M().push(mkc('eb', 600, 3, undefined));
    barrado('MESMO plano (3× e 3×) com a parcela paga só na cabeça', ['ea', 'eb']);
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('fa', 300, 3, undefined)); M().push(mkc('fb', 600, 3, m100()));
    barrado('MESMO plano (3× e 3×) com a parcela paga só na segunda', ['fa', 'fb']);
    /* so o 1º vencimento difere (mesmo nº de parcelas), as duas com a parcela 1 marcada */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('pa', 300, 3, m100())); M().push(mkc('pb', 300, 3, m100(), { venc1: '2026-09-15' }));
    barrado('só o 1º VENCIMENTO difere', ['pa', 'pb']);
    /* contas diferentes: o dinheiro presumido passaria de uma conta pra outra (o total nao mexe, o saldo de cada conta sim) */
    reset(); setg('contasBanc', banco34(['X', 'Y']));
    M().push(mkc('ca', 300, 3, undefined)); M().push(mkc('cb', 300, 3, undefined, { conta: 'Y' }));
    const msgConta = barrado('contas diferentes (X e Y) cadastradas', ['ca', 'cb']);
    t('36i: e o aviso diz QUAL conta mexeria', /conta "X"/.test(n36(msgConta || '')) && /conta "Y"/.test(n36(msgConta || '')), n36(msgConta || ''));
    /* sem conta cadastrada o texto da conta nao mexe em saldo nenhum: juntar passa */
    reset(); setg('contasBanc', []);
    M().push(mkc('ca', 300, 3, undefined)); M().push(mkc('cb', 300, 3, undefined, { conta: 'Y' }));
    avisos.length = 0;
    t('36i: sem nenhuma conta cadastrada, "conta" é só texto (nenhum saldo mexe): juntar passa', A('juntarNotaCore')(['ca', 'cb']) === true && avisos.length === 0 && M().every(m => m.notaId), S34([avisos, estado()]));
    /* as outras duas portas: soltas + 1 nota, e fundir 2 notas */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('na', 300, 3, m100(), { notaId: 'N1', notaNum: '1' })); M().push(mkc('nb', 300, 3, undefined));
    barrado('compra solta SEM marca entrando numa nota que tem parcela paga (porta "soltas + 1 nota")', ['na', 'nb']);
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('ma', 300, 3, m100(), { notaId: 'N1', notaNum: '1' })); M().push(mkc('mb', 600, 3, undefined, { notaId: 'N2', notaNum: '2' }));
    barrado('FUNDIR 2 notas de mesmo plano com a parcela paga só numa (porta "fundir notas")', ['ma', 'mb']);
    /* plano diferente que NAO mexe no dinheiro (tudo ja venceu nos dois planos): passa — a trava mede o dinheiro, nao o cadastro */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('la', 300, 3, undefined, { venc1: '2026-03-15' })); M().push(mkc('lb', 600, 6, undefined, { venc1: '2026-01-15' }));
    avisos.length = 0;
    const antesL = dinheiro36(), okL = A('juntarNotaCore')(['la', 'lb']);
    t('36i: planos DIFERENTES que não mexem no dinheiro (tudo já venceu, pago 900 antes e depois) juntam: a nota fica com o plano da primeira (3×)',
      okL === true && avisos.length === 0 && M().every(m => m.nParc === 3 && m.notaId) && S34(dinheiro36()) === S34(antesL), S34([okL, avisos, M().map(m => [m.id, m.nParc]), antesL, dinheiro36()]));
    /* mesmo plano: as duas com a parcela 1 marcada — juntar, desfazer e separar nao mexem no dinheiro */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('ka', 300, 3, { 1: { d: '2026-08-15', v: 100, conta: 'X' } }));
    M().push(mkc('kb', 600, 3, { 1: { d: '2026-08-16', v: 200, conta: 'X' } }));
    avisos.length = 0;
    const a0 = dinheiro36(), ok5 = A('juntarNotaCore')(['ka', 'kb']), nid = M().find(m => m.id === 'ka').notaId, a1 = dinheiro36();
    A('desfazerNotaFaz')(nid);
    const a2 = dinheiro36();
    t('36i: juntar duas compras de MESMO plano (uma parcela marcada em cada) numa nota não muda o dinheiro, e desfazer a nota também não', ok5 === true && !!nid && avisos.length === 0 && S34(a1) === S34(a0) && S34(a2) === S34(a0), S34([a0, a1, a2, avisos]));
    A('juntarNotaCore')(['ka', 'kb']);
    const b0 = dinheiro36(); A('separarDaNotaFaz')('kb'); const b1 = dinheiro36();
    t('36i: separar um item da nota (que tem parcela marcada) também não muda o dinheiro, e o item leva a parte dele do pagamento (200) e a nota fica com o resto (100)',
      S34(b1) === S34(b0) && S34(b1) === S34(a0) && r34(M().find(m => m.id === 'kb').pgParcelas[1].v) === 200 && r34(M().find(m => m.id === 'ka').pgParcelas[1].v) === 100, S34([b0, b1, M().map(m => [m.id, m.pgParcelas])]));
    /* se o ensaio quebrar por dentro, BARRA (melhor que juntar sem conferir) e os lancamentos voltam intactos */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('qa', 300, 3, undefined)); M().push(mkc('qb', 300, 3, undefined));
    const serieOrig = g('serieDinheiro'), e1 = estado();
    setg('serieDinheiro', () => { throw new Error('quebrou de proposito'); });
    avisos.length = 0;
    let okQ; try { okQ = A('juntarNotaCore')(['qa', 'qb']); } finally { setg('serieDinheiro', serieOrig); }
    t('36i: se o ensaio quebra por dentro a junção é BARRADA com o aviso "Não consegui conferir" (fail-closed) e nada foi juntado', okQ === false && avisos.length === 1 && /Não consegui conferir se juntar mexe no dinheiro/.test(avisos[0]) && estado() === e1, S34([okQ, avisos, estado() === e1]));
    t('36i: e passado o problema o ensaio não deixou rastro: a mesma junção agora passa e junta', A('juntarNotaCore')(['qa', 'qb']) === true && M().every(m => m.notaId), estado());
    /* ===== rodada 3 (revisor de substancia): projecao e "por emissao" tambem contam; o aviso diz a causa certa; o Fluxo leva o lote inteiro; a cabeca da fusao e uma so ===== */
    /* H — mesmo plano, mesma data, tudo no futuro, uma com conta cadastrada e a outra sem conta: o saldo de hoje nao mexe, mas a projecao (e o "por emissao") moviam R$ 900 calados */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('ha', 300, 3, undefined, { venc1: '2026-10-15' })); M().push(mkc('hb', 300, 3, undefined, { venc1: '2026-10-15', conta: '' }));
    const msgH = barrado('uma compra com conta cadastrada e a outra SEM conta (a projecao do caixa mexeria)', ['ha', 'hb']);
    t('36i: e o aviso diz que o que mexe e a PROJECAO do caixa (nao o saldo de hoje) e aponta a conta como o que difere', /projeção do caixa/.test(n36(msgH || '')) && /contas diferentes \(X · sem conta\)/.test(n36(msgH || '')), n36(msgH || ''));
    t('36i: o aviso e uma LISTA (uma mudanca por linha, com "• ") e nao imprime "R$ -0,00" (o zero negativo da projecao "fora das contas")', /\n• conta "X" \(por emissão\)/.test(n36(msgH || '')) && !/-0,00/.test(n36(msgH || '')), n36(msgH || ''));
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('ha', 300, 3, undefined, { venc1: '2026-10-15', conta: '' })); M().push(mkc('hb', 300, 3, undefined, { venc1: '2026-10-15' }));
    barrado('o mesmo, com a compra SEM conta na frente (a nota ficaria sem conta e a projecao tambem mexe)', ['ha', 'hb']);
    /* sem conta cadastrada, "conta" e so texto: junta, e a nota fica com a conta da cabeca nos itens que nao tinham */
    reset(); setg('contasBanc', []);
    M().push(mkc('ga', 300, 3, undefined, { venc1: '2026-10-15', conta: 'X' })); M().push(mkc('gb', 300, 3, undefined, { venc1: '2026-10-15', conta: '' }));
    avisos.length = 0;
    t('36i: sem conta cadastrada a junção passa e o item que estava sem conta herda a da cabeça (X)', A('juntarNotaCore')(['ga', 'gb']) === true && avisos.length === 0 && M().find(m => m.id === 'gb').conta === 'X', S34([avisos, M().map(m => [m.id, m.conta, m.notaId])]));
    /* a tolerancia e cada dimensao do retrato, provadas SEM montar mundo: o retrato falso devolve dois numeros e so um muda */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('qa', 300, 3, undefined)); M().push(mkc('qb', 300, 3, undefined));
    const retratoOrig = g('retratoJunta'), base36 = () => ({ pago: 100, pagar: 200, saldos: [50], emissao: [40], curva: -100, proj: [10, 20, 30, 40], fora: [1, 2] });
    const com = mod => { let i = 0; const seq = [base36(), Object.assign(base36(), mod)]; setg('retratoJunta', () => seq[Math.min(i++, 1)]);
      try { return A('juntaMudaODinheiro')(['qa', 'qb']); } finally { setg('retratoJunta', retratoOrig); } };
    t('36i: a tolerancia e de 1 centavo e meio: 2 centavos de diferenca barram e meio centavo passa (o ruido do arredondamento nao barra junção honesta)',
      !!com({ pago: 100.02 }) && !com({ pago: 100.005 }) && !!com({ pago: 100.02 }) === true, S34([com({ pago: 100.02 }), com({ pago: 100.005 })]));
    const dims = { pago: { pago: 101 }, pagar: { pagar: 201 }, 'saldo fisico': { saldos: [51] }, 'saldo por emissao': { emissao: [41] }, curva: { curva: -101 }, 'projecao hoje': { proj: [11, 20, 30, 40] },
      'projecao +30': { proj: [10, 21, 30, 40] }, 'projecao +60': { proj: [10, 20, 31, 40] }, 'projecao +90': { proj: [10, 20, 30, 41] }, 'fora entra': { fora: [2, 2] }, 'fora sai': { fora: [1, 3] } };
    Object.keys(dims).forEach(k => t('36i: o ensaio olha ' + k + ' (basta ele mexer pra barrar)', !!com(dims[k]) && (com(dims[k]).difs || []).length >= 1, S34(com(dims[k]))));
    t('36i: e sem NENHUMA diferenca, junta (retrato igual)', com({}) === null, S34(com({})));
    /* a causa certa no aviso: quando o retrato falso mexe e nada de "diferente" se acha entre as compras, o texto diz isso em vez de inventar uma causa */
    let iG = 0; const seqG = [base36(), Object.assign(base36(), { pago: 101 })]; setg('retratoJunta', () => seqG[Math.min(iG++, 1)]);
    avisos.length = 0; try { A('juntarNotaCore')(['qa', 'qb']); } finally { setg('retratoJunta', retratoOrig); }
    t('36i: quando nada de diferente se acha entre as compras o aviso diz pra conferir o plano, a conta e as parcelas pagas (e nao inventa causa)', avisos.length === 1 && /Confira o plano, a conta e as parcelas pagas/.test(avisos[0]) && !/O que achei de diferente/.test(avisos[0]), S34(avisos));
    /* o aviso por causa */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('ja', 300, 3, m100())); M().push(mkc('jb', 600, 6, undefined));
    avisos.length = 0; A('juntarNotaCore')(['ja', 'jb']);
    t('36i: 3× e 6× com parcela paga: o aviso diz "planos de pagamento diferentes (3× a partir de 15/08/2026 · 6× a partir de 15/08/2026)" e que, se de fato diferem, não são a mesma nota',
      /planos de pagamento diferentes \(3× a partir de 15\/08\/2026 · 6× a partir de 15\/08\/2026\)/.test(n36(avisos[0] || '')) && /não são a mesma nota: deixe separadas/.test(avisos[0] || ''), n36(avisos[0] || ''));
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('ea', 300, 3, m100())); M().push(mkc('eb', 600, 3, undefined));
    avisos.length = 0; A('juntarNotaCore')(['ea', 'eb']);
    t('36i: mesmo plano, parcela paga só numa: o aviso diz "parcelas pagas diferentes (… tem paga a parcela 1 · … não tem parcela paga)" e ensina a desmarcar', /parcelas pagas diferentes \(.*tem paga a parcela 1 · .*não tem parcela paga\)/.test(avisos[0] || '') && /desmarque em Fluxo de caixa › Pagas/.test(avisos[0] || '') && !/planos de pagamento diferentes/.test(avisos[0] || ''), n36(avisos[0] || ''));
    /* LOTE DIVIDIDO: no Fluxo de caixa a linha e a COMPRA (o dono no lugar do lote inteiro): juntar leva o lote todo; pelo Consulta, com 1 pedaço só, o aviso diz a causa */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('lr', 300, 3, m100(), { qtd: 3 }));
    const pedL = A('baixarLote')('lr', 1, 'Coleção', { dataSaida: '2026-09-02' });
    M().push(mkc('ls', 300, 3, m100()));
    const dL0 = dinheiro36();
    avisos.length = 0;
    const okParcial = A('juntarNotaCore')(['lr', 'ls']);
    t('36i: juntar SO o dono do lote dividido (o pedaço fica pra trás) com a outra compra: barrado, e o aviso diz que o lote tem 2 pedaços, 1 ficaria de fora, e manda selecionar o lote inteiro',
      okParcial === false && /faz parte de um lote dividido em 2 pedaços, e 1 ficaria de fora da seleção/.test(avisos[0] || '') && /Selecione o lote inteiro/.test(avisos[0] || '') && S34(dinheiro36()) === S34(dL0), n36(avisos[0] || ''));
    /* [22/09] o teste do truncamento em 6 linhas mudou de mundo e foi pra depois do bloco do lote dividido — ver "MUNDO PROPRIO" abaixo */
    t('36i: idsComLote leva os pedaços do lote inteiro (o dono e o pedaço) e deixa a compra solta como está', S34(A('idsComLote')(['ls']).sort()) === S34(['ls']) && A('idsComLote')(['lr']).sort().join() === ['lr', pedL.id].sort().join(), S34([A('idsComLote')(['lr']), pedL.id]));
    setg('fxSelMode', true); setg('fxSel', { lr: 1, ls: 1 }); avisos.length = 0;
    A('juntarFx')();
    t('36i: pelo Fluxo de caixa a MESMA seleção leva o lote inteiro (o pedaço vai junto): junta, o dinheiro não mexe e a seleção do Fluxo se limpa',
      avisos.length === 0 && M().every(m => m.notaId) && M().length === 3 && S34(dinheiro36()) === S34(dL0) && S34(g('fxSel')) === '{}' && g('fxSelMode') === false, S34([avisos, M().map(m => [m.id, m.notaId]), dinheiro36(), dL0]));
    /* MUNDO PROPRIO pro limite de 6 linhas do aviso [22/09]. Ate 21/09 este teste pegava carona no mundo do lote dividido acima, que
       movia 8 dimensoes; depois que a parcela futura passou a descontar o que ja foi pago, aquele mundo passou a mover so 4 (o "a pagar"
       e a projecao pararam de vazar ali) e o truncamento ficaria verde por acaso, sem nunca truncar nada. Aqui os planos, os vencimentos
       e as contas sao diferentes de proposito, pra estourar as 6 linhas de verdade. */
    reset(); setg('contasBanc', banco34(['X', 'Y']));
    M().push(mkc('ma', 300, 2, { 1: { d: '2026-08-15', v: 150, conta: 'X' } }, { venc1: '2026-08-15', conta: 'X' }));   /* 2x ja vencidas: 1 marcada, 1 presumida */
    M().push(mkc('mb', 600, 3, undefined, { venc1: '2026-10-01', conta: 'Y' }));                                        /* 3x todas a vencer, em outra conta */
    const dMax = A('juntaMudaODinheiro')(['ma', 'mb']);
    avisos.length = 0; A('juntarNotaCore')(['ma', 'mb']);
    t('36i: com mais de 6 mudancas o aviso mostra as 6 primeiras e diz quantas ficaram de fora ("• …e mais N mudanças")',
      !!dMax && dMax.difs.length > 6 && /\n• …e mais \d+ mudanças?/.test(avisos[0] || '') && (avisos[0].match(/\n• /g) || []).length === 7,
      S34([dMax && dMax.difs, n36(avisos[0] || '')]));
    /* a cabeca da fusao e UMA so: a nota de maior total dá o plano e o número; a do menor entra nela */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('fa', 300, 3, undefined, { notaId: 'N1', notaNum: '1' })); M().push(mkc('fb', 600, 3, undefined, { notaId: 'N2', notaNum: '2' }));
    avisos.length = 0;
    t('36i: FUNDIR duas notas de mesmo plano e pé de pagamento igual: junta, e a nota de MAIOR total (N2, 600) fica com o número e os itens da menor',
      A('juntarNotaCore')(['fa', 'fb']) === true && avisos.length === 0 && M().every(m => m.notaId === 'N2' && m.notaNum === '2'), S34([avisos, M().map(m => [m.id, m.notaId, m.notaNum])]));
    /* o cenario do 34j que o teste antigo encodava errado: uma compra marcada na parcela 1 e outra NAO marcada (vencida) — os R$ 50 dela sumiam dentro da marca da outra */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('jc', { valor: 300, qtd: 3, nParc: 2, venc1: '2026-08-15', pgParcelas: { 1: { d: '2026-08-15', v: 150, conta: 'X' } } }));
    const jcp2 = A('baixarLote')('jc', 1, 'Coleção', { dataSaida: '2026-09-02' });
    jcp2.pgParcelas = { 1: { d: '2026-08-15', v: 150, conta: 'X' } };
    M().push(compra34('jd', { valor: 100, nParc: 2, venc1: '2026-08-15' }));
    avisos.length = 0;
    t('36i: o cenario antigo do 34j (uma compra com a parcela 1 marcada e a outra sem marca, já vencida) é BARRADO: pago R$ 400,00 → R$ 350,00 (os R$ 50 da outra sumiam)',
      A('juntarNotaCore')(['jc', jcp2.id, 'jd']) === false && /pago R\$ 400,00 → R\$ 350,00/.test(n36(avisos[0] || '')), n36(avisos[0] || ''));
    /* ===== rodada 4 (revisor de substancia): a linha unica do Fluxo, "a pagar" sozinha, causa sem conselho, zero negativo, explicar nao derruba o aviso ===== */
    /* G-1: no Fluxo o lote dividido e UMA linha; expandido nos pedacos, uma linha so abria uma nota de uma compra so */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('sl', 300, 3, undefined, { qtd: 3 }));
    A('baixarLote')('sl', 1, 'Coleção', { dataSaida: '2026-09-02' });
    setg('fxSelMode', true); setg('fxSel', { sl: 1 }); avisos.length = 0;
    A('juntarFx')();
    t('36i: UMA linha só marcada no Fluxo (o lote dividido em 2 pedaços) NÃO abre nota de uma compra: "Marque pelo menos 2 compras", nada é criado e a seleção continua',
      avisos.length === 1 && /Marque pelo menos 2 compras pra juntar numa nota/.test(avisos[0]) && M().every(m => !m.notaId) && g('fxSelMode') === true && S34(g('fxSel')) === S34({ sl: 1 }), S34([avisos, M().map(m => [m.id, m.notaId]), g('fxSel')]));
    /* M-2/M-3: um mundo em que SO "a pagar" mexe — prova que o retrato MEDE "a pagar", nao so que o comparador compara.
       [22/09, reescrito] O mundo antigo (mesmo plano, parcelas pagas diferentes, vencimentos alem de +90) PAROU de mover o dinheiro,
       e isso e a cura fazendo efeito: com a parcela futura valendo (total - pago) / quantas faltam, "a pagar" ficou CONSERVADO na
       juncao — R$ 200 + R$ 200 antes, R$ 400 na nota junta. Restou uma unica porta por onde "a pagar" ainda anda sozinho: a compra
       paga A MAIS, onde as futuras sao presas em zero (nunca negativas). Aqui "xa" tem R$ 400 marcados numa compra de R$ 300, entao
       ela ja nao tem nada a pagar; junta com "xb" e os R$ 400 passam a valer dentro de uma compra de R$ 600, liberando R$ 100 de
       futura. Todo o resto (pago, saldos, por emissao, curva, projecao) fica parado: as marcas estao em parcelas diferentes, na mesma
       conta, e os vencimentos sao de 2027, alem de +90 dias. */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('xa', 300, 3, { 1: { d: '2026-09-01', v: 400, conta: 'X' } }, { venc1: '2027-01-15' }));   /* paga a MAIS: 400 numa compra de 300 */
    M().push(mkc('xb', 300, 3, { 2: { d: '2026-09-01', v: 100, conta: 'X' } }, { venc1: '2027-01-15' }));
    const dx = A('juntaMudaODinheiro')(['xa', 'xb']);
    t('36i: a conferência olha "a pagar" SOZINHA (uma compra paga a mais, marcas em parcelas diferentes, vencimentos além de +90 dias): a pagar R$ 200,00 → R$ 100,00 e nenhuma outra dimensão mexe',
      !!dx && dx.difs.length === 1 && /^a pagar R\$ 200,00 → R\$ 100,00$/.test(n36(dx.difs[0])), S34(dx));
    avisos.length = 0; A('juntarNotaCore')(['xa', 'xb']);
    t('36i: e o aviso diz a causa — "parcelas pagas diferentes" (a 1 numa, a 2 na outra) —, ensina o que fazer e NÃO cai no "avise o Felype"',
      /parcelas pagas diferentes/.test(avisos[0] || '') && /tem paga a parcela 1/.test(avisos[0] || '') && /tem paga a parcela 2/.test(avisos[0] || '') && /Junte só compras no mesmo pé de pagamento/.test(avisos[0] || '') && !/avise o Felype/.test(avisos[0] || ''), n36(avisos[0] || ''));
    /* M-4: causa de conta com conselho, e sem o rodape generico que se contradiz */
    t('36i: causa de CONTA tem o seu conselho ("não são a mesma nota… se uma conta foi digitada errada, corrija") e o aviso não se contradiz com o "confira o plano, a conta…"',
      /contas diferentes \(X · Y\)/.test(n36(msgConta || '')) && /não são a mesma nota\. Se uma conta foi digitada errada/.test(msgConta || '') && !/Confira o plano/.test(msgConta || ''), n36(msgConta || ''));
    /* L-1: valor pequeno negativo */
    const A1 = base36(), D1 = Object.assign(base36(), { curva: -0.004 }); A1.curva = 0.5;
    const dif1 = A('difsRetrato')(A1, D1);
    t('36i: um valor pequeno negativo (−0,004) sai "R$ 0,00" e nunca "R$ -0,00"', dif1.length === 1 && /gráfico de dinheiro R\$ 0,50 → R\$ 0,00$/.test(n36(dif1[0])) && !/-0,00/.test(n36(dif1[0])), S34(dif1));
    /* L-2: explicar a causa e enfeite — se quebrar, o aviso sai so com os numeros e a junção segue barrada */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('ha', 300, 3, undefined, { venc1: '2026-10-15' })); M().push(mkc('hb', 300, 3, undefined, { venc1: '2026-10-15', conta: '' }));
    const causasOrig = g('causasJunta'); setg('causasJunta', () => { throw new Error('quebrou de proposito'); });
    avisos.length = 0; let okC; try { okC = A('juntarNotaCore')(['ha', 'hb']); } finally { setg('causasJunta', causasOrig); }
    t('36i: se explicar a causa quebra, o aviso ainda sai (só com os números) e a junção segue barrada — o dono nunca fica sem resposta',
      okC === false && avisos.length === 1 && /Não deu pra juntar/.test(avisos[0]) && /O que mudaria/.test(avisos[0]) && !/O que achei de diferente/.test(avisos[0]), S34([okC, avisos]));
    const causasOrig2 = g('causasJunta'); setg('causasJunta', () => ({ causas: ['uma diferença qualquer'], conselhos: [] }));
    avisos.length = 0; try { A('juntarNotaCore')(['ha', 'hb']); } finally { setg('causasJunta', causasOrig2); }
    t('36i: quando há causa mas nenhum conselho, o aviso NÃO cai no rodapé "avise o Felype" (o rodapé é só para quando nada de diferente se acha)', /O que achei de diferente entre elas: uma diferença qualquer/.test(avisos[0] || '') && !/avise o Felype/.test(avisos[0] || ''), n36(avisos[0] || ''));
    /* ===== rodada 5 (revisor de substancia): a projeção "de fora das contas" também é dinheiro; rótulos que se distinguem; o botão do Fluxo não cala ===== */
    /* A-1: duas compras na MESMA conta que não é cadastrada; uma cai nos próximos 90 dias e a outra só em 2027. Juntar traz a segunda pra dentro da janela: só o "de fora" mexe */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('fa', 300, 3, undefined, { venc1: '2026-10-05', conta: 'Z' })); M().push(mkc('fb', 300, 3, undefined, { venc1: '2027-06-01', conta: 'Z' }));
    const dF = A('juntaMudaODinheiro')(['fa', 'fb']);
    t('36i: a conferência olha o "de fora das contas" SOZINHO (mesma conta não cadastrada; uma compra nos próximos 90 dias e a outra só em 2027): só "sai de fora das contas" mexe, R$ 300,00 → R$ 600,00',
      !!dF && dF.difs.length === 1 && /^projeção: sai de fora das contas R\$ 300,00 → R\$ 600,00$/.test(n36(dF.difs[0])), S34(dF));
    avisos.length = 0; const okF = A('juntarNotaCore')(['fa', 'fb']);
    t('36i: e a junção é barrada com esse número no aviso, e nada foi juntado', okF === false && avisos.length === 1 && /projeção: sai de fora das contas R\$ 300,00 → R\$ 600,00/.test(n36(avisos[0] || '')) && M().every(m => !m.notaId), S34([okF, avisos]));
    /* A-5: duas compras de mesmo nome (mesmo jogo, categoria e coleção) se distinguem no aviso pelo valor e pela data */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('la1', 300, 3, m100())); M().push(mkc('lb1', 600, 3, undefined));
    avisos.length = 0; A('juntarNotaCore')(['la1', 'lb1']);
    const rotsP = n36(avisos[0] || '').match(/"([^"]+)" tem paga a parcela 1 · "([^"]+)" não tem parcela paga/) || [];
    t('36i: o aviso de "parcelas pagas diferentes" distingue duas compras de MESMO nome pelo valor e pela data (uma "R$ 300,00", a outra "R$ 600,00", as duas de 10/01/2026)',
      rotsP.length === 3 && rotsP[1] !== rotsP[2] && /R\$ 300,00/.test(rotsP[1]) && /R\$ 600,00/.test(rotsP[2]) && /10\/01\/2026/.test(rotsP[1]), S34([rotsP, n36(avisos[0] || '')]));
    /* A-6: o botão do Fluxo também não pode calar — se ler a seleção estoura, avisa, nada é juntado e a seleção continua */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('qa', 300, 3, undefined)); M().push(mkc('qb', 300, 3, undefined));
    const resolveOrig = g('resolveJunta'); setg('resolveJunta', () => { throw new Error('quebrou de proposito'); });
    setg('fxSelMode', true); setg('fxSel', { qa: 1, qb: 1 }); avisos.length = 0;
    try { A('juntarFx')(); } finally { setg('resolveJunta', resolveOrig); }
    t('36i: se ler a seleção do Fluxo estoura, o botão AVISA ("Não consegui juntar agora… Nada foi juntado") em vez de calar; nada é juntado e a seleção continua marcada',
      avisos.length === 1 && /Não consegui juntar agora/.test(avisos[0]) && /Nada foi juntado/.test(avisos[0]) && M().every(m => !m.notaId) && g('fxSelMode') === true && S34(g('fxSel')) === S34({ qa: 1, qb: 1 }), S34([avisos, g('fxSel')]));
    /* ===== rodada 6 (revisor de substância): rótulo de compras IGUAIS, data impossível no rótulo, e o botão da aba Compras ===== */
    /* item 4: mesmo nome, mesmo valor e mesmo dia — o caso comum de dois lançamentos do mesmo produto no mesmo pedido: nada na tela as
       distingue, então o rótulo numera pela ordem em que elas aparecem na LISTA DE COMPRAS (a ordem de `movs`), que é onde o dono vai
       procurar. [22/09] este texto e o do `rotsG` no app diziam "ordem da seleção" e mandavam o dono procurar na lista errada. */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('ta', 300, 3, m100())); M().push(mkc('tb', 300, 3, undefined));
    avisos.length = 0; A('juntarNotaCore')(['ta', 'tb']);
    const rotsQ = n36(avisos[0] || '').match(/"([^"]+)" tem paga a parcela 1 · "([^"]+)" não tem parcela paga/) || [];
    t('36i: duas compras IGUAIS (mesmo nome, valor e dia): o aviso ainda as distingue pela ordem da lista de compras ("1ª de 2 iguais" e "2ª de 2 iguais"), em vez de dizer a mesma coisa duas vezes',
      rotsQ.length === 3 && rotsQ[1] !== rotsQ[2] && /1ª de 2 iguais/.test(rotsQ[1]) && /2ª de 2 iguais/.test(rotsQ[2]), S34([rotsQ, n36(avisos[0] || '')]));
    /* item 8: data impossível não vira "45/13/2026" no rótulo */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('da1', 300, 3, m100(), { data: '2026-13-45' })); M().push(mkc('db1', 600, 3, undefined));
    avisos.length = 0; A('juntarNotaCore')(['da1', 'db1']);
    t('36i: compra com data impossível ("2026-13-45") não vira "45/13/2026" no aviso: o rótulo fica só com o valor', !/45\/13\/2026/.test(n36(avisos[0] || '')) && /tem paga a parcela 1/.test(avisos[0] || ''), n36(avisos[0] || ''));
    /* item 5: o botão irmão (aba Compras) também não pode calar — a leitura da seleção mora no juntarNotaCore, que os dois botões usam */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mkc('wa', 300, 3, undefined)); M().push(mkc('wb', 300, 3, undefined));
    const resolveOrig2 = g('resolveJunta'); setg('resolveJunta', () => { throw new Error('quebrou de proposito'); });
    setg('selMode', true); setg('selIds', { wa: 1, wb: 1 }); avisos.length = 0;
    try { A('juntarNota')(); } finally { setg('resolveJunta', resolveOrig2); }
    t('36i: o botão "juntar" da aba COMPRAS também não cala: se ler a seleção estoura, avisa ("Não consegui juntar agora… Nada foi juntado"), nada é juntado e a seleção continua marcada',
      avisos.length === 1 && /Não consegui juntar agora/.test(avisos[0]) && /Nada foi juntado/.test(avisos[0]) && M().every(m => !m.notaId) && g('selMode') === true && S34(g('selIds')) === S34({ wa: 1, wb: 1 }), S34([avisos, g('selIds')]));
  });

  /* ---- 36j: o que as mutacoes do revisor de medicao mostraram nao ter teste (conta do dono, empate, orfaos, fracao, teto de parcelas) ---- */
  await bloco36('j', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X', 'Y']));
    const sxy = () => g('contasBanc').map(cb => r34(sf34(cb)));
    /* a conta que paga as parcelas da compra e a do DONO (o pedaco que guarda a marca), nao a do 1o pedaco da lista */
    M().push(compra34('a1', { valor: 240, qtd: 2, nParc: 3, venc1: '2026-08-15', conta: 'X' }));
    M().push(compra34('a2', { valor: 60, qtd: 1, nParc: 3, venc1: '2026-08-15', conta: 'Y', loteOrigem: 'a1', situacao: 'Vendido', pgParcelas: { 1: { d: '2026-08-15', v: 100, conta: 'Y' } } }));
    t('36j: a conta que paga a compra dividida e a do DONO (o pedaco que guarda a marca), nao a do 1º pedaco da lista: X fica em 1000 e Y paga a marcada e a vencida (800)', S34(sxy()) === S34([1000, 800]) && A('gruposParcelados')()[0].conta === 'Y' && A('gruposParcelados')()[0].dono.id === 'a2', S34([sxy(), A('gruposParcelados')().map(x => [x.dono.id, x.conta])]));
    /* empate de valor: a de data mais antiga, depois a conta em ordem — nunca a do 1º ou do ultimo pedaco */
    const par = (id, marca) => compra34(id, { valor: 100, qtd: 1, nParc: 3, venc1: '2026-08-15', conta: 'X', loteOrigem: 'b0', situacao: 'Vendido', pgParcelas: marca ? { 1: marca } : undefined });
    const raiz = () => compra34('b0', { valor: 100, qtd: 1, nParc: 3, venc1: '2026-08-15', conta: 'X' });
    const m1 = { d: '2026-08-16', v: 100, conta: 'X' }, m2 = { d: '2026-08-15', v: 100, conta: 'Y' }, m3 = { d: '2026-08-15', v: 100, conta: 'Z' };
    const uniao = L => { setg('movs', L.map(x => JSON.parse(JSON.stringify(x)))); return S34(A('gruposParcelados')()[0].marcas[1]); };
    const esperado = S34({ d: '2026-08-15', v: 100, conta: 'Y' });
    t('36j: empate de valor entre marcas da mesma parcela: vale a de data mais antiga, e com a mesma data a conta em ordem alfabetica — e isso NAO depende da ordem dos pedacos (4 ordens)',
      uniao([raiz(), par('b1', m1), par('b2', m2)]) === esperado && uniao([raiz(), par('b2', m2), par('b1', m1)]) === esperado && uniao([raiz(), par('b3', m3), par('b2', m2)]) === esperado && uniao([raiz(), par('b2', m2), par('b3', m3)]) === esperado,
      S34([uniao([raiz(), par('b1', m1), par('b2', m2)]), uniao([raiz(), par('b2', m2), par('b1', m1)]), uniao([raiz(), par('b3', m3), par('b2', m2)]), uniao([raiz(), par('b2', m2), par('b3', m3)])]));
    /* dono estavel: excluir + restaurar da Lixeira reordena a lista, e o dono (com o plano e a conta dele) nao pode mudar */
    const d1 = compra34('d1', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15', conta: 'X' }), d2 = compra34('d2', { valor: 300, qtd: 3, nParc: 6, venc1: '2026-08-15', conta: 'Y', loteOrigem: 'd1' });
    const donoDe = L => { setg('movs', L.map(x => JSON.parse(JSON.stringify(x)))); const gg = A('gruposParcelados')()[0]; return S34([gg.dono.id, gg.nP, gg.conta, sxy()]); };
    t('36j: sem marca nenhuma o dono e o de MENOR id, seja qual for a ordem dos pedacos (a ordem viaja no merge e muda com excluir + restaurar): mesmo dono, mesmo plano, mesma conta, mesmos saldos',
      donoDe([d1, d2]) === donoDe([d2, d1]) && JSON.parse(donoDe([d2, d1]))[0] === 'd1', S34([donoDe([d1, d2]), donoDe([d2, d1])]));
    const d2m = Object.assign({}, d2, { pgParcelas: { 1: { d: '2026-08-15', v: 50, conta: 'Y' } } });
    t('36j: com marca, o dono e o pedaco que a guarda (d2) nas duas ordens', JSON.parse(donoDe([d1, d2m]))[0] === 'd2' && JSON.parse(donoDe([d2m, d1]))[0] === 'd2', S34([donoDe([d1, d2m]), donoDe([d2m, d1])]));
    /* orfaos: pedacos do mesmo pai apagado sao UMA compra (o dado real tem 2 pedacos assim) */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('o1', { valor: 100, qtd: 1, nParc: 3, venc1: '2026-08-15', loteOrigem: 'morto' }));
    M().push(compra34('o2', { valor: 200, qtd: 2, nParc: 3, venc1: '2026-08-15', loteOrigem: 'morto' }));
    const go = A('gruposParcelados')();
    t('36j: dois pedacos ORFAOS do mesmo pai apagado sao UMA compra de 3 parcelas (nao 2 compras nem 6 parcelas): 1 grupo, R$ 300, 3 linhas', go.length === 1 && go[0].nP === 3 && go[0].tot === 300 && A('aPagar')(true).length + A('aPagar')().length === 3, S34([go.length, A('aPagar')(true).length, A('aPagar')().length]));
    /* fracao de parcela: as parcelas somam o total da compra, nunca mais (2,5× virava 3 parcelas de total/2,5 = 360 numa compra de 300) */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('fr', { valor: 300, nParc: 2.5, venc1: '2026-08-15' }));
    const gf = A('gruposParcelados')()[0], lin = A('aPagar')(true).concat(A('aPagar')());
    t('36j: nº de parcelas fracionado (2,5×) vira 3 parcelas IGUAIS de 100 — a compra de R$ 300 nunca passa de R$ 300 (antes: 3 × 120 = 360) — e o Diagnostico avisa',
      gf.nP === 3 && r34(gf.vP) === 100 && soma34(lin) === 300 && diag36(/Número de parcelas fora do padrão/).length === 1, S34([gf.nP, gf.vP, soma34(lin), diag36(/parcelas fora/)]));
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('gg', { valor: 1200, nParc: 500, venc1: '2026-08-15' }));
    const gg = A('gruposParcelados')()[0], ll = A('aPagar')(true).concat(A('aPagar')());
    t('36j: nº de parcelas acima do teto (500; 999999 travava a tela) e cortado em 120 na leitura: nenhuma tela monta um milhao de linhas; parcela de 10, total 1200; o Diagnostico avisa', gg.nP === 120 && r34(gg.vP) === 10 && ll.length === 120 && diag36(/Número de parcelas fora do padrão/).length === 1, S34([gg.nP, gg.vP, ll.length]));
  });

  /* ---- 36k: chave "__proto__" no JSON de fora, marca torta, contas repetidas, valor de marca em texto, despesa paga, vencParcelaISO fora da faixa ---- */
  await bloco36('k', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X']));
    const base = { id: 'pr', tipo: 'COMPRA', data: '2026-01-10', jogo: 'Pokémon', cat: 'ETB', colecao: '151', qtd: 1, valor: 900, situacao: 'Em estoque', destino: 'Vender', contraparte: 'Loja', conta: 'X', pgTipo: 'Parcelado', nParc: 3, venc1: '2026-08-15' };
    M().push(JSON.parse(JSON.stringify(base)));
    const semChave = dinheiro36();
    reset();
    const marcasFalsas = '{"__proto__":{"1":{"d":"2026-08-15","v":900},"2":{"d":"2026-08-15","v":900},"3":{"d":"2026-08-15","v":900}}}';   /* um mapa de marcas escondido sob __proto__ */
    M().push(Object.assign(JSON.parse(JSON.stringify(base)), { pgParcelas: JSON.parse(marcasFalsas) }));
    const gp = A('gruposParcelados')()[0], cp = A('copiaMarcas')(M()[0].pgParcelas);
    t('36k: JSON de fora com a chave "__proto__" em pgParcelas NAO inventa pagamento (antes trocava o prototipo das marcas: as parcelas 1 a 3 apareciam pagas sem ninguem pagar); o dinheiro e o mesmo do JSON sem a chave, e a copia das marcas nao herda nada',
      Object.keys(gp.marcas).length === 0 && gp.marcas[1] === undefined && cp[1] === undefined && Object.keys(cp).length === 0 && S34(dinheiro36()) === S34(semChave), S34([Object.keys(gp.marcas), gp.marcas[1], cp[1], dinheiro36(), semChave]));
    t('36k: e o Diagnostico mostra a marca com numero fora do padrao ("__proto__")', diag36(/número fora do padrão/).length === 1 && /__proto__/.test(diag36(/número fora do padrão/)[0].titulo), S34(diag36(/fora do padr/)));
    reset();
    M().push(Object.assign(JSON.parse(JSON.stringify(base)), { pgParcelas: { '2.0': { d: '2026-08-15', v: 100 }, ' 3': { d: '2026-08-15', v: 100 }, '0': { d: '2026-08-15', v: 100 }, 1: { d: '2026-08-15', v: 300 } } }));
    const comLixo = dinheiro36(), av9h = diag36(/número fora do padrão/), avisos9h = av9h.length, tit9h = av9h.length ? av9h[0].titulo : '';
    reset(); M().push(Object.assign(JSON.parse(JSON.stringify(base)), { pgParcelas: { 1: { d: '2026-08-15', v: 300 } } }));
    /* [22/09] eram 3 avisos (um por chave torta); agora e UM por COMPRA, nomeando as 3 chaves — o dono tem um lancamento pra consertar, nao tres */
    t('36k: marca com numero de parcela fora do padrao ("2.0", " 3", "0") nao conta em tela nenhuma (o dinheiro e o de quem so tem a parcela 1 marcada) e o Diagnostico junta as 3 chaves num aviso so, nomeando cada uma',
      S34(comLixo) === S34(dinheiro36()) && avisos9h === 1 && /"2\.0"/.test(tit9h) && /" 3"/.test(tit9h) && /"0"/.test(tit9h), S34([comLixo, dinheiro36(), avisos9h, tit9h]));
    /* duas contas com o mesmo nome */
    reset(); setg('contasBanc', [{ nome: 'K', saldoIni: 1000, saldoData: '' }, { nome: 'K', saldoIni: 1000, saldoData: '' }, { nome: 'Z', saldoIni: 5, saldoData: '' }]);
    t('36k: duas contas cadastradas com o MESMO nome geram o aviso do Diagnostico (cada saldo debita nos dois cadastros); nomes diferentes nao', diag36(/Duas contas com o mesmo nome: "K"/).length === 1 && diag36(/Duas contas/).length === 1, S34(diag36(/Duas contas/)));
    setg('contasBanc', [{ nome: 'K', saldoIni: 1000, saldoData: '' }, { nome: 'Z', saldoIni: 5, saldoData: '' }]);
    t('36k: sem nome repetido, nenhum aviso', diag36(/Duas contas/).length === 0, '');
    /* valor de marca em texto: nunca vira NaN no saldo */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(Object.assign(JSON.parse(JSON.stringify(base)), { pgParcelas: { 1: { d: '2026-08-15', v: 'abc', conta: 'X' }, 2: { d: '2026-09-15', v: '300,00', conta: 'X' } } }));
    const sfv = sf34(g('contasBanc')[0]);
    t('36k: valor da marca em texto ("abc", "300,00") cai no valor da parcela (300): o saldo fica 400 (1000 - 300 - 300) e nunca vira R$ NaN', Number.isFinite(sfv) && r34(sfv) === 400 && A('pgValor')({ v: 'abc' }, 7) === 7 && A('pgValor')({ v: '' }, 7) === 7 && A('pgValor')({ v: 12.5 }, 7) === 12.5, S34([sfv]));
    /* despesa paga: o corte pela data-base da conta olha o dia do PAGAMENTO */
    reset(); setg('contasBanc', [{ nome: 'X', saldoIni: 1000, saldoData: '2026-09-01' }]);
    M().push({ id: 'dp1', tipo: 'DESPESA', data: '2026-08-10', valor: 100, status: 'pago', conta: 'X', dataPagamento: '2026-09-10', natureza: 'ordinaria', cat: 'Frete' });
    M().push({ id: 'dp2', tipo: 'DESPESA', data: '2026-09-10', valor: 40, status: 'pago', conta: 'X', dataPagamento: '2026-08-20', natureza: 'ordinaria', cat: 'Frete' });
    t('36k: despesa paga: a data-base da conta corta pelo dia do PAGAMENTO — a emitida em agosto e paga em 10/09 (depois da data-base) DEBITA (900); a emitida em 10/09 mas paga em agosto (antes) nao', r34(sf34(g('contasBanc')[0])) === 900, S34([sf34(g('contasBanc')[0])]));
    /* vencimento fora da faixa */
    t('36k: vencimento da parcela 0 ou negativa nao existe ("" em vez de 2025-00-31), e a 1 continua sendo o 1º vencimento', A('vencParcelaISO')({ venc1: '2026-08-15' }, 0) === '' && A('vencParcelaISO')({ venc1: '2026-08-15' }, -1) === '' && A('vencParcelaISO')({ venc1: '2026-08-15' }, 1) === '2026-08-15', S34([A('vencParcelaISO')({ venc1: '2026-08-15' }, 0)]));
  });

  /* ---- 36l: o filtro de periodo do Fluxo usa a data LOCAL (em Lisboa/Toquio o dia 01/10 caia em 30/09) ---- */
  await bloco36('l', () => {
    const tz0 = process.env.TZ;
    const src = A('okCtG').toString() + A('vContas').toString();
    try {
      process.env.TZ = 'Europe/Lisbon';
      const x = { m: {}, venc: A('dataDeISO')('2026-10-01') };
      setg('perDe', '2026-10-01'); setg('perAte', '2026-10-31'); setg('ctPess', ''); setg('ctJogo', ''); setg('ctConta', ''); setg('ctCat', '');
      const lisboa = A('okCtG')(x);
      process.env.TZ = 'Asia/Tokyo';
      const toquio = A('okCtG')({ m: {}, venc: A('dataDeISO')('2026-10-31') });
      t('36l: o filtro de periodo do Fluxo usa o dia LOCAL da parcela: em Lisboa a parcela de 01/10 entra no periodo 01-31/10 e em Toquio a de 31/10 tambem (antes UTC: caia em 30/09 e 30/10)', lisboa === true && toquio === true, S34([lisboa, toquio]));
    } finally { process.env.TZ = tz0; setg('perDe', ''); setg('perAte', ''); }
    t('36l: nem o filtro nem o agrupamento por mes do Fluxo leem a data em UTC (sem toISOString em okCtG e em vContas)', !/toISOString/.test(src), (src.match(/.{0,50}toISOString.{0,30}/) || [''])[0]);
  });

  /* ---- 36m: dividir o lote nao muda nem 1 centavo (a soma dos pedacos em ponto flutuante diferia da original no ultimo bit) ---- */
  await bloco36('m', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', [{ nome: 'X', saldoIni: 500, saldoData: '' }]);
    M().push(compra34('c0', { data: '2026-03-10', valor: 145.29, qtd: 2, nParc: 6, venc1: '2026-06-10', conta: 'X' }));
    const f0 = foto34();
    A('baixarLote')('c0', 1, 'Coleção', { dataSaida: '2026-09-02' });
    const f1 = foto34();
    t('36m: dividir o lote de R$ 145,29 (2 pedacos: 72,64 + 72,65) em 6 parcelas nao muda NENHUM numero ao centavo — antes a projecao de +30 dias saltava de 378,93 pra 378,92 so porque a soma dos pedacos diferia no ultimo bit',
      S34(f0) === S34(f1) && f0.proj[1] === 378.93, S34([f0.proj, f1.proj]));
    /* o total do grupo e em CENTAVOS: pedacos com fracao de centavo (dado importado) somam 20,008 e o total e 20,01 — arredondar em milesimos nao fecha em centavos */
    reset(); setg('contasBanc', [{ nome: 'X', saldoIni: 500, saldoData: '' }]);
    M().push(compra34('sc', { data: '2026-03-10', valor: 10.004, qtd: 2, nParc: 2, venc1: '2026-06-10', conta: 'X' }));
    M().push(compra34('sd', { data: '2026-03-10', valor: 10.004, qtd: 1, nParc: 2, venc1: '2026-06-10', conta: 'X', loteOrigem: 'sc' }));
    t('36m: o total da compra dividida e em centavos (10,004 + 10,004 = 20,008 vira 20,01), nao 20,008 nem 20,0080', A('gruposParcelados')()[0].tot === 20.01, S34(A('gruposParcelados')().map(x => x.tot)));
  });

  /* ===== 37. PACOTE A (2026-09-22) =====
     Tres pendencias que a rodada de 21/09 deixou abertas de proposito, mais as arestas pequenas da rodada 6b:
       (1) despesa "a pagar" JA VENCIDA saia do saldo fisico e sumia da projecao — vencer nao e pagar;
       (2) o valor da parcela FUTURA ignorava o que ja foi pago, entao "pago + a pagar" nao fechava com o total depois de editar o plano;
       (3) editar o plano (1o vencimento, no de parcelas, conta) de uma compra com parcela vencida/paga mexia no dinheiro sem mostrar quanto.
     Cada bloco aqui prova UM comportamento pelo caminho do usuario e tem mutacao correspondente na bateria (prefixo `rev8-`). */
  console.log('');
  console.log('=== 37. pacote A: despesa a pagar vencida, parcela futura = (total - pago) / restantes, edicao de plano com os numeros ===');
  /* o mesmo pre-requisito das secoes 34 e 36: se uma funcao nova nao existir no app carregado, isto diz QUAL, em vez de deixar o bloco
     explodir com um erro de referencia. Tambem e a checagem mecanica de "a peca esta ligada?" pras 6 funcoes que este pacote criou. */
  const FUNCS37 = ['valorFuturaParcela', 'valoresFuturosDoGrupo', 'chaveParcelaOk', 'aplicaEdicaoCompra', 'aplicaEdicaoNota', 'ensaioEdicao',
    'edicaoMudaODinheiro', 'textoEdicaoDinheiro', 'mudouOPlanoDaCompra', 'mudouOPlanoDaNota', 'perguntaEdicao', 'salvarEdicaoNota', 'isoLocal', 'provaReal',
    /* [22/09, bloco 37e] as duas funcoes de convencao de despesa e as telas que as consomem: se alguma sumir, isto diz QUAL em vez de o bloco explodir */
    'caixaDaDespesa', 'emissaoDaDespesa', 'extratoHtml', 'extratoRows', 'saldoBaseExtrato', 'fluxoBuckets', 'vPainel', 'montarPlanilhaTCG'];
  const faltam37 = FUNCS37.filter(n => { try { return typeof A(n) !== 'function'; } catch (e) { return true; } });
  t('37a: [pre-requisito] o app carregado tem as ' + FUNCS37.length + ' funcoes desta secao', faltam37.length === 0, 'FALTAM no app: ' + faltam37.join(', '));
  const bloco37 = (rot, corpo) => faltam37.length ? Promise.resolve() : bloco34(rot, corpo, '37');

  /* ---- 37a: despesa "a pagar" ja vencida — nao sai do bolso, mas aparece na projecao em todos os horizontes ---- */
  await bloco37('a', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X']));                                                     /* so X cadastrada; Z fica de fora */
    M().push(compra34('av', { valor: 200, nParc: 0, pgTipo: 'À vista', venc1: '', data: '2026-09-01', conta: 'X' }));
    const antes = foto34();                                                                 /* o mundo ANTES de a despesa existir */
    M().push({ id: 'dV', tipo: 'DESPESA', data: '2026-09-10', valor: 40, status: 'apagar', natureza: 'ordinaria', cat: 'Luz', conta: 'X' });   /* vencida ha 11 dias */
    const dep = foto34();
    t('37a: despesa "a pagar" ja vencida NAO sai do saldo fisico da conta (fica em ' + fmt34(antes.saldos[0]) + ', como antes de ela existir) e NAO entra na curva do grafico',
      S34(dep.saldos) === S34(antes.saldos) && dep.curva === antes.curva, S34([antes.saldos, dep.saldos, antes.curva, dep.curva]));
    t('37a: mas ela SAI do saldo "por emissao" (' + fmt34(antes.emissao[0]) + ' -> ' + fmt34(dep.emissao[0]) + ') — as duas convencoes seguem rotuladas e diferentes de proposito',
      dep.emissao[0] === r34(antes.emissao[0] - 40), S34([antes.emissao, dep.emissao]));
    t('37a: ja vencida, ela entra na projecao em TODOS os horizontes (+30, +60 e +90 caem 40 cada) e "hoje" continua sendo o saldo fisico',
      dep.proj[0] === antes.proj[0] && dep.proj[1] === r34(antes.proj[1] - 40) && dep.proj[2] === r34(antes.proj[2] - 40) && dep.proj[3] === r34(antes.proj[3] - 40), S34([antes.proj, dep.proj]));
    t('37a: e continua na lista "A pagar", com o valor e a data dela', A('aPagar')().some(x => x.m.id === 'dV' && x.valor === 40), S34(A('aPagar')().map(x => [x.m.id, x.valor])));
    /* pagar de verdade: ai sim o dinheiro sai, na data do PAGAMENTO */
    A('marcarPago')('dV');
    const pago = foto34();
    t('37a: marcada como paga (hoje, 21/09), ela finalmente sai do saldo fisico e entra na curva — e some da lista de pendentes, entao o horizonte nao a desconta DE NOVO (+30 = o proprio saldo)',
      M().find(m => m.id === 'dV').dataPagamento === '2026-09-21' && pago.saldos[0] === r34(antes.saldos[0] - 40) && pago.curva === r34(antes.curva - 40) && pago.proj[0] === r34(antes.proj[0] - 40) && pago.proj[1] === pago.proj[0],
      S34([M().find(m => m.id === 'dV').status, M().find(m => m.id === 'dV').dataPagamento, pago.saldos, pago.curva, pago.proj]));
    /* despesa a pagar FUTURA: continua sem debitar, e so entra no horizonte que a alcanca */
    reset(); setg('contasBanc', banco34(['X']));
    M().push({ id: 'dF', tipo: 'DESPESA', data: '2026-11-10', valor: 25, status: 'apagar', natureza: 'ordinaria', cat: 'Luz', conta: 'X' });
    const fut = A('projecaoCaixa')();
    t('37a: despesa "a pagar" futura (10/11) continua nao debitando o saldo e so aparece a partir do horizonte que a alcanca (+60 e +90, nunca +30)',
      totSf34() === 1000 && fut.atual === 1000 && fut.d30 === 1000 && fut.d60 === 975 && fut.d90 === 975, S34(fut));
    /* conta FORA do cadastro: segue o escopo "fora das contas", vencida ou nao */
    reset(); setg('contasBanc', banco34(['X']));
    M().push({ id: 'dZ', tipo: 'DESPESA', data: '2026-09-10', valor: 55, status: 'apagar', natureza: 'ordinaria', cat: 'Gas', conta: 'Z' });
    const fz = A('projecaoCaixa')();
    t('37a: despesa "a pagar" vencida numa conta que NAO esta no cadastro nao mexe nos numeros — vai pra linha "fora das contas" (sai R$ 55,00)',
      fz.atual === 1000 && fz.d30 === 1000 && fz.d90 === 1000 && fz.fora.sai === 55 && fz.fora.n === 1, S34(fz));
    /* [C6] despesa sem data legivel nao pode sumir dos dois lugares ao mesmo tempo: vence HOJE, como a parcela sem 1o vencimento */
    reset(); setg('contasBanc', banco34(['X']));
    M().push({ id: 'dNull', tipo: 'DESPESA', data: '', valor: 33, status: 'apagar', natureza: 'ordinaria', cat: 'Luz', conta: 'X' });
    const fn = A('projecaoCaixa')(), ln = A('aPagar')().find(x => x.m.id === 'dNull');
    t('37a: despesa "a pagar" sem data legivel vence HOJE e nunca some: entra na projecao em todos os horizontes e a linha nao mostra data invalida',
      !!ln && isFinite(+ln.venc) && fn.d30 === 967 && fn.d90 === 967 && totSf34() === 1000, S34([ln && String(ln.venc), fn]));
  });

  /* ---- 37b: a parcela que ainda vai vencer vale (total - o que ja foi pago) / quantas faltam ---- */
  await bloco37('b', () => {
    const avisos = [], perguntas = [];
    ctx.alert = m => { avisos.push(String(m)); };
    ctx.confirm = m => { perguntas.push(String(m)); return true; };
    const editar37 = (id, campos) => {
      const rec = M().find(m => m.id === id);
      setg('editId', id); setg('tipoSel', 'COMPRA'); setg('tela', 'lancar'); setg('pgTipo', 'Parcelado'); setg('_fotosPend', []);
      setg('_db', null); setg('_syncReady', false); setg('_restaurando', false); setg('_baseH', {});
      Object.keys(campos34).forEach(k => delete campos34[k]);
      Object.assign(campos34, { f_val: String(rec.valor), f_data: rec.data, f_jogo: 'Pokémon', f_cat: 'ETB', f_col: '151', f_idi: '—', f_qtd: String(rec.qtd), f_cp: 'Loja',
        f_sit: 'Em estoque', f_nparc: String(rec.nParc), f_venc1: rec.venc1, f_conta: rec.conta, f_taxa: '0', f_pg: 'Parcelado' }, campos || {});
      ctx.document.getElementById = elCampo34;
      avisos.length = 0; perguntas.length = 0;
      A('salvar')();
    };
    const futuras37 = () => A('aPagar')().filter(x => x.pi);
    const pagoMais = () => r34(A('contasPagas')().filter(x => x.pi).reduce((s, x) => s + x.valor, 0));
    const aPagarTudo = () => r34(futuras37().reduce((s, x) => s + x.valor, 0));
    const fecha = () => r34(pagoMais() + aPagarTudo());

    /* (a) o caso que abriu a pendencia: editar o plano de uma compra que ja tem parcela paga */
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X']));
    M().push(compra34('ea', { valor: 300, nParc: 3, venc1: '2026-10-01', conta: 'X', pgParcelas: { 1: { d: '2026-09-01', v: 100, conta: 'X' } } }));
    t('37b(a): 3x de R$ 300 com R$ 100 ja pagos na 1a: as 2 que faltam valem R$ 100 cada e pago + a pagar fecha em R$ 300',
      futuras37().length === 2 && futuras37().every(x => x.valor === 100) && fecha() === 300, S34([futuras37().map(x => [x.pi, x.valor]), pagoMais(), aPagarTudo()]));
    editar37('ea', { f_nparc: '6' });
    t('37b(a): editada de 3x pra 6x, as 5 que faltam valem R$ 40 (nao os R$ 50 do plano) e pago + a pagar fecha em R$ 300 — antes desta cura dava R$ 350 numa compra de R$ 300',
      M().find(m => m.id === 'ea').nParc === 6 && futuras37().length === 5 && futuras37().every(x => x.valor === 40) && fecha() === 300,
      S34([M().find(m => m.id === 'ea').nParc, futuras37().map(x => [x.pi, x.valor]), pagoMais(), aPagarTudo()]));
    t('37b(a): o aviso "a vencer" da curva tambem fala pelo valor novo: R$ 200,00 (5 x 40), nao R$ 250,00 (5 x 50 do plano)',
      A('serieDinheiro')().semPagarValor === 200, S34([A('serieDinheiro')().semPagar, A('serieDinheiro')().semPagarValor]));
    t('37b(a): a ficha e a Consulta seguem mostrando o valor do PLANO ("6× de R$ 50,00"), que e o que esta escrito no contrato da loja',
      A('parcelaTxt')(M().find(m => m.id === 'ea'), A('gruposParcelados')()[0]).indexOf('6× de ' + fmt34(50)) === 0, A('parcelaTxt')(M().find(m => m.id === 'ea'), A('gruposParcelados')()[0]));

    /* (b) SEM MARCA NENHUMA nada muda — e o caso de toda a base real de hoje. Tres mundos: compra solta, lote dividido e nota. */
    const soVP = () => {
      const gs = A('gruposParcelados')();
      if (!gs.length || !gs.every(gr => gr.fut === null)) return false;
      return futuras37().concat(A('aPagar')(true)).every(x => { const gr = gs.find(y => y.dono === x.m); return !!gr && x.valor === gr.vP; });
    };
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('b1', { valor: 300, nParc: 3, venc1: '2026-08-15', conta: 'X' }));
    const b1ok = soVP(), b1n = futuras37().length + A('aPagar')(true).length;
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('b2', { valor: 300, qtd: 3, nParc: 3, venc1: '2026-08-15', conta: 'X' }));
    A('baixarLote')('b2', 1, 'Coleção', { dataSaida: '2026-09-02' });
    const b2ok = soVP(), b2n = futuras37().length + A('aPagar')(true).length;
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('b3', { valor: 300, nParc: 3, venc1: '2026-08-15', conta: 'X', notaId: 'N9', notaNum: '9' }));
    M().push(compra34('b4', { valor: 200, nParc: 3, venc1: '2026-08-15', conta: 'X', notaId: 'N9', notaNum: '9' }));
    const b3ok = soVP(), b3n = futuras37().length + A('aPagar')(true).length;
    t('37b(b): sem marca de pagamento nenhuma — compra solta, lote dividido e nota — NADA muda: a conta nova nem roda (fut = null) e toda parcela vale o valor do plano',
      b1ok && b2ok && b3ok && b1n === 3 && b2n === 3 && b3n === 3, S34([b1ok, b2ok, b3ok, b1n, b2n, b3n]));

    /* (c) centavos: a ULTIMA futura leva o residuo, e a soma fecha no total exato */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('ce', { valor: 100.01, nParc: 3, venc1: '2026-10-01', conta: 'X', pgParcelas: { 1: { d: '2026-09-01', v: 33.34, conta: 'X' } } }));
    const gce = A('gruposParcelados')()[0];
    t('37b(c): centavos — R$ 100,01 em 3x com R$ 33,34 pagos: as duas que faltam valem 33,34 e 33,33 (a ultima leva o residuo) e tudo soma R$ 100,01 exatos',
      A('valorFuturaParcela')(gce, 2) === 33.34 && A('valorFuturaParcela')(gce, 3) === 33.33 && fecha() === 100.01, S34([[2, 3].map(i => A('valorFuturaParcela')(gce, i)), pagoMais(), aPagarTudo()]));

    /* (d) marcas que somam mais que o total: as futuras vao a ZERO, nunca a negativo (e nunca imprimem "R$ -0,00") */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('ov', { valor: 300, nParc: 3, venc1: '2026-10-01', conta: 'X', pgParcelas: { 1: { d: '2026-09-01', v: 400, conta: 'X' } } }));
    const gov = A('gruposParcelados')()[0], vsOv = [2, 3].map(i => A('valorFuturaParcela')(gov, i));
    t('37b(d): compra paga A MAIS (R$ 400 marcados numa compra de R$ 300): as que faltam valem R$ 0,00 — nunca valor negativo, nunca "-0"',
      vsOv.every(v => v === 0 && !Object.is(v, -0)) && futuras37().every(x => x.valor === 0) && fmt34(vsOv[0]).indexOf('-') < 0, S34([vsOv, futuras37().map(x => x.valor), fmt34(vsOv[0])]));

    /* (e) presumidas (vencidas sem marca) + marca + futura na MESMA compra */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('pv', { valor: 600, nParc: 4, venc1: '2026-07-05', conta: 'X', pgParcelas: { 1: { d: '2026-07-05', v: 200, conta: 'X' } } }));
    const gpv = A('gruposParcelados')()[0], vencs = A('aPagar')(true);
    t('37b(e): 4x de R$ 600 vencendo desde 05/07 com R$ 200 marcados na 1a: as 2 vencidas sem marca continuam valendo os R$ 150 do plano (a regra as conta pagas no vencimento) e a unica futura vale R$ 100 — pago + a pagar = R$ 600',
      vencs.length === 2 && vencs.every(x => x.valor === 150) && futuras37().length === 1 && futuras37()[0].valor === 100 && A('valorFuturaParcela')(gpv, 4) === 100 && fecha() === 600,
      S34([vencs.map(x => [x.pi, x.valor]), futuras37().map(x => [x.pi, x.valor]), pagoMais(), aPagarTudo()]));
    t('37b(e): o saldo fisico e a curva NAO mudam por causa disso — a parcela paga e a presumida seguem pelo valor que sempre valeram (200 marcados + 2 x 150 presumidos = 500)',
      sf34(g('contasBanc')[0]) === 500 && r34(A('serieDinheiro')()[A('serieDinheiro')().length - 1].total) === -500, S34([sf34(g('contasBanc')[0]), A('serieDinheiro')().map(p => [p.data, p.total])]));

    /* (f) marca ALEM do plano (sobra de editar o no de parcelas) tambem conta como pago */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('al', { valor: 300, nParc: 2, venc1: '2026-10-01', conta: 'X', pgParcelas: { 1: { d: '2026-09-01', v: 100, conta: 'X' }, 3: { d: '2026-09-01', v: 50, conta: 'X' } } }));
    const gal = A('gruposParcelados')()[0];
    t('37b(f): a marca ALEM do plano (parcela 3 numa compra 2x, R$ 50) conta como paga: a unica futura vale R$ 150 (300 - 100 - 50), nao R$ 200',
      A('valorFuturaParcela')(gal, 2) === 150 && futuras37().length === 1 && futuras37()[0].valor === 150 && fecha() === 300,
      S34([A('valorFuturaParcela')(gal, 2), futuras37().map(x => [x.pi, x.valor]), pagoMais(), aPagarTudo()]));

    /* (d2) DADO TORTO nos numeros novos: nada pode virar NaN, Infinity nem "R$ -0,00" na tela */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('tt', { valor: 'abc', nParc: 3, venc1: '2026-10-01', conta: 'X', pgParcelas: { 1: { d: '2026-09-01', v: 'xyz', conta: 'X' }, 2: { d: 'nao-e-data', v: null, conta: 'X' } } }));
    const gtt = A('gruposParcelados')()[0], vsTt = [1, 2, 3].map(i => A('valorFuturaParcela')(gtt, i)), txtTt = futuras37().map(x => fmt34(x.valor)).join(' ');
    t('37b(d2): com valor "abc" e marcas com v "xyz"/null, o valor da parcela futura continua sendo numero de verdade (nada de NaN, Infinity ou "-0") e a tela nao imprime lixo',
      vsTt.every(v => typeof v === 'number' && isFinite(v) && !Object.is(v, -0)) && !/NaN|Infinity|undefined|-0,00/.test(txtTt) && !/NaN|Infinity/.test(S34(foto34())),
      S34([vsTt, txtTt, foto34()]));

    /* (g) o valor que o modal "✓ paguei" oferece pra uma parcela futura e o valor novo — e aceita-lo nao mexe nas outras */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('mo', { valor: 300, nParc: 6, venc1: '2026-10-01', conta: 'X', pgParcelas: { 1: { d: '2026-09-01', v: 100, conta: 'X' } } }));
    const linMo = futuras37().find(x => x.pi === 2);
    ctx.document.getElementById = elCampo34;
    const htmlMo = modal36(() => A('pagarParcela')('mo', 2, 6, linMo.valor));
    const vlMo = (htmlMo.match(/confirmarPagarParcela\('mo',2,6,([^)]+)\)/) || [])[1];
    t('37b(g): o modal "✓ paguei" de uma parcela futura oferece R$ 40,00 (o que ela vale hoje), nao os R$ 50,00 do plano',
      linMo.valor === 40 && +vlMo === 40 && htmlMo.indexOf(fmt34(40)) >= 0, S34([linMo.valor, vlMo]));
    Object.keys(campos34).forEach(k => delete campos34[k]); ctx.document.getElementById = elCampo34;
    campos34.pp_conta = 'X'; campos34.pp_data = (htmlMo.match(/id="pp_data" type="date" value="([^"]+)"/) || [])[1];
    A('confirmarPagarParcela')('mo', 2, 6, +vlMo);
    t('37b(g): aceitar o valor oferecido grava a marca de R$ 40,00 e NAO mexe nas outras (as 4 que sobram continuam a R$ 40) — pago + a pagar segue em R$ 300',
      M().find(m => m.id === 'mo').pgParcelas[2].v === 40 && futuras37().length === 4 && futuras37().every(x => x.valor === 40) && fecha() === 300,
      S34([M().find(m => m.id === 'mo').pgParcelas, futuras37().map(x => [x.pi, x.valor]), pagoMais(), aPagarTudo()]));
    delete campos34.pp_conta; delete campos34.pp_data;
  });

  /* ---- 37c: editar o plano mostra os NUMEROS antes de confirmar (compra e nota) ---- */
  await bloco37('c', () => {
    const avisos = [], perguntas = [];
    let resp = true;
    ctx.alert = m => { avisos.push(String(m)); };
    ctx.confirm = m => { perguntas.push(String(m)); return resp; };
    ctx.document.body.insertAdjacentHTML = () => {};
    const editar37 = (id, campos) => {
      const rec = M().find(m => m.id === id);
      setg('editId', id); setg('tipoSel', 'COMPRA'); setg('tela', 'lancar'); setg('pgTipo', 'Parcelado'); setg('_fotosPend', []);
      setg('_db', null); setg('_syncReady', false); setg('_restaurando', false); setg('_baseH', {});
      Object.keys(campos34).forEach(k => delete campos34[k]);
      Object.assign(campos34, { f_val: String(rec.valor), f_data: rec.data, f_jogo: 'Pokémon', f_cat: 'ETB', f_col: '151', f_idi: '—', f_qtd: String(rec.qtd), f_cp: 'Loja',
        f_sit: 'Em estoque', f_nparc: String(rec.nParc), f_venc1: rec.venc1, f_conta: rec.conta, f_taxa: '0', f_pg: 'Parcelado', f_obs: rec.obs || '' }, campos || {});
      ctx.document.getElementById = elCampo34;
      avisos.length = 0; perguntas.length = 0;
      A('salvar')();
    };
    const editarNota37 = (nid, campos) => {
      const its = M().filter(m => m.notaId === nid && !m.loteOrigem), h = its[0];
      const base = { ne_data: h.data, ne_num: h.notaNum || '', ne_venc1: h.venc1 || '', ne_frete: '0', ne_taxa: '0' };
      its.forEach(m => { base['ne_q_' + m.id] = String(+m.qtd || 1); base['ne_p_' + m.id] = String(+m.valor || 0); });
      Object.keys(campos34).forEach(k => delete campos34[k]);
      Object.assign(campos34, base, campos || {});
      ctx.document.getElementById = elCampo34;
      avisos.length = 0; perguntas.length = 0;
      A('salvarEdicaoNota')(nid);
    };

    /* (1) COMPRA com parcelas ja vencidas: trocar o 1o vencimento mexe no dinheiro e o aviso traz os numeros */
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X']));
    M().push(compra34('q1', { valor: 900, nParc: 3, venc1: '2026-06-15', conta: 'X' }));   /* 15/06, 15/07 e 15/08: as 3 vencidas, contadas como pagas */
    const antesQ1 = S34(M().map(m => [m.id, m.venc1, m.nParc, m.conta]));
    resp = false;
    editar37('q1', { f_venc1: '2027-01-15' });                                              /* joga tudo pro futuro: o "pago" desaba */
    t('37c: trocar o 1o vencimento de uma compra com 3 parcelas ja vencidas PERGUNTA antes, com os numeros: "pago R$ 900,00 → R$ 0,00" e o saldo da conta voltando',
      perguntas.length === 1 && /^Mudar o plano assim mexe no dinheiro:/.test(perguntas[0]) && /pago R\$\s900,00 → R\$\s0,00/.test(perguntas[0])
      && /conta "X" R\$\s100,00 → R\$\s1\.000,00/.test(perguntas[0]) && /gráfico de dinheiro R\$\s-900,00 → R\$\s0,00/.test(perguntas[0])
      /* o aviso corta em 6 linhas e diz quantas ficaram de fora: 7 mudancas viram 6 linhas + "…e mais 1 mudança" (7 marcadores no total) */
      && /\n• …e mais 1 mudança$/m.test(perguntas[0].split('\n\nOK')[0]) && (perguntas[0].match(/\n• /g) || []).length === 7, S34(perguntas));
    t('37c: respondendo Cancelar, NADA e gravado — o lancamento fica exatamente como estava',
      S34(M().map(m => [m.id, m.venc1, m.nParc, m.conta])) === antesQ1 && A('contasPagas')().filter(x => x.pi).length === 3, S34([antesQ1, M().map(m => [m.id, m.venc1, m.nParc, m.conta])]));
    resp = true;
    editar37('q1', { f_venc1: '2027-01-15' });
    t('37c: respondendo OK, a edicao e gravada (o 1o vencimento passa pra 2027 e as 3 parcelas viram "a vencer")',
      M()[0].venc1 === '2027-01-15' && A('contasPagas')().filter(x => x.pi).length === 0 && A('aPagar')().filter(x => x.pi).length === 3 && sf34(g('contasBanc')[0]) === 1000,
      S34([M()[0].venc1, A('contasPagas')().filter(x => x.pi).length, sf34(g('contasBanc')[0])]));

    /* (2) edicao que NAO mexe no plano nao pergunta; e plano que mexe SO na projecao passa em silencio */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('q2', { valor: 900, nParc: 3, venc1: '2026-06-15', conta: 'X' }));
    editar37('q2', { f_obs: 'anotacao nova' });
    t('37c: trocar so a observacao NAO pergunta nada (mudar o plano e que dispara o aviso, nao editar qualquer campo)',
      perguntas.length === 0 && M()[0].obs === 'anotacao nova' && M()[0].venc1 === '2026-06-15', S34([perguntas, M()[0].obs]));
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('q2b', { valor: 900, nParc: 3, venc1: '2026-06-15', conta: 'X' }));   /* 3 vencidas: o "pago" e 900 */
    const pagoQ2b = r34(A('contasPagas')().filter(x => x.pi).reduce((s, x) => s + x.valor, 0));
    editar37('q2b', { f_val: '600' });
    const pagoQ2c = r34(A('contasPagas')().filter(x => x.pi).reduce((s, x) => s + x.valor, 0));
    t('37c: mudar o PRECO (900 -> 600) mexe no dinheiro de verdade (pago 900 -> 600) e mesmo assim NAO pergunta — o preco mexer no dinheiro e a definicao da coisa, e perguntar ali viraria ruido em toda correcao de valor',
      perguntas.length === 0 && M()[0].valor === 600 && pagoQ2b === 900 && pagoQ2c === 600, S34([perguntas, M()[0].valor, pagoQ2b, pagoQ2c]));
    /* [achado da auto-revisao de 22/09] sem 1o vencimento, quem manda no calendario e a DATA da compra: mudar a data tem de perguntar,
       mesmo com o campo "1a parcela vence em" intocado */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('q2c', { valor: 900, nParc: 3, venc1: '', data: '2026-06-15', conta: 'X' }));   /* sem venc1: o calendario sai da data */
    const pagoQ2d = r34(A('contasPagas')().filter(x => x.pi).reduce((s, x) => s + x.valor, 0));
    editar37('q2c', { f_data: '2027-01-15' });
    t('37c: numa compra SEM 1o vencimento, a data da compra E o calendario das parcelas — mudar so a data pergunta, com os numeros (pago 900 -> 0)',
      pagoQ2d === 900 && perguntas.length === 1 && /Mudar o plano assim mexe no dinheiro/.test(perguntas[0]) && /pago R\$\s900,00 → R\$\s0,00/.test(perguntas[0]) && M()[0].data === '2027-01-15',
      S34([pagoQ2d, perguntas, M()[0].data]));
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('q2d', { valor: 900, nParc: 3, venc1: '2026-06-15', data: '2026-01-10', conta: 'X' }));   /* COM venc1: a data nao mexe no calendario */
    editar37('q2d', { f_data: '2026-02-10' });
    t('37c: [controle] com 1o vencimento preenchido, corrigir so a data da compra NAO pergunta — ali a data nao mexe no calendario das parcelas',
      perguntas.length === 0 && M()[0].data === '2026-02-10', S34([perguntas, M()[0].data]));
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('q3', { valor: 900, nParc: 3, venc1: '2026-11-10', conta: 'X' }));    /* as 3 ainda vao vencer: nada foi pago */
    editar37('q3', { f_venc1: '2027-03-10' });                                               /* so empurra os vencimentos pra frente */
    t('37c: adiar o vencimento de uma compra TODA no futuro nao pergunta nada — so a projecao do caixa muda, e isso e rotina',
      perguntas.length === 0 && M()[0].venc1 === '2027-03-10' && A('projecaoCaixa')().d90 === 1000, S34([perguntas, M()[0].venc1, A('projecaoCaixa')()]));

    /* (3) a PORTA IRMA: a nota tem a sua propria tela de edicao, e ela tambem mexe no dinheiro pelo 1o vencimento */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('n1', { valor: 600, nParc: 3, venc1: '2026-06-15', conta: 'X', notaId: 'NT', notaNum: '7' }));
    M().push(compra34('n2', { valor: 300, nParc: 3, venc1: '2026-06-15', conta: 'X', notaId: 'NT', notaNum: '7' }));
    const antesNT = S34(M().map(m => [m.id, m.venc1, m.valor]));
    resp = false;
    editarNota37('NT', { ne_venc1: '2027-01-15' });
    t('37c: a mesma coisa pela tela da NOTA: trocar o 1o vencimento pergunta UMA vez so, com os numeros do dinheiro ("pago R$ 900,00 → R$ 0,00") E os totais da nota',
      perguntas.length === 1 && /Mudar o plano assim mexe no dinheiro/.test(perguntas[0]) && /pago R\$\s900,00 → R\$\s0,00/.test(perguntas[0])
      && /Salvar a nota corrigida\?/.test(perguntas[0]), S34(perguntas));
    t('37c: Cancelar na nota nao grava nada', S34(M().map(m => [m.id, m.venc1, m.valor])) === antesNT, S34([antesNT, M().map(m => [m.id, m.venc1, m.valor])]));
    resp = true;
    editarNota37('NT', { ne_venc1: '2027-01-15' });
    t('37c: OK na nota grava: os 2 itens passam a vencer a partir de 15/01/2027 e o saldo fisico volta pra 1000',
      M().every(m => m.venc1 === '2027-01-15') && sf34(g('contasBanc')[0]) === 1000, S34([M().map(m => [m.id, m.venc1]), sf34(g('contasBanc')[0])]));
    /* a mesma porta da data-sem-1o-vencimento, agora na NOTA */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('n3', { valor: 600, nParc: 3, venc1: '', data: '2026-06-15', conta: 'X', notaId: 'NU', notaNum: '8' }));
    M().push(compra34('n4', { valor: 300, nParc: 3, venc1: '', data: '2026-06-15', conta: 'X', notaId: 'NU', notaNum: '8' }));
    resp = true;
    editarNota37('NU', { ne_data: '2027-01-15', ne_venc1: '' });
    t('37c: nota SEM 1o vencimento — mudar so a data de emissao move o calendario das parcelas e por isso pergunta, com os numeros',
      perguntas.length === 1 && /Mudar o plano assim mexe no dinheiro/.test(perguntas[0]) && /pago R\$\s900,00 → R\$\s0,00/.test(perguntas[0]) && M().every(m => m.data === '2027-01-15'),
      S34([perguntas, M().map(m => [m.id, m.data, m.venc1])]));

    /* (4) o ensaio quebrando por dentro NAO pode derrubar o salvar nem sumir com o aviso (fail-open declarado) */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('q4', { valor: 900, nParc: 3, venc1: '2026-06-15', conta: 'X' }));
    const retratoOrig = g('retratoJunta');
    let chamadas = 0;
    setg('retratoJunta', () => { chamadas++; throw new Error('retrato quebrado de proposito'); });
    resp = true;
    let explodiu = false;
    try { editar37('q4', { f_venc1: '2027-01-15' }); } catch (e) { explodiu = true; }
    setg('retratoJunta', retratoOrig);
    t('37c: se o ensaio quebrar por dentro, o salvar NAO cai e o aviso NAO some: diz que nao deu pra conferir e deixa a decisao com o dono',
      !explodiu && chamadas > 0 && perguntas.length === 1 && /Não consegui conferir o efeito no dinheiro/.test(perguntas[0]) && /confira depois o saldo das contas/.test(perguntas[0])
      && M()[0].venc1 === '2027-01-15', S34([explodiu, chamadas, perguntas, M()[0].venc1]));

    /* (5) o ensaio devolve os lancamentos INTACTOS: nem o array nem o conteudo podem sobrar mexidos da copia */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(compra34('q5', { valor: 900, nParc: 3, venc1: '2026-06-15', conta: 'X', pgParcelas: { 1: { d: '2026-06-15', v: 300, conta: 'X' } } }));
    const arrayAntes = M(), serialAntes = JSON.stringify(M()), dinAntes = S34(dinheiro36());
    const dEnsaio = A('edicaoMudaODinheiro')(() => A('aplicaEdicaoCompra')(0, Object.assign({}, M()[0], { nParc: 6, venc1: '2027-01-15' }), M()[0]));
    t('37c: depois do ensaio os lancamentos voltam INTACTOS — o mesmo array, o mesmo conteudo serializado e os mesmos numeros de dinheiro',
      M() === arrayAntes && JSON.stringify(M()) === serialAntes && S34(dinheiro36()) === dinAntes && !!dEnsaio && dEnsaio.difs.length > 0,
      S34([M() === arrayAntes, JSON.stringify(M()) === serialAntes, dEnsaio && dEnsaio.difs]));
    t('37c: [controle] o mundo do ensaio nao era vazio — ele rodou sobre uma compra de verdade, com marca de paga', serialAntes.indexOf('pgParcelas') > 0 && serialAntes.length > 100, String(serialAntes.length));
  });

  /* ---- 37d: arestas da rodada 6b — o Diagnostico falando o mesmo dia que o Fluxo, e UMA regra so de "chave canonica" ---- */
  await bloco37('d', () => {
    congela(2026, 9, 21, 10, 0);
    setg('contasBanc', banco34(['X']));
    /* (a) marca ALEM do plano com dia que nao existe ("30/02/2026"): o Fluxo lista em 02/03 e o Diagnostico tem de dizer 02/03 tambem */
    const mk37 = (idc, extra) => compra34(idc, Object.assign({ valor: 300, qtd: 1, nParc: 2, venc1: '2026-08-15', conta: 'X' }, extra || {}));
    M().push(mk37('z1', { qtd: 2 }));
    const ped37 = A('baixarLote')('z1', 1, 'Coleção', { dataSaida: '2026-09-02' });
    M().find(m => m.id === 'z1').pgParcelas = { 3: { d: '2026-02-30', v: 100, conta: 'X' } };      /* alem do plano (2x), dia 30/02 */
    ped37.pgParcelas = { 3: { d: '2026-03-05', v: 100, conta: 'X' } };                              /* o mesmo slot e o mesmo valor, DATA diferente: e o ramo do 9e que imprime datas */
    const linha37 = A('contasPagas')().find(x => x.alem);
    const av37 = A('provaReal')().A.filter(x => /marcada como paga mais de uma vez/.test(x.titulo));
    t('37d: a marca alem do plano com dia que nao existe (30/02/2026) e listada pelo Fluxo em 02/03, e o Diagnostico imprime o MESMO dia — nunca a data crua "30/02/2026"',
      !!linha37 && A('isoLocal')(linha37.venc) === '2026-03-02' && av37.length === 1 && av37[0].detalhe.indexOf('30/02/2026') < 0 && /datas diferentes \(02\/03\/2026 e 05\/03\/2026\)/.test(av37[0].detalhe), S34([linha37 && A('isoLocal')(linha37.venc), av37.map(x => x.detalhe)]));
    /* (c) chave canonica: uma funcao so pras telas de dinheiro e pro Diagnostico */
    t('37d: "chave canonica" e UMA funcao: aceita "1", "2", "10" e recusa "0", "-1", "2.0", " 3", "01", "__proto__" e a de 20 digitos',
      ['1', '2', '10'].every(k => A('chaveParcelaOk')(k) === true)
      && ['0', '-1', '2.0', ' 3', '01', '__proto__', '12345678901234567890', '1e3', ''].every(k => A('chaveParcelaOk')(k) === false),
      S34(['0', '-1', '2.0', ' 3', '01', '__proto__', '12345678901234567890', '1e3'].map(k => [k, A('chaveParcelaOk')(k)])));
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mk37('z2', { pgParcelas: { 1: { d: '2026-08-15', v: 150, conta: 'X' }, '12345678901234567890': { d: '2026-08-15', v: 90, conta: 'X' } } }));
    const dinZ2 = dinheiro36(), av9h37 = A('provaReal')().A.filter(x => /número fora do padrão/.test(x.titulo)), av9e37 = A('provaReal')().A.filter(x => /marcada como paga mais de uma vez/.test(x.titulo));
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mk37('z2', { pgParcelas: { 1: { d: '2026-08-15', v: 150, conta: 'X' } } }));
    t('37d: a chave de 20 digitos nao entra em nenhum numero (o dinheiro e o mesmo de quem so tem a parcela 1 marcada) e QUEM FALA DELA e o 9h, uma vez — o 9e cala',
      S34(dinZ2) === S34(dinheiro36()) && av9h37.length === 1 && /12345678901234567890/.test(av9h37[0].titulo) && av9e37.length === 0,
      S34([dinZ2, dinheiro36(), av9h37.map(x => x.titulo), av9e37.length]));
    /* (d) lote dividido com a mesma chave torta nos dois pedacos: UM aviso, dizendo em quantos lancamentos — nao um por pedaco */
    reset(); setg('contasBanc', banco34(['X']));
    M().push(mk37('z3', { qtd: 2, pgParcelas: { '2.0': { d: '2026-08-15', v: 50, conta: 'X' } } }));
    const pz3 = A('baixarLote')('z3', 1, 'Coleção', { dataSaida: '2026-09-02' });
    pz3.pgParcelas = { '2.0': { d: '2026-08-15', v: 50, conta: 'X' } };
    const av9hL = A('provaReal')().A.filter(x => /número fora do padrão/.test(x.titulo));
    t('37d: lote dividido com a mesma chave torta nos 2 pedacos gera UM aviso so, dizendo que sao 2 lancamentos da mesma compra — nao dois avisos identicos',
      av9hL.length === 1 && /em 2 lançamentos da mesma compra/.test(av9hL[0].titulo), S34(av9hL.map(x => x.titulo)));
  });

  /* ---- 37e: as DUAS convencoes de despesa, cada uma num lugar so — e nenhuma tela lida como a outra ----
     ESTE E O TESTE QUE A RODADA DE 21/09 NAO ESCREVEU. Ela mudou a regra de CAIXA em `saldoFisicoConta` e `projecaoCaixa` e deixou os
     outros leitores de `status==='apagar'` na regra velha; um revisor reproduziu 1.000 no Painel contra 850 no Extrato e leu como "duas
     telas de dinheiro discordando". Medido em 22/09 num fixture com os TRES tipos de movimento, o Extrato nao e uma tela de caixa
     quebrada: ele e o detalhe do saldo POR EMISSAO nos tres (despesa a pagar vencida 850 vs 1.000; compra parcelada 700 vs 800; venda no
     app sem repasse 1.200 vs 1.000), e o teste 34m ja fixava isso. Religar so a despesa deixaria a tela metade num regime e metade no
     outro. Entao o que este bloco prova e o que de fato tem de valer:
       (1) as telas de CAIXA (Painel, Fluxo de caixa, projecao) dao o MESMO numero entre si;
       (2) o Extrato da o numero POR EMISSAO, DIZ que e ele, e imprime o fisico ao lado — nenhum dos dois pode ser lido como o outro;
       (3) essa comparacao so aparece quando e honesta (uma conta cadastrada, sem "ate", sem recorte por dimensao, e so se diferirem);
       (4) a regra de caixa e a de emissao moram cada uma numa funcao, e o app nao tem mais nenhuma copia solta da condicao;
       (5) as duas copias inline que sobraram de proposito (Lucro e planilha) concordam com `emissaoDaDespesa` numa matriz. */
  await bloco37('e', () => {
    const R37 = { extConta: g('extConta'), extOrdem: g('extOrdem'), relJogo: g('relJogo'), relCol: g('relCol'), relPess: g('relPess'), relCat: g('relCat'), relExtrato: g('relExtrato') };
    try {
      congela(2026, 9, 21, 10, 0);
      setg('contasBanc', [{ nome: 'X', saldoIni: 1000, saldoData: '' }, { nome: 'Y', saldoIni: 500, saldoData: '' }]);
      setg('perDe', ''); setg('perAte', ''); setg('perSel', 'tudo');
      setg('relJogo', ''); setg('relCol', ''); setg('relPess', ''); setg('relCat', ''); setg('extOrdem', 'desc'); setg('extConta', '');
      M().push({ id: 'e1', tipo: 'DESPESA', data: '2026-09-10', valor: 150, status: 'apagar', natureza: 'ordinaria', cat: 'Luz', conta: 'X' });   /* vencida ha 11 dias */

      /* (1) as tres telas de CAIXA dao o mesmo numero, pelo caminho do usuario: o HTML que a tela devolve */
      setg('tela', 'painel'); const hPa = A('vPainel')();
      const hCt = telaContas34(), pj37 = A('projecaoCaixa')(), sfX = sf34(g('contasBanc')[0]);
      t('37e: despesa "a pagar" vencida de R$ 150 — as tres telas de CAIXA dao o MESMO saldo: Painel "Nas contas (fisico hoje)", Fluxo "Saldo por conta" e projecao "hoje" todas em ' + fmt34(1500) + ', e a conta X segue intacta em ' + fmt34(1000),
        hPa.indexOf('Nas contas (físico hoje)') >= 0 && hPa.indexOf('>' + fmt34(1500) + '<') >= 0 && hCt.indexOf('>' + fmt34(1500) + '<') >= 0 && pj37.atual === 1500 && sfX === 1000,
        S34([hPa.indexOf('Nas contas (físico hoje)'), hPa.indexOf('>' + fmt34(1500) + '<'), hCt.indexOf('>' + fmt34(1500) + '<'), pj37.atual, sfX]));

      /* (2) o Extrato da conta X e o OUTRO numero — e agora diz qual e, e imprime o de caixa ao lado */
      setg('extConta', 'X'); setg('relExtrato', true); const hEx = A('extratoHtml')();
      t('37e: o Extrato da conta X fecha em ' + fmt34(850) + ' — o saldo POR EMISSAO, nao o fisico — e isso e o esperado: ele e o detalhe do `saldoConta`, como o 34m ja fixava',
        r34(A('saldoConta')(g('contasBanc')[0])) === 850 && hEx.indexOf('saldo ' + fmt34(850)) >= 0, S34([A('saldoConta')(g('contasBanc')[0]), hEx.indexOf('saldo ' + fmt34(850))]));
      t('37e: e o rodape nao deixa mais um numero ser lido como o outro: diz "Saldo final (por emissao)", imprime o "fisico hoje" desta conta (' + fmt34(1000) + ') e explica a diferenca',
        hEx.indexOf('Saldo final (por emissão)') >= 0 && hEx.indexOf('físico hoje') >= 0 && hEx.indexOf('<b>' + fmt34(1000) + '</b>') >= 0
        && hEx.indexOf('ainda não saiu nem entrou de verdade') >= 0 && hEx.indexOf('na data de emissão') >= 0,
        hEx.slice(Math.max(0, hEx.indexOf('Saldo final') - 40), hEx.indexOf('Saldo final') + 700));

      /* (3) CONTROLE NEGATIVO do par de numeros: ele some em toda situacao em que a comparacao seria desonesta */
      const semPar = rot => A('extratoHtml')().indexOf('físico hoje') < 0;
      setg('extConta', '');
      const p1 = semPar();                                            /* todas as contas: o extrato inclui conta fora do cadastro, que o fisico nao soma */
      setg('extConta', 'X'); setg('perAte', '2026-09-15');
      const p2 = semPar();                                            /* com "ate": o final e o saldo de uma data passada, nao o de hoje */
      setg('perAte', ''); setg('relCat', 'Luz');
      const p3 = semPar();                                            /* recorte por dimensao: o rodape e "resultado do recorte", nao saldo */
      setg('relCat', '');
      t('37e: o par de numeros so aparece quando a comparacao e honesta — em "todas as contas", com "ate" preenchido e com recorte por dimensao ele NAO aparece (senao seria numero fora do escopo)',
        p1 && p2 && p3, S34([p1, p2, p3]));
      setg('movs', []);
      M().push({ id: 'e2', tipo: 'DESPESA', data: '2026-09-10', dataPagamento: '2026-09-10', valor: 150, status: 'pago', natureza: 'ordinaria', cat: 'Luz', conta: 'X' });
      const hPg = A('extratoHtml')();
      t('37e: e quando os dois numeros BATEM (despesa paga: caixa e emissao dao ' + fmt34(850) + ' os dois) o par nao aparece — a linha existe pra explicar diferenca, nao pra poluir',
        r34(A('saldoConta')(g('contasBanc')[0])) === 850 && sf34(g('contasBanc')[0]) === 850 && hPg.indexOf('físico hoje') < 0, S34([A('saldoConta')(g('contasBanc')[0]), sf34(g('contasBanc')[0])]));

      /* a convencao tambem decide a DATA da linha: por emissao, a despesa paga conta no dia em que foi LANCADA, nao no do pagamento — o
         contrario do que o caixa faz com a MESMA despesa. Emitida 05/08 e paga 15/09: com o periodo desde 01/09 ela fica no saldo inicial
         do extrato e nao vira linha; sem periodo, a linha nasce em 05/08. (O caixa a conta em 15/09 — `caixaDaDespesa`, provado acima.) */
      setg('movs', []); setg('perDe', '2026-09-01'); setg('perAte', ''); setg('extConta', 'X');
      M().push({ id: 'e3', tipo: 'DESPESA', data: '2026-08-05', dataPagamento: '2026-09-15', valor: 60, status: 'pago', natureza: 'ordinaria', cat: 'Luz', conta: 'X' });
      const base3 = r34(A('saldoBaseExtrato')()), rows3 = A('extratoRows')();
      setg('perDe', ''); const rows3b = A('extratoRows')(), lin3 = rows3b.find(r => r.id === 'e3');
      t('37e: por emissao, a despesa paga conta na data em que foi LANCADA (05/08), nao na do pagamento (15/09): com o periodo desde 01/09 ela fica no saldo inicial (' + fmt34(940) + ') e nao vira linha; sem periodo, a linha nasce em 05/08',
        base3 === 940 && rows3.every(r => r.id !== 'e3') && !!lin3 && lin3.data === '2026-08-05' && r34(lin3.v) === -60,
        S34([base3, rows3.map(r => r.id), lin3 && [lin3.data, lin3.v]]));

      /* (4) cada regra num lugar so: `caixaDaDespesa` decide o caixa, `emissaoDaDespesa` decide a competencia, e o FONTE do app nao tem
         mais nenhuma copia solta da condicao. E o tripwire desta rodada: escrever uma 3a copia a mao reprova aqui na hora. */
      const dAp = { tipo: 'DESPESA', data: '2026-09-10', valor: 150, status: 'apagar' };
      const dPg = { tipo: 'DESPESA', data: '2026-08-05', dataPagamento: '2026-09-15', valor: 60, status: 'pago' };
      t('37e: `caixaDaDespesa` e a regra de CAIXA inteira: "a pagar" vencida devolve null (nao debita) e paga devolve a data do PAGAMENTO (15/09), nunca a da emissao (05/08)',
        A('caixaDaDespesa')(dAp) === null && A('caixaDaDespesa')(dPg).data === '2026-09-15' && A('caixaDaDespesa')(dPg).valor === 60 && A('caixaDaDespesa')({ tipo: 'VENDA' }) === null,
        S34([A('caixaDaDespesa')(dAp), A('caixaDaDespesa')(dPg)]));
      t('37e: `emissaoDaDespesa` e a regra de COMPETENCIA inteira: vencida entra na data da emissao, futura fica fora, e fica DENTRO quando o usuario pediu um periodo que a alcanca (comPeriodo + perAte)',
        !!A('emissaoDaDespesa')(dAp, '2026-09-21') && A('emissaoDaDespesa')(dAp, '2026-09-21').data === '2026-09-10'
        && A('emissaoDaDespesa')({ tipo: 'DESPESA', data: '2026-11-10', valor: 25, status: 'apagar' }, '2026-09-21') === null
        && (function () { setg('perAte', '2026-12-31'); const r = A('emissaoDaDespesa')({ tipo: 'DESPESA', data: '2026-11-10', valor: 25, status: 'apagar' }, '2026-09-21', true); setg('perAte', ''); return !!r; })(),
        'ver caixaDaDespesa/emissaoDaDespesa');
      /* 22/09 (P2 do handoff): a contagem casava so a forma LITERAL (zero espaco, igual o resto do
         arquivo sai hoje) — uma reescrita com espaco extra ("m.status === 'apagar' && ...") passava
         batido. `srcCompacto` remove todo espaco/quebra de linha dos DOIS lados antes de comparar,
         entao a forma com espaco cai na mesma contagem. O que isto NAO pega, de proposito, porque
         casamento de texto nao resolve: reescrita pelo COMPLEMENTO LOGICO (ex.: inverter a condicao
         e trocar o retorno) muda o texto por completo — quem protege contra essa e o teste (5) logo
         abaixo, que compara RESULTADO contra `emissaoDaDespesa` numa matriz, nao o texto do fonte. */
      const srcCompacto = src.replace(/\s+/g, '');
      const cSolta = srcCompacto.split("m.status==='apagar'&&m.data>hoje)").length - 1, cSoltaP = srcCompacto.split("m.status==='apagar'&&!perAte&&m.data>hoje)").length - 1;
      const cMotor = srcCompacto.split("m.status==='apagar'&&!perAte&&m.data>hojeISO2)").length - 1, cPlan = srcCompacto.split("m.status==='apagar'&&m.data>hojeISO2)").length - 1;
      t('37e: o fonte do app tem ZERO copias soltas da condicao (eram 5 antes desta rodada) e exatamente 3 inline declaradas — 1 no Lucro e 2 na planilha, ambas comentadas como regime de competencia; uma 4a copia reprova aqui',
        cSolta === 0 && cSoltaP === 0 && cMotor === 1 && cPlan === 2
        /* 3, nao 2, desde 22/09 (P2 do handoff): `contasPagas` reimplementava a mesma condicao de
           `caixaDaDespesa` em vez de chamar a funcao (2 copias da regra de CAIXA, risco de divergir);
           o conserto trocou a copia solta por uma 2a chamada real, entao o total de "caixaDaDespesa(m)"
           no fonte sobe de 1 (definicao) + 1 (chamada antiga) para 1 + 2 — subir esse numero de novo
           SEM remover uma copia solta e que reprova. */
        && src.split('caixaDaDespesa(m)').length - 1 === 3 && src.split('emissaoDaDespesa(m,').length - 1 === 5,
        S34({ soltas: cSolta + cSoltaP, motor: cMotor, planilha: cPlan, caixaDaDespesa: src.split('caixaDaDespesa(m)').length - 1, emissaoDaDespesa: src.split('emissaoDaDespesa(m,').length - 1 }));

      /* (5) a matriz: as copias inline (Lucro e planilha) tem de dar a MESMA resposta que `emissaoDaDespesa`. E o que impede a divergencia
         de 21/09 de acontecer de novo pelo outro lado — se alguem mexer na funcao e esquecer as copias, a matriz fica vermelha. */
      const casos37 = [['vencida', '2026-09-10', 'apagar'], ['de hoje', '2026-09-21', 'apagar'], ['futura', '2026-11-10', 'apagar'],
        ['sem data', '', 'apagar'], ['paga vencida', '2026-09-10', 'pago'], ['paga futura', '2026-11-10', 'pago']];
      const ruins37 = [];
      [['', 'sem periodo'], ['2026-12-31', 'com "ate" no futuro']].forEach(([pa, rotP]) => {
        casos37.forEach(([rotC, dt, st]) => {
          setg('movs', []); setg('perDe', ''); setg('perAte', pa);
          const mv = { id: 'mx', tipo: 'DESPESA', data: dt, valor: 70, status: st, natureza: 'ordinaria', cat: 'Luz', conta: 'X' };
          M().push(mv);
          const espMotor = !!A('emissaoDaDespesa')(mv, '2026-09-21', true), espPlan = !!A('emissaoDaDespesa')(mv, '2026-09-21', false);
          const doMotor = r34(A('motor')(false).despTotal) > 0;
          const abaD = (A('montarPlanilhaTCG')().abas || []).find(a => a.nome === 'Despesas');
          const doPlan = !!abaD && abaD.linhas[0][4] === 'sim';
          if (doMotor !== espMotor) ruins37.push(['Lucro', rotP, rotC, espMotor, doMotor]);
          if (doPlan !== espPlan) ruins37.push(['planilha', rotP, rotC, espPlan, doPlan]);
        });
      });
      setg('perAte', '');
      t('37e: nas ' + (casos37.length * 2) + ' combinacoes (vencida/hoje/futura/sem data x a pagar/paga x com e sem "ate"), o Lucro e a aba Despesas da planilha dao a MESMA resposta que `emissaoDaDespesa` — as copias inline nao podem divergir da funcao em silencio',
        ruins37.length === 0, S34(ruins37.slice(0, 6)) + ' | divergencias: ' + ruins37.length);

      /* (6) a mesma logica pro lado CAIXA: `contasPagas()` (a lista de "contas pagas", que o P2 de
         22/09 passou a montar chamando `caixaDaDespesa` em vez de reimplementar a condicao) tem de
         bater com `caixaDaDespesa` — presenca, data E valor. Antes desta rodada o UNICO guardiao do
         lado caixa era a contagem de texto da linha 5967 acima: um mutante que troca a data de
         PAGAMENTO pela de EMISSAO dentro de `contasPagas` passava 1090/0 verde, sem nenhum teste
         acusar (achado do revisor confere-no-disco, 22/09). Os fixtures de `casos37` nao bastam aqui
         porque os casos 'pago' deles nao gravam `dataPagamento` (cai no fallback = mesma data da
         emissao, entao nao discrimina); por isso um fixture proprio, com `dataPagamento` explicito e
         diferente de `data`. */
      const casosCx37 = [
        ['vencida sem marcar (a pagar)', { data: '2026-09-10', status: 'apagar' }],
        ['futura sem marcar (a pagar)', { data: '2026-11-10', status: 'apagar' }],
        ['paga, pagamento != emissao', { data: '2026-08-05', dataPagamento: '2026-09-15', status: 'pago' }],
        ['paga sem dataPagamento gravada (cai na emissao)', { data: '2026-09-12', status: 'pago' }],
      ];
      const ruinsCx37 = [];
      casosCx37.forEach(([rotC, campos]) => {
        setg('movs', []);
        const mv = Object.assign({ id: 'mx', tipo: 'DESPESA', valor: 70, natureza: 'ordinaria', cat: 'Luz', conta: 'X' }, campos);
        M().push(mv);
        const esp = A('caixaDaDespesa')(mv);
        const linha = (A('contasPagas')() || []).find(x => x.m === mv);
        if (!!esp !== !!linha) { ruinsCx37.push(['presenca', rotC, !!esp, !!linha]); return; }
        if (esp) {
          const dataReal = A('isoLocal')(linha.venc);
          if (dataReal !== esp.data) ruinsCx37.push(['data', rotC, esp.data, dataReal]);
          if (r34(linha.valor) !== r34(esp.valor)) ruinsCx37.push(['valor', rotC, esp.valor, linha.valor]);
        }
      });
      t('37e: (6) `contasPagas` bate com `caixaDaDespesa` em presenca, data e valor nos ' + casosCx37.length + ' casos — inclusive quando dataPagamento diverge da emissao; se contasPagas voltar a datar pela emissao, aqui denuncia mesmo com a contagem de texto calada',
        ruinsCx37.length === 0, S34(ruinsCx37.slice(0, 6)) + ' | divergencias: ' + ruinsCx37.length);
    } finally { Object.keys(R37).forEach(n => { try { setg(n, R37[n]); } catch (e) { /* build sem a var */ } }); }
  });

  /* ---- 37f: o saldo INICIAL do extrato tem de conhecer TODOS os tipos que mexem em dinheiro ----
     Achado da arbitragem rev14->rev15 (ponto 6), PRE-EXISTENTE e JA PUBLICADO: `saldoBaseExtrato` so tinha ramo para venda, compra a vista e
     despesa. Transferencia (e aporte/retirada) e o dinheiro dado numa troca guardam a conta em campos PROPRIOS (contaDe/contaPara/dinConta) e
     faltavam. Como a LINHA do extrato so entra quando esta DENTRO do periodo, um movimento desses ANTERIOR a perDe nao era ignorado: era
     APAGADO da conta — sumia da base E das linhas, e o saldo final errava pelo valor exato dele. Disparava sozinho no periodo padrao de 30
     dias, sem o usuario tocar em nada: qualquer transferencia com mais de 30 dias ficava invisivel para sempre.
     O ORACULO e uma identidade, nao um numero decorado:  saldoBaseExtrato() + soma(linhas do extrato) == saldoConta(conta).
     (Vale quando o periodo nao PROJETA pro futuro: com "ate" no futuro o extrato mostra a despesa "a pagar" futura de proposito — regra do
     `comPeriodo` de `emissaoDaDespesa`, provada no bloco 37e — e o `saldoConta` e sempre de hoje. Ai os dois respondem perguntas diferentes.)
     Mutacoes correspondentes na bateria: prefixo `rev9-`. */
  await bloco37('f', () => {
    const R37f = { extConta: g('extConta'), extOrdem: g('extOrdem'), relJogo: g('relJogo'), relCol: g('relCol'), relPess: g('relPess'), relCat: g('relCat'), relExtrato: g('relExtrato'), saldoConta: A('saldoConta') };
    try {
      congela(2026, 9, 21, 10, 0);
      const monta37f = (movsNovos, opt) => {
        opt = opt || {};
        setg('movs', []); setg('excluidos', {});
        setg('contasBanc', opt.contas || [{ nome: 'X', saldoIni: 1000, saldoData: '' }, { nome: 'Y', saldoIni: 500, saldoData: '' }]);
        setg('perDe', opt.perDe || ''); setg('perAte', opt.perAte || ''); setg('perSel', 'tudo');
        setg('relJogo', ''); setg('relCol', ''); setg('relPess', ''); setg('relCat', ''); setg('extOrdem', 'asc');
        setg('extConta', opt.extConta === undefined ? 'X' : opt.extConta); setg('relExtrato', true);
        movsNovos.forEach(m => M().push(JSON.parse(JSON.stringify(m))));
        const cb = g('contasBanc').find(c => c.nome === g('extConta'));
        const base = r34(A('saldoBaseExtrato')()), rows = A('extratoRows')();
        return { base: base, rows: rows, somaLin: r34(rows.reduce((s, r) => s + r.v, 0)),
          fim: rows.length ? r34(rows[rows.length - 1].saldo) : base, emi: cb ? r34(A('saldoConta')(Object.assign({}, cb))) : null };
      };
      const transf37 = (o) => Object.assign({ id: 'tf', tipo: 'TRANSF', valor: 200, data: '2026-08-01' }, o || {});
      const troca37 = (o) => Object.assign({}, compra34('tk', { data: '2026-08-10', valor: 0, origem: 'TROCA', din: 120, dinConta: 'X', conta: '', nParc: 0, pgTipo: 'À vista', venc1: '' }), o || {});

      /* (1) o caso do achado: transferencia ANTERIOR ao inicio do periodo. Antes do conserto a base vinha 1000 e o extrato fechava em 1000
         com o `saldoConta` em 800 — a conta perdia R$ 200,00 de vista. Agora a base ABSORVE o movimento, que e o mesmo que o saldo inicial faz
         com qualquer outro tipo: nao vira linha (esta fora do periodo) e nao desaparece. */
      const f1 = monta37f([transf37({ contaDe: 'X', contaPara: 'Y' })], { perDe: '2026-09-01' });
      t('37f: transferencia de R$ 200,00 saindo de X em 01/08, com o periodo comecando em 01/09 — ela entra no SALDO INICIAL do extrato (' + fmt34(800) + ', nao ' + fmt34(1000) + '), nao vira linha, e o final fecha com o saldo da conta',
        f1.base === 800 && f1.rows.length === 0 && f1.fim === 800 && f1.emi === 800, S34(f1));

      /* (2) o outro ramo que faltava: o dinheiro dado numa troca, que mora em `dinConta`, nao em `conta` */
      const f2 = monta37f([troca37()], { perDe: '2026-09-01' });
      t('37f: o dinheiro dado numa troca (R$ 120,00 pela conta X em 10/08) tambem entra no saldo inicial quando e anterior ao periodo — ele fica em `dinConta`, e era por isso que o filtro por `m.conta` nao o via',
        f2.base === 880 && f2.rows.length === 0 && f2.fim === 880 && f2.emi === 880, S34(f2));

      /* (3) os dois juntos, que era o 3o cenario quebrado da arbitragem */
      const f3 = monta37f([transf37({ contaDe: 'X', contaPara: 'Y' }), troca37()], { perDe: '2026-09-01' });
      t('37f: os dois no mesmo fixture — a base cai para ' + fmt34(680) + ' e o extrato fecha com o saldo da conta (era aqui que o erro somava os dois de uma vez)',
        f3.base === 680 && f3.fim === 680 && f3.emi === 680, S34(f3));

      /* (4) aporte externo e retirada: os dois lados do mesmo gesto, cada um com so UM dos campos preenchido */
      const f4 = monta37f([transf37({ id: 'ap', contaDe: '', contaPara: 'X' })], { perDe: '2026-09-01' });
      const f5 = monta37f([transf37({ id: 'rt', contaDe: 'X', contaPara: '' })], { perDe: '2026-09-01' });
      t('37f: aporte externo entrando em X (' + fmt34(1200) + ') e retirada saindo de X (' + fmt34(800) + ') antes do periodo — os dois tambem entram no saldo inicial, com o sinal certo',
        f4.base === 1200 && f4.fim === 1200 && f4.emi === 1200 && f5.base === 800 && f5.fim === 800 && f5.emi === 800, S34([f4, f5]));

      /* (5) a transferencia CHEGANDO (contaPara = a conta do extrato): o sinal tem de ser o oposto */
      const f6 = monta37f([transf37({ contaDe: 'Y', contaPara: 'X' })], { perDe: '2026-09-01' });
      t('37f: transferencia CHEGANDO em X antes do periodo soma no saldo inicial (' + fmt34(1200) + ') — trocar o sinal aqui reprova',
        f6.base === 1200 && f6.fim === 1200 && f6.emi === 1200, S34(f6));

      /* (6) escopo: movimento de OUTRA conta nao pode mexer no extrato de X, e troca sem dinheiro nao e movimento de dinheiro */
      const f7 = monta37f([troca37({ id: 'tky', dinConta: 'Y' })], { perDe: '2026-09-01' });
      const f8 = monta37f([troca37({ id: 'tk0', din: 0 })], { perDe: '2026-09-01' });
      t('37f: controle de escopo — troca paga pela conta Y nao mexe no extrato de X, e troca SEM dinheiro (din = 0) nao mexe em conta nenhuma: a base fica em ' + fmt34(1000) + ' nos dois',
        f7.base === 1000 && f7.fim === 1000 && f7.emi === 1000 && f8.base === 1000 && f8.fim === 1000 && f8.emi === 1000, S34([f7, f8]));

      /* (7) em "todas as contas" a transferencia INTERNA soma zero (o dinheiro nao saiu do conjunto) e a linha informativa vale 0 */
      const f9 = monta37f([transf37({ contaDe: 'X', contaPara: 'Y' })], { perDe: '2026-09-01', extConta: '' });
      const f10 = monta37f([transf37({ contaDe: 'X', contaPara: 'Y', data: '2026-09-10' })], { perDe: '2026-09-01', extConta: '' });
      t('37f: em "todas as contas", transferencia interna nao muda o total (' + fmt34(1500) + ') nem quando e anterior ao periodo nem quando e uma linha dentro dele — dinheiro que troca de bolso dentro de casa nao entra nem sai',
        f9.base === 1500 && f9.fim === 1500 && f10.base === 1500 && f10.somaLin === 0 && f10.fim === 1500, S34([f9, f10]));

      /* (7b) aporte e retirada em "todas as contas" passam por um ramo DIFERENTE do de uma conta so (lá o campo que casa e `extConta`; aqui e
         o lado que esta preenchido). O teste (4) acima exercitava so o primeiro: uma mutacao que trocava o sinal do aporte neste ramo
         SOBREVIVIA a bateria. Aqui o dinheiro entra/sai do conjunto de verdade, entao o total TEM de mexer — e o oraculo e a mesma identidade,
         com a soma dos saldos das contas no lugar do saldo de uma. */
      const somaEmi37f = () => r34(g('contasBanc').reduce((s, cb) => s + A('saldoConta')(Object.assign({}, cb)), 0));
      const h1 = monta37f([transf37({ id: 'ap', contaDe: '', contaPara: 'X' })], { perDe: '2026-09-01', extConta: '' });
      const sh1 = somaEmi37f();
      const h2 = monta37f([transf37({ id: 'rt', contaDe: 'X', contaPara: '' })], { perDe: '2026-09-01', extConta: '' });
      const sh2 = somaEmi37f();
      t('37f: em "todas as contas", aporte de fora ANTES do periodo sobe o total para ' + fmt34(1700) + ' e retirada o derruba para ' + fmt34(1300) + ' — dinheiro que cruza a fronteira de casa mexe no total, e trocar o sinal deste ramo reprova',
        h1.base === 1700 && h1.fim === 1700 && r34(h1.base + h1.somaLin) === sh1
        && h2.base === 1300 && h2.fim === 1300 && r34(h2.base + h2.somaLin) === sh2, S34([h1, sh1, h2, sh2]));

      /* (8) a data-base da conta (saldoIni com saldoData): o movimento anterior a ela JA esta dentro do saldo inicial da conta, e o
         `saldoConta` o corta. O corte olhava `m.conta`, que nestes dois tipos e VAZIO, entao virava no-op justamente aqui — a base
         descontava de novo (perDe preenchido) ou a linha aparecia (sem periodo) um dinheiro que o saldo inicial ja continha. */
      const ctsB = [{ nome: 'X', saldoIni: 1000, saldoData: '2026-09-01' }, { nome: 'Y', saldoIni: 500, saldoData: '' }];
      const g1 = monta37f([transf37({ contaDe: 'X', contaPara: 'Y' })], { perDe: '2026-09-01', contas: ctsB });
      const g2 = monta37f([troca37()], { perDe: '2026-09-01', contas: ctsB });
      const g3 = monta37f([transf37({ contaDe: 'X', contaPara: 'Y' })], { contas: ctsB });
      const g4 = monta37f([troca37()], { contas: ctsB });
      t('37f: com a conta X tendo saldo inicial DATADO em 01/09, transferencia e troca anteriores a essa data nao podem ser contadas de novo — nem na base (com periodo) nem como linha (sem periodo): o extrato fica em ' + fmt34(1000) + ' nos 4 casos, como o saldo da conta',
        [g1, g2, g3, g4].every(x => x.base === 1000 && x.fim === 1000 && x.emi === 1000) && g3.rows.length === 0 && g4.rows.length === 0, S34([g1, g2, g3, g4]));
      const g5 = monta37f([transf37({ contaDe: 'X', contaPara: 'Y', data: '2026-09-15' })], { perDe: '2026-09-01', contas: ctsB });
      t('37f: controle negativo do corte — a transferencia POSTERIOR a data-base (15/09) continua valendo: vira linha e derruba o saldo para ' + fmt34(800) + '. Se o corte estivesse largo demais, este caso ficaria em ' + fmt34(1000),
        g5.rows.length === 1 && g5.fim === 800 && g5.emi === 800, S34(g5));

      /* (9) a IDENTIDADE varrida: base + linhas == saldoConta, em todos os fixtures x com e sem periodo. E o oraculo que nao depende de eu
         ter decorado o numero certo — e o mesmo invariante que a arbitragem usou pra achar o buraco. */
      const fix37f = [['transferencia saindo', [transf37({ contaDe: 'X', contaPara: 'Y' })]],
        ['transferencia chegando', [transf37({ contaDe: 'Y', contaPara: 'X' })]],
        ['aporte externo', [transf37({ id: 'ap', contaDe: '', contaPara: 'X' })]],
        ['retirada', [transf37({ id: 'rt', contaDe: 'X', contaPara: '' })]],
        ['dinheiro de troca', [troca37()]],
        ['transferencia + troca', [transf37({ contaDe: 'X', contaPara: 'Y' }), troca37()]],
        ['tudo + compra a vista + despesa vencida', [transf37({ contaDe: 'X', contaPara: 'Y' }), troca37(),
          compra34('cv', { data: '2026-08-20', valor: 300, nParc: 0, pgTipo: 'À vista', venc1: '' }),
          { id: 'dv', tipo: 'DESPESA', data: '2026-09-10', valor: 40, status: 'apagar', natureza: 'ordinaria', cat: 'Luz', conta: 'X' }]]];
      const ruins37f = [];
      fix37f.forEach(([rotF, mv]) => {
        [['2026-09-01', 'periodo desde 01/09'], ['', 'sem periodo'], ['2026-07-01', 'periodo desde 01/07']].forEach(([pd, rotP]) => {
          [['sem data-base', null], ['com data-base 01/09', ctsB]].forEach(([rotC, cts]) => {
            const r = monta37f(mv, { perDe: pd, contas: cts ? JSON.parse(JSON.stringify(cts)) : null });
            if (Math.abs(r34(r.base + r.somaLin) - r.emi) > 0.005) ruins37f.push([rotF, rotP, rotC, r.base, r.somaLin, r.emi]);
          });
        });
      });
      t('37f: a identidade do extrato fecha nas ' + (fix37f.length * 6) + ' combinacoes (7 fixtures x 3 periodos x com e sem data-base): saldo inicial + soma das linhas = saldo da conta, ao centavo',
        ruins37f.length === 0, S34(ruins37f.slice(0, 5)) + ' | quebras: ' + ruins37f.length);

      /* (10) o RODAPE nao pode mais cravar as 3 causas conhecidas quando a diferenca nao vem delas. As 3 (despesa a pagar, parcela a vencer,
         venda no app sem repasse) explicam exatamente a distancia ENTRE AS CONVENCOES, isto e, `saldoConta - saldoFisicoConta`. Quando a
         diferenca que a TELA mostra e maior que essa, sobra pedaco que nao e de nenhuma das 3 — e era justamente o que este bug produzia:
         numero errado E explicacao errada junto (culpava "parcela a vencer" por dinheiro que a tela mesma havia apagado). */
      monta37f([{ id: 'dq', tipo: 'DESPESA', data: '2026-09-10', valor: 150, status: 'apagar', natureza: 'ordinaria', cat: 'Luz', conta: 'X' }]);
      const hOk = A('extratoHtml')();
      t('37f: quando a diferenca vem SO da convencao (despesa a pagar vencida de R$ 150,00), o rodape nomeia as 3 causas conhecidas e nao fala de diferenca inexplicada',
        hOk.indexOf('ainda não saiu nem entrou de verdade') >= 0 && hOk.indexOf('não sabe explicar') < 0, hOk.slice(Math.max(0, hOk.indexOf('físico hoje') - 60), hOk.indexOf('físico hoje') + 420));
      /* prova do OUTRO ramo: com o bug consertado nao existe mais entrada real que o dispare (e bom que nao exista), entao a divergencia e
         injetada trocando `saldoConta` por um dublê. E teste do TEXTO do guarda, nao do bug — o guarda so vale se a tela souber dizer isso. */
      const realSC = A('saldoConta');
      setg('saldoConta', function (cb) { return r34(realSC(cb)) + 200; });
      const hRes = A('extratoHtml')();
      setg('saldoConta', realSC);
      t('37f: e quando sobra diferenca que NAO e de nenhuma das 3 (aqui injetada por dublê de `saldoConta`), o rodape para de cravar uma delas: separa o pedaco da convencao e diz que o resto o app ainda nao sabe explicar',
        hRes.indexOf('não sabe explicar') >= 0 && hRes.indexOf('não é</b> de nenhuma dessas 3 causas conhecidas') >= 0 && A('saldoConta') === realSC,
        hRes.slice(Math.max(0, hRes.indexOf('físico hoje') - 60), hRes.indexOf('físico hoje') + 520));
    } finally { Object.keys(R37f).forEach(n => { try { setg(n, R37f[n]); } catch (e) { /* build sem a var */ } }); }
  });
}).catch(e=>{fail++;console.log('  FALHOU  secao 34 explodiu -> '+((e&&e.stack)||e));}).then(async()=>{
  /* ===== 35. ORACULO POR RAZAO DE EVENTOS: DIVIDIR, RECARREGAR, PAGAR E DESMARCAR NAO MUDAM O DINHEIRO (19/09/2026) =====
     A regra do dinheiro e escrita aqui DE NOVO, em cima da DESCRICAO das compras (valor, plano, marcas, conta) e sem chamar nenhuma tela do app:
     cada parcela vira um evento (data, conta, valor) — marcada: na data/valor/conta da marca; vencida sem marca: no vencimento; a vencer:
     ainda nao; alem do plano: na data da marca. Dai saem, por conta propria, o saldo fisico de cada conta, o ultimo ponto da curva, a
     projecao (com o escopo) e as contagens de a pagar / vencidas / pagas. O app e montado a partir da MESMA descricao, mas depois de uma
     sequencia aleatoria de operacoes que NAO podem mudar o dinheiro: dividir o lote (baixarLote, baixarBoosters), recarregar
     (JSON.parse), pagar uma parcela pela tela e desmarcar. Se o app e o oraculo discordam, um dos dois esta errado — e a discordancia
     aparece com a semente e o cenario. (O mesmo desenho do gerador de 2.500 cenarios que provou o M-1, agora sobre o pagamento por compra.) */
  console.log('');
  console.log('=== 35. oraculo por razao de eventos (cenarios aleatorios: dividir, recarregar, pagar, desmarcar) ===');
  const S35 = s => JSON.stringify(s);
  const r35 = x => Math.round(x * 100) / 100;
  const HOJE35 = '2026-09-21';
  const p2 = n => (n < 10 ? '0' : '') + n;
  const addDias35 = (iso, n) => { const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); };
  const somaMes35 = (iso, i) => {
    const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1, dia = +iso.slice(8, 10);
    const alvo = new Date(Date.UTC(y, m + i, 1)), y2 = alvo.getUTCFullYear(), m2 = alvo.getUTCMonth();
    const ult = new Date(Date.UTC(y2, m2 + 1, 0)).getUTCDate();
    return y2 + '-' + p2(m2 + 1) + '-' + p2(Math.min(dia, ult));
  };
  const isoOk35 = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && (() => { const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))); return d.getUTCFullYear() === +s.slice(0, 4) && d.getUTCMonth() === +s.slice(5, 7) - 1 && d.getUTCDate() === +s.slice(8, 10); })();
  const mulberry35 = seed => { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  /* ---------- gerador: a DESCRICAO das compras, vendas e despesas ---------- */
  const gera35 = rnd => {
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const dataEm = (de, ate) => addDias35(de, int(0, Math.max(0, Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 864e5))));
    const nomes = ['X', 'Y', 'Z'];
    const nc = int(0, 3);
    const contas = nomes.slice(0, nc).map(n => ({ nome: n, saldoIni: int(0, 200) * 10, saldoData: rnd() < 0.3 ? dataEm('2026-05-01', '2026-08-31') : '' }));
    const contaDe = () => pick(['X', 'X', 'Y', 'Z', '']);
    const bordas = ['2026-03-31', '2026-05-31', '2026-07-29', '2026-07-30', '2026-08-31', '2026-01-31', '2026-06-30'];
    const compras = [];
    const nCompras = int(1, 5);
    for (let i = 0; i < nCompras; i++) {
      const parcelada = rnd() < 0.7;
      const nP = parcelada ? int(1, 6) : 0;
      const itens = rnd() < 0.25 ? int(2, 3) : 1;
      const data = dataEm('2026-03-01', '2026-09-20');
      const venc1 = !parcelada ? '' : (rnd() < 0.15 ? '' : (rnd() < 0.05 ? '2026-13-40' : (rnd() < 0.3 ? pick(bordas) : addDias35(data, int(-10, 70)))));
      const c = { id: 'c' + i, conta: contaDe(), data, parcelada, nP, venc1, nota: itens > 1, itens: [], marcas: {} };
      for (let k = 0; k < itens; k++) { const boo = itens === 1 && rnd() < 0.3; c.itens.push({ id: c.id + (itens > 1 ? '_' + k : ''), valor: int(100, 90000) / 100, qtd: itens > 1 ? 1 : int(1, 6), booster: boo, bpu: boo ? int(2, 6) : 0 }); }
      const total = r35(c.itens.reduce((s, x) => s + x.valor, 0)), vP = total / (nP || 1);
      if (parcelada) {
        for (let k = 1; k <= nP; k++) {
          if (rnd() >= 0.3) continue;
          const sorte = rnd();
          const m = { v: r35(vP + pick([0, 0, 0, -5, 5, 12])) };
          if (sorte < 0.8) m.d = dataEm(data, addDias35(HOJE35, 10)); else if (sorte < 0.9) { /* marca sem data */ } else m.d = pick(['lixo', '2026-02-30', '']);
          if (rnd() < 0.3) m.conta = pick(['X', 'Y', 'Z', 'W']);
          if (sorte >= 0.95) c.marcas[k] = dataEm(data, HOJE35); else c.marcas[k] = m;      /* 5%: formato antigo (so a data, em texto) */
        }
        if (rnd() < 0.12) c.marcas[nP + 1] = { d: dataEm(data, HOJE35), v: r35(vP), conta: rnd() < 0.3 ? pick(['X', 'Y']) : undefined };
      }
      compras.push(c);
    }
    const vendas = [], despesas = [];
    for (let i = 0; i < int(0, 3); i++) { const app = rnd() < 0.6; vendas.push({ id: 'v' + i, data: dataEm('2026-07-01', '2026-09-20'), valor: int(100, 50000) / 100, taxa: app ? pick([0, 10, 12.5]) : 0, canal: app ? 'App' : 'Pix', recDias: app ? int(1, 30) : 0, conta: contaDe() }); }
    for (let i = 0; i < int(0, 3); i++) { const st = rnd() < 0.5 ? 'pago' : 'apagar'; despesas.push({ id: 'd' + i, data: dataEm('2026-08-15', '2026-10-30'), valor: int(100, 20000) / 100, status: st, conta: contaDe(), dataPagamento: st === 'pago' && rnd() < 0.4 ? dataEm('2026-08-15', '2026-09-20') : '' }); }
    return { contas, compras, vendas, despesas };
  };

  /* ---------- o oraculo: eventos a partir da descricao (nenhuma tela do app) ---------- */
  const oraculo35 = D => {
    const fis = [], curva = [], fluxos = [], aPagarFut = [], venc = [], pagasParc = [], fechaTot = [];
    const nomesC = D.contas.map(c => c.nome), temContas = D.contas.length > 0;
    const dentro = conta => !temContas || nomesC.indexOf(conta) >= 0;
    let semPagar = 0, semPagarValor = 0, pres = 0, presValor = 0, presSemConta = 0, presSemContaValor = 0;
    D.compras.forEach(c => {
      const total = r35(c.itens.reduce((s, x) => s + x.valor, 0));
      if (!c.parcelada) { fis.push({ data: c.data, conta: c.conta, v: -total, corte: c.data }); curva.push({ data: c.data, v: -total }); return; }
      const vP = total / c.nP;
      const base = isoOk35(c.venc1) ? c.venc1 : (isoOk35(c.data) ? c.data : '');
      const vDe = m => (m && typeof m === 'object' && m.v != null) ? m.v : vP;
      /* as marcas ALEM do plano sao lidas ANTES do laco: o valor delas entra na conta do que ja foi pago */
      const alem35 = Object.keys(c.marcas).filter(ks => {
        const k = +ks; if (!(Number.isInteger(k) && String(k) === ks && k > c.nP)) return false;
        const m = c.marcas[ks]; return isoOk35(typeof m === 'string' ? m : m && m.d);
      });
      const marcadas = [], presumidas = [], futuras = [];
      for (let i = 1; i <= c.nP; i++) {
        const due = base ? somaMes35(base, i - 1) : '';
        const m = c.marcas[i];
        if (m) marcadas.push({ i, due, m });
        else if (due && due < HOJE35) presumidas.push({ i, due });
        else futuras.push({ i, due });
      }
      /* [22/09] O VALOR DA PARCELA QUE AINDA VAI VENCER, derivado aqui de novo e sem olhar o app: o que FALTA (total menos o marcado,
         menos o presumido pago no vencimento, menos o pago alem do plano) dividido por quantas faltam, a ULTIMA levando o residuo de
         centavos. Sem marca nenhuma (nem alem do plano) vale o valor do plano, exatamente como antes deste dia. */
      const pagoExp35 = marcadas.reduce((s, x) => s + vDe(x.m), 0);
      const pagoAlem35 = alem35.reduce((s, ks) => s + vDe(c.marcas[ks]), 0);
      const temMarca35 = marcadas.length > 0 || alem35.length > 0;
      let vFut = futuras.map(() => vP);
      if (temMarca35 && futuras.length) {
        const resto = Math.max(0, r35(total - pagoExp35 - presumidas.length * vP - pagoAlem35));
        const v1 = r35(resto / futuras.length);
        vFut = futuras.map((x, j) => j === futuras.length - 1 ? r35(resto - v1 * (futuras.length - 1)) : v1);
      }
      marcadas.forEach(({ due, m }) => {
        const dm = typeof m === 'string' ? m : m.d;
        const data = isoOk35(dm) ? dm : (due || HOJE35);
        const conta = (m && typeof m === 'object' && m.conta) ? m.conta : c.conta;
        const v = vDe(m);
        fis.push({ data, conta, v: -v, corte: data }); curva.push({ data, v: -v }); pagasParc.push(v);
      });
      presumidas.forEach(({ due }) => {
        fis.push({ data: due, conta: c.conta, v: -vP, corte: due }); curva.push({ data: due, v: -vP }); pres++; presValor += vP; venc.push(vP); pagasParc.push(vP);
        if (nomesC.indexOf(c.conta) < 0) { presSemConta++; presSemContaValor += vP; }
      });
      futuras.forEach(({ due }, j) => {
        semPagar++; semPagarValor += vFut[j]; aPagarFut.push(vFut[j]);
        fluxos.push({ data: due || HOJE35, v: -vFut[j], conta: c.conta });
      });
      alem35.forEach(ks => {
        const m = c.marcas[ks], dm = typeof m === 'string' ? m : m && m.d;
        const conta = (m && typeof m === 'object' && m.conta) ? m.conta : c.conta;
        const v = vDe(m);
        fis.push({ data: dm, conta, v: -v, corte: dm }); curva.push({ data: dm, v: -v }); pagasParc.push(v);
      });
      /* I16 (invariante independente, 22/09): com alguma futura, o que ja saiu mais o que ainda vai sair fecha o total da compra.
         EXCECAO declarada: compra em que as marcas ja somam MAIS que o total (pagamento a mais, lancamento errado) — ai as futuras
         valem 0 (nunca negativas, decisao do desenho) e a soma fica no que foi pago, nao no total. Ou seja: soma = max(total, pago).
         Medido SO com os numeros deste modelo — nenhuma funcao do app entra nesta conta. */
      if (futuras.length) {
        const pagoTudo = r35(pagoExp35 + presumidas.length * vP + pagoAlem35);
        fechaTot.push({ id: c.id, tot: total, pago: pagoTudo, clamp: pagoTudo > total + 0.011,
          soma: r35(pagoTudo + vFut.reduce((s, x) => s + x, 0)) });
      }
    });
    D.vendas.forEach(v => {
      const liq = v.valor * (1 - v.taxa / 100);
      curva.push({ data: v.data, v: liq });
      if (v.canal === 'App' && v.recDias > 0) {
        const rep = addDias35(v.data, v.recDias);
        if (rep < HOJE35) fis.push({ data: rep, conta: v.conta, v: liq, corte: rep }); else fluxos.push({ data: rep, v: liq, conta: v.conta });
      } else fis.push({ data: v.data, conta: v.conta, v: liq, corte: v.data });
    });
    /* [2026-09-22] despesa "a pagar" nao sai de saldo fisico nenhum e nao entra na curva, VENCIDA OU NAO: vencer nao e pagar.
       Ela e so um fluxo futuro da projecao — e como a vencida tem data no passado, ela entra em +30, +60 e +90 igual.
       Antes deste dia o oraculo modelava a vencida como dinheiro que ja tinha saido (fis) e a tirava da projecao. */
    D.despesas.forEach(d => {
      if (d.status === 'pago') { const dc = d.dataPagamento || d.data; curva.push({ data: dc, v: -d.valor }); fis.push({ data: dc, conta: d.conta, v: -d.valor, corte: dc }); }
      else fluxos.push({ data: d.data, v: -d.valor, conta: d.conta });
    });
    const saldo = cb => r35(cb.saldoIni + fis.filter(e => e.conta === cb.nome && !(cb.saldoData && e.corte < cb.saldoData)).reduce((s, e) => s + e.v, 0));
    const atual = r35(D.contas.reduce((s, cb) => s + saldo(cb), 0));
    const ate = (L, n) => L.filter(f => f.data <= addDias35(HOJE35, n));
    const dentroL = fluxos.filter(f => dentro(f.conta)), foraL = fluxos.filter(f => !dentro(f.conta));
    const em = n => r35(atual + ate(dentroL, n).reduce((s, f) => s + f.v, 0));
    const f90 = ate(foraL, 90);
    return { saldos: D.contas.map(saldo), atual, d30: em(30), d60: em(60), d90: em(90), curva: r35(curva.reduce((s, e) => s + e.v, 0)),
      fora: { entra: r35(f90.filter(f => f.v > 0).reduce((s, f) => s + f.v, 0)), sai: r35(-f90.filter(f => f.v < 0).reduce((s, f) => s + f.v, 0)), n: f90.length },
      semPagar, semPagarValor: r35(semPagarValor), pres, presValor: r35(presValor), presSemConta, presSemContaValor: r35(presSemContaValor), nAPagar: aPagarFut.length, nVenc: venc.length,
      aPagarValor: r35(aPagarFut.reduce((s, v) => s + v, 0)), fechaTot,
      pagasValor: r35(pagasParc.reduce((s, v) => s + v, 0)), pagasN: pagasParc.length };
  };

  /* ---------- monta o app a partir da descricao, com divisoes e recargas ---------- */
  const monta35 = (D, rnd) => {
    const movs = [];
    D.compras.forEach(c => {
      c.itens.forEach((it, idx) => {
        const rec = { id: it.id, tipo: 'COMPRA', data: c.data, jogo: 'Pokémon', cat: it.booster ? 'Booster Box' : 'ETB', colecao: '151', qtd: it.qtd, valor: it.valor, situacao: 'Em estoque', destino: 'Vender',
          contraparte: 'L', conta: c.conta, pgTipo: c.parcelada ? 'Parcelado' : 'À vista', nParc: c.parcelada ? c.nP : 0, venc1: c.parcelada ? c.venc1 : '' };
        if (it.booster) rec.boosters = it.bpu;
        if (c.nota) { rec.notaId = 'N_' + c.id; rec.notaNum = '1'; }
        if (c.parcelada && idx === 0) rec.pgParcelas = JSON.parse(JSON.stringify(c.marcas));
        movs.push(rec);
      });
    });
    D.vendas.forEach(v => movs.push({ id: v.id, tipo: 'VENDA', data: v.data, valor: v.valor, taxa: v.taxa, canal: v.canal, recDias: v.recDias, conta: v.conta, contraparte: 'C', qtd: 1 }));
    D.despesas.forEach(d => movs.push({ id: d.id, tipo: 'DESPESA', data: d.data, valor: d.valor, status: d.status, natureza: 'ordinaria', cat: 'Frete', conta: d.conta, dataPagamento: d.dataPagamento || undefined }));
    return movs;
  };
  const divide35 = (rnd, log) => {
    const alvos = M().filter(m => m.tipo === 'COMPRA' && (+m.qtd || 1) > 1);
    if (!alvos.length) return;
    const a = alvos[Math.floor(rnd() * alvos.length)];
    const boo = a.cat === 'Booster Box' && a.boosters > 1;
    if (boo && rnd() < 0.5) { const tot = (+a.qtd) * a.boosters, n = 1 + Math.floor(rnd() * (tot - 1)); A('baixarBoosters')(a.id, n, rnd() < 0.5 ? 'Vendido' : 'Coleção', { dataSaida: '2026-09-02' }); log.push('boo(' + a.id + ',' + n + ')'); }
    else { const n = 1 + Math.floor(rnd() * ((+a.qtd) - 1)); A('baixarLote')(a.id, n, rnd() < 0.5 ? 'Vendido' : 'Coleção', { dataSaida: '2026-09-02' }); log.push('lote(' + a.id + ',' + n + ')'); }
  };

  const cmp35 = (rot, a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.011 : tol);
  const rodaSemente35 = async (semente, n) => {
    const falhas = [];
    let totalOps = 0, comDivisao = 0, comMarcaPaga = 0, comNota = 0, i16N = 0, i16Clamp = 0;
    for (let s = 0; s < n; s++) {
      const rnd = mulberry35(semente * 100003 + s), D = gera35(rnd), log = [];
      const hora = [[10, 0], [20, 59], [21, 1], [22, 30]][Math.floor(rnd() * 4)];
      reset();
      try {
        congela(2026, 9, 21, hora[0], hora[1]);
        setg('contasBanc', D.contas.map(c => Object.assign({}, c))); setg('perSel', 'tudo'); setg('perDe', ''); setg('perAte', '');
        setg('movs', monta35(D, rnd));
        if (D.compras.some(c => c.nota)) comNota++;
        /* sequencia aleatoria de operacoes que NAO mudam o dinheiro */
        const nOps = Math.floor(rnd() * 6);
        for (let k = 0; k < nOps; k++) {
          const q = rnd(); totalOps++;
          if (q < 0.4) { divide35(rnd, log); comDivisao++; }
          else if (q < 0.65) { setg('movs', JSON.parse(JSON.stringify(M()))); log.push('recarrega'); }
          else if (q < 0.85) {
            /* pagar uma parcela a vencer pela tela: o app marca o dono UMA vez; na descricao vira uma marca de hoje */
            const linhas = A('aPagar')().filter(x => x.pi);
            if (linhas.length) {
              const l = linhas[Math.floor(rnd() * linhas.length)], conta = ['X', 'Y', 'Z', ''][Math.floor(rnd() * 4)];
              const donoDesc = D.compras.find(c => c.itens.some(it => it.id === l.m.id || M().some(m => m.id === l.m.id && (m.id === it.id || raizId35(m) === it.id))));
              if (donoDesc && !donoDesc.marcas[l.pi]) {
                ctx.document.getElementById = idc => ({ value: idc === 'pp_conta' ? conta : '', remove() {}, style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {} });
                A('confirmarPagarParcela')(l.m.id, l.pi, l.pn, l.valor);
                donoDesc.marcas[l.pi] = { d: HOJE35, v: r35(l.valor), conta };
                log.push('paga(' + donoDesc.id + ',' + l.pi + ',' + conta + ')');
              }
            }
          } else {
            /* desmarcar uma parcela paga (a marca some de TODOS os pedacos) */
            const marcadas = []; D.compras.forEach(c => { if (c.parcelada) Object.keys(c.marcas).forEach(k => marcadas.push([c, k])); });
            if (marcadas.length) {
              const [c, k] = marcadas[Math.floor(rnd() * marcadas.length)];
              const dono = M().filter(m => m.tipo === 'COMPRA' && (c.itens.some(it => it.id === m.id || raizId35(m) === it.id))).find(m => m.pgParcelas && Object.prototype.hasOwnProperty.call(m.pgParcelas, k)) || M().find(m => c.itens.some(it => it.id === m.id));
              ctx.confirm = () => true;
              A('desmarcarParcela')(dono.id, +k);
              delete c.marcas[k]; log.push('desmarca(' + c.id + ',' + k + ')');
            }
          }
        }
        if (D.compras.some(c => c.parcelada && Object.keys(c.marcas).length)) comMarcaPaga++;
        const O = oraculo35(D);
        const ap = A('aPagar')().filter(x => x.pi), av = A('aPagar')(true), pg = A('contasPagas')().filter(x => x.pi), sd = A('serieDinheiro')(), pj = A('projecaoCaixa')();
        const cbs = g('contasBanc'), saldos = cbs.map(cb => r35(A('saldoFisicoConta')(Object.assign({}, cb))));
        const erros = [];
        saldos.forEach((v, i) => { if (!cmp35('saldo', v, O.saldos[i])) erros.push('saldo ' + cbs[i].nome + ': app ' + v + ' oraculo ' + O.saldos[i]); });
        if (!cmp35('atual', pj.atual, r35(saldos.reduce((s, v) => s + v, 0)))) erros.push('I4 projecao.atual ' + pj.atual + ' != soma dos saldos ' + r35(saldos.reduce((s, v) => s + v, 0)));
        /* os horizontes somam o saldo JA arredondado de cada conta a fluxos com fracao de centavo (parcela de 339,15 / 2 = 169,575) e arredondam de novo: um empate de meio centavo
           numa conta e outro no horizonte podem somar 1 centavo cada — tolerancia de 1 centavo por arredondamento (contas + o proprio horizonte) */
        const tolH = 0.011 * (D.contas.length + 1);
        [['d30', pj.d30, O.d30], ['d60', pj.d60, O.d60], ['d90', pj.d90, O.d90]].forEach(([k, a, b]) => { if (!cmp35(k, a, b, tolH)) erros.push('projecao ' + k + ': app ' + a + ' oraculo ' + b); });
        if (!cmp35('fora', pj.fora.entra, O.fora.entra) || !cmp35('fora', pj.fora.sai, O.fora.sai) || pj.fora.n !== O.fora.n) erros.push('fora: app ' + S35(pj.fora) + ' oraculo ' + S35(O.fora));
        const ultima = sd.length ? sd[sd.length - 1].total : 0;
        if (!cmp35('curva', ultima, O.curva)) erros.push('curva final: app ' + ultima + ' oraculo ' + O.curva);
        if (sd.semPagar !== O.semPagar || !cmp35('semPagarValor', sd.semPagarValor, O.semPagarValor)) erros.push('semPagar: app ' + sd.semPagar + '/' + sd.semPagarValor + ' oraculo ' + O.semPagar + '/' + O.semPagarValor);
        if (sd.presumidas !== O.pres || !cmp35('presValor', sd.presumidasValor, O.presValor) || sd.presSemConta !== O.presSemConta) erros.push('presumidas: app ' + sd.presumidas + '/' + sd.presumidasValor + '/' + sd.presSemConta + ' oraculo ' + O.pres + '/' + O.presValor + '/' + O.presSemConta);
        if (ap.length !== O.nAPagar) erros.push('aPagar(): app ' + ap.length + ' linhas, oraculo ' + O.nAPagar);
        /* [22/09] o VALOR de cada linha a vencer, nao so a contagem: e aqui que "a futura desconta o que ja foi pago" cola o app no oraculo */
        if (!cmp35('aPagarValor', r35(ap.reduce((s, x) => s + x.valor, 0)), O.aPagarValor, tolH)) erros.push('aPagar() valor: app ' + r35(ap.reduce((s, x) => s + x.valor, 0)) + ' oraculo ' + O.aPagarValor);
        /* I16: no MODELO (sem nenhuma funcao do app), pago + presumido + futuras + alem do plano fecha o total de cada compra com futura
           (ou, na compra paga a MAIS, fecha no que foi pago, com as futuras em zero) */
        O.fechaTot.forEach(x => { i16N++; if (x.clamp) i16Clamp++; if (Math.abs(Math.max(x.tot, x.pago) - x.soma) > 0.011) erros.push('I16 ' + x.id + ': pago+presumido+futuras+alem = ' + x.soma + ' != ' + Math.max(x.tot, x.pago) + ' (total ' + x.tot + ', pago ' + x.pago + ')'); });
        if (av.length !== O.nVenc || !cmp35('vencValor', av.reduce((s, x) => s + x.valor, 0), O.presValor)) erros.push('aPagar(true): app ' + av.length + '/' + r35(av.reduce((s, x) => s + x.valor, 0)) + ' oraculo ' + O.nVenc + '/' + O.presValor);
        if (pg.length !== O.pagasN || !cmp35('pagas', pg.reduce((s, x) => s + x.valor, 0), O.pagasValor)) erros.push('pagas: app ' + pg.length + '/' + r35(pg.reduce((s, x) => s + x.valor, 0)) + ' oraculo ' + O.pagasN + '/' + O.pagasValor);
        /* I5: toda parcela sem marca esta em UMA das duas listas (a vencer ou vencida), nunca nas duas */
        const chaves = new Set(); let dup = 0;
        ap.concat(av).forEach(x => { const k = (x.nota ? 'N' + x.nota.id : 'F' + (x.fam ? x.m.id : x.m.id)) + '#' + x.pi; if (chaves.has(k)) dup++; chaves.add(k); });
        if (dup) erros.push('I5: ' + dup + ' parcela(s) em aPagar() e aPagar(true) ao mesmo tempo ou repetidas');
        if (process.env.DEBUG35 === semente + ':' + s) { console.log('DEBUG35 descricao:', S35(D)); console.log('DEBUG35 oraculo:', S35(O)); console.log('DEBUG35 movs:', S35(M().filter(m => m.tipo === 'COMPRA').map(m => [m.id, m.loteOrigem, m.qtd, m.valor, m.nParc, m.venc1, m.conta, m.pgParcelas]))); console.log('DEBUG35 projecao:', S35(pj), 'saldos', S35(saldos)); }
        if (erros.length && falhas.length < 5) falhas.push({ semente, s, hora: hora.join('h'), log, erros: erros.slice(0, 4) });
        else if (erros.length) falhas.push(null);
      } catch (e) { falhas.push({ semente, s, log, excecao: String((e && e.stack) || e).slice(0, 400) }); }
      finally { descongela(); reset(); setg('contasBanc', []); }
    }
    return { falhas, totalOps, comDivisao, comMarcaPaga, comNota, i16N, i16Clamp };
  };
  function raizId35(m) { let x = m, n = 0; while (x && x.loteOrigem && n++ < 20) { const p = M().find(y => y.id === x.loteOrigem); if (!p) break; x = p; } return x.id; }

  const O35 = { confirm: ctx.confirm, geb: ctx.document.getElementById, render: g('render'), toast: g('toast'), diarioReg: g('diarioReg'), contas: g('contasBanc'), perSel: g('perSel'), perDe: g('perDe'), perAte: g('perAte') };
  setg('render', () => {}); setg('toast', () => {}); setg('diarioReg', () => {});
  try {
    for (const semente of [1, 2, 3, 4, 5]) {
      const R = await rodaSemente35(semente, 350);
      const ruins = R.falhas.filter(Boolean);
      t('35: semente ' + semente + ' — 350 cenarios (com ' + R.comDivisao + ' divisoes de lote, ' + R.comMarcaPaga + ' com parcela marcada, ' + R.comNota + ' com nota): o saldo fisico de cada conta, a curva, a projecao (com o escopo), as listas, o VALOR do a pagar e os avisos batem com o oraculo por eventos; projecao "hoje" = soma dos saldos; nenhuma parcela em duas listas; I16 fecha em ' + R.i16N + ' compras com parcela a vencer (' + R.i16Clamp + ' delas pagas a mais, onde fecha no pago)',
        R.falhas.length === 0, S35(ruins.slice(0, 3)) + ' | total de cenarios ruins: ' + R.falhas.length);
    }
  } finally {
    ctx.confirm = O35.confirm; ctx.document.getElementById = O35.geb; setg('render', O35.render); setg('toast', O35.toast); setg('diarioReg', O35.diarioReg);
    setg('contasBanc', O35.contas); setg('perSel', O35.perSel); setg('perDe', O35.perDe); setg('perAte', O35.perAte); descongela(); reset();
  }

  /* ---------- I15: apagar pedaco (venda + peca, ou o que nao vendeu) nunca muda o TOTAL pago da compra ---------- */
  const R15 = { confirm: ctx.confirm, geb: ctx.document.getElementById, render: g('render'), toast: g('toast'), diarioReg: g('diarioReg'), contas: g('contasBanc') };
  setg('render', () => {}); setg('toast', () => {}); setg('diarioReg', () => {});
  const ruins15 = []; let casos15 = 0, comRepasse15 = 0;
  try {
    for (let s = 0; s < 400; s++) {
      const rnd = mulberry35(777 + s * 31);
      reset(); setg('contasBanc', [{ nome: 'X', saldoIni: 1000, saldoData: '' }]); congela(2026, 9, 21, 10, 0);
      try {
        const nP = 2 + Math.floor(rnd() * 4), qtd = 3 + Math.floor(rnd() * 4), valor = 300 + Math.floor(rnd() * 900);
        const marcas = {}; for (let k = 1; k <= nP; k++) if (rnd() < 0.5) marcas[k] = { d: '2026-0' + (5 + Math.floor(rnd() * 4)) + '-10', v: r35(valor / nP), conta: 'X' };
        if (!Object.keys(marcas).length) marcas[1] = { d: '2026-06-10', v: r35(valor / nP), conta: 'X' };
        M().push({ id: 'r', tipo: 'COMPRA', data: '2026-05-01', jogo: 'Pokémon', cat: 'ETB', colecao: '151', qtd, valor, situacao: 'Em estoque', destino: 'Vender', contraparte: 'L', conta: 'X', pgTipo: 'Parcelado', nParc: nP, venc1: '2026-05-10', pgParcelas: marcas });
        const vendas = [];
        const nPed = 1 + Math.floor(rnd() * (qtd - 1));
        for (let i = 0; i < nPed; i++) {
          const peca = A('baixarLote')('r', 1, 'Vendido', { dataVenda: '2026-09-01', dataSaida: '2026-09-01' });
          const venda = { id: 'V' + i, tipo: 'VENDA', data: '2026-09-01', valor: 50, origemId: 'r', vendaDe: 'estoque', contraparte: 'Cli', qtd: 1, custoOrigem: peca.valor };
          M().push(venda); peca.vendaRef = venda.id; vendas.push(venda);
          if (rnd() < 0.3) setg('movs', JSON.parse(JSON.stringify(M())));
        }
        const somaGr = gr => Object.keys(gr.marcas).reduce((a, k) => a + (isFinite(A('vMarca')(gr.marcas[k])) ? A('vMarca')(gr.marcas[k]) : 0), 0);
        const somaMarcas = () => r35(A('gruposParcelados')().reduce((t0, gr) => t0 + somaGr(gr), 0));
        let total0 = somaMarcas();
        casos15++;
        const passos = 1 + Math.floor(rnd() * 3), log = [];
        for (let p = 0; p < passos; p++) {
          const vivas = M().filter(m => m.tipo === 'VENDA' && M().some(x => x.vendaRef === m.id));
          if (!vivas.length) break;
          const gruposAntes = A('gruposParcelados')(), idsAntes = new Set(M().map(m => m.id));
          const modo = rnd() < 0.7 ? 'vendaTudo' : 'compraSobra';
          if (modo === 'vendaTudo') { const v = vivas[Math.floor(rnd() * vivas.length)]; A('execExcl')(v.id, 'vendaTudo'); log.push('vendaTudo ' + v.id); }
          else { const alvo = M().find(m => m.tipo === 'COMPRA'); if (!alvo) break; A('execExcl')(alvo.id, 'compraSobra'); log.push('compraSobra ' + alvo.id); comRepasse15++; }
          const removidos = new Set([...idsAntes].filter(id => !M().some(m => m.id === id)));
          /* a compra que ficou SEM nenhum pedaco (o unico pedaco dela foi apagado) leva o pagamento junto; nas que ainda tem pedaco o total pago nao muda */
          const somem = gruposAntes.filter(gr => gr.membros.every(m => removidos.has(m.id))).reduce((a, gr) => a + somaGr(gr), 0);
          const esperado = r35(total0 - somem), total1 = somaMarcas();
          if (Math.abs(total1 - esperado) > 0.02) { ruins15.push({ s, log, antes: total0, esperado, depois: total1 }); break; }
          total0 = total1;
        }
      } catch (e) { ruins15.push({ s, excecao: String((e && e.stack) || e).slice(0, 300) }); }
      finally { descongela(); reset(); }
    }
  } finally { ctx.confirm = R15.confirm; ctx.document.getElementById = R15.geb; setg('render', R15.render); setg('toast', R15.toast); setg('diarioReg', R15.diarioReg); setg('contasBanc', R15.contas); }
  t('35: I15 — em ' + casos15 + ' compras divididas em pedacos vendidos (' + comRepasse15 + ' apagando so o que nao vendeu, o que reparte o pagamento entre as compras que sobram), apagar pedaco nunca muda o total PAGO da compra (a soma das marcas), ao centavo', ruins15.length === 0, S35(ruins15.slice(0, 3)) + ' | ruins: ' + ruins15.length);
}).catch(e=>{fail++;console.log('  FALHOU  secao 35 explodiu -> '+((e&&e.stack)||e));}).then(()=>{
  console.log('\n----------------------------------------');
  console.log('  ' + ok + ' passaram, ' + fail + ' falharam');
  process.exit(fail ? 1 : 0);
});
