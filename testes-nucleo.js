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
  firebase:{ initializeApp(){}, auth(){return {onAuthStateChanged(){}, signOut(){return Promise.resolve();}};},
             firestore(){return {collection(){return {doc(){return {set(){return Promise.resolve();},
               get(){return Promise.resolve({exists:false,data:()=>({})});}, collection(){return this;},
               onSnapshot(){}, orderBy(){return this;}, limit(){return this;}};}};}, runTransaction(){return Promise.resolve();}};} },
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){return true;},
  open:()=>null, scrollTo(){}, scrollY:0, innerWidth:1200, innerHeight:800,
  URL:{createObjectURL:()=>'blob:x', revokeObjectURL(){}},
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

console.log('\n----------------------------------------');
console.log('  ' + ok + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
