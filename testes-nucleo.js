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
t('A2: 6 caixas compradas = "compra de 6 Booster Box" (nao 41 un), boosters abertos a parte', /compra de 6 Booster Box/.test(hC) && /\+36 Booster \(aberto\)/.test(hC) && !/compra de 41/.test(hC), hC.slice(hC.indexOf('compra de')-10, hC.indexOf('compra de')+60));
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
  setg('_fotosPend',[]); setg('_fotosEmVoo',[]); setg('_fotosFalhadas',[]);
  /* P0-4: alternar 1 item <-> varios na VENDA troca a identidade do balde (a foto da carta em digitacao vai embora, com aviso) */
  setg('tela','lancar'); setg('tipoSel','VENDA'); setg('compraModo','item'); setg('editId',null); setg('vendaModo','item'); setg('_fotosItem',[]);
  A('render')(); setg('_fotosItem',['UMA']); setg('vendaModo','varios'); A('render')();
  t('P0-4: alternar 1 item <-> varios na venda descarta o balde da carta (identidade mudou)', g('_fotosItem').length===0, 'balde='+g('_fotosItem').length);
  setg('vendaModo','item'); setg('tela','painel');
  setg('gravaLocal',_gravaOrig);
  setg('_db',null); setg('_syncReady',false); setg('excluidos',{}); setg('_baseH',{}); reset();
})().catch(e=>{fail++;console.log('  FALHOU  secao 18/19/21 explodiu -> '+((e&&e.stack)||e));}).then(()=>{
  console.log('\n----------------------------------------');
  console.log('  ' + ok + ' passaram, ' + fail + ' falharam');
  process.exit(fail ? 1 : 0);
});
