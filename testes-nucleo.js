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
  setg('idbOpen',_idbOrig24); setg('fotoAdd',_faOrig24); setg('_fotosFalhadas',[]); setg('_fotosPend',[]);
  setg('gravaLocal',_gravaOrig);
  setg('_db',null); setg('_syncReady',false); setg('excluidos',{}); setg('_baseH',{}); reset();
})().catch(e=>{fail++;console.log('  FALHOU  secao 18/19/21 explodiu -> '+((e&&e.stack)||e));}).then(()=>{
  console.log('\n----------------------------------------');
  console.log('  ' + ok + ' passaram, ' + fail + ' falharam');
  process.exit(fail ? 1 : 0);
});
