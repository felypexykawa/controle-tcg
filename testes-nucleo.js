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

console.log('\n=== 15. cada carta leva a SUA foto (nao todas pro primeiro item) ===');
reset();
M().push({id:'a1', tipo:'COMPRA', data:'2026-08-01', valor:10, qtd:1});
M().push({id:'a2', tipo:'COMPRA', data:'2026-08-01', valor:20, qtd:1});
setg('_fotosPend', []);
A('aplicarFotosDoItem')(['P1','P2'], 'a1');
A('aplicarFotosDoItem')(['P3'], 'a2');
t('a carta 1 ficou com 2 fotos', (M().find(m=>m.id==='a1').nFotos|0) === 2);
t('a carta 2 ficou com 1 foto', (M().find(m=>m.id==='a2').nFotos|0) === 1);
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

console.log('\n----------------------------------------');
console.log('  ' + ok + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
