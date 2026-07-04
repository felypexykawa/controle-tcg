# Robo de precos — busca na Liga Pokemon o preco de cada codigo de carta
# e grava precos.json na raiz do repositorio (o app le esse arquivo).
# Roda dentro do GitHub Actions com navegador automatizado (playwright),
# porque a Liga bloqueia consulta de robo simples (403 no curl — testado 2026-07-04).
# 1a execucao = tambem diagnostico: salva HTML e screenshot de cada busca
# em robo/diag/ para refinarmos os seletores com a pagina real.

import json, os, re, sys, time, urllib.parse
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ_CODIGOS = os.path.join(RAIZ, 'robo', 'codigos.txt')
ARQ_SAIDA = os.path.join(RAIZ, 'precos.json')
DIAG = os.path.join(RAIZ, 'robo', 'diag')
os.makedirs(DIAG, exist_ok=True)

def codigos():
    out = []
    with open(ARQ_CODIGOS, encoding='utf-8') as f:
        for ln in f:
            ln = ln.strip()
            if ln and not ln.startswith('#'):
                out.append(ln)
    return out

def parse_precos(texto):
    # Pega valores "R$ 12,34" plausiveis (>= R$0,50) em ordem crescente
    achados = re.findall(r'R\$\s*([\d.]{1,7},\d{2})', texto)
    vals = []
    for a in achados:
        try:
            v = float(a.replace('.', '').replace(',', '.'))
            if v >= 0.5:
                vals.append(v)
        except ValueError:
            pass
    return sorted(vals)

def main():
    lista = codigos()
    if not lista:
        print('sem codigos'); return
    resultado = {'atualizadoEm': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'cartas': {}}
    with sync_playwright() as p:
        nav = p.chromium.launch()
        pg = nav.new_page(user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36')
        for cod in lista:
            slug = cod.replace('/', '_')
            url = 'https://www.ligapokemon.com.br/?view=cards/search&card=' + urllib.parse.quote('+' + cod)
            info = {'codigo': cod, 'url': url}
            try:
                pg.goto(url, timeout=45000, wait_until='domcontentloaded')
                pg.wait_for_timeout(6000)  # da tempo pro conteudo dinamico
                texto = pg.inner_text('body')
                # diagnostico da 1a fase (vira artifact no Actions)
                with open(os.path.join(DIAG, slug + '.html'), 'w', encoding='utf-8') as f:
                    f.write(pg.content())
                pg.screenshot(path=os.path.join(DIAG, slug + '.png'), full_page=False)
                bloqueado = ('Access Denied' in texto or 'access denied' in texto.lower()
                             or 'cloudflare' in texto.lower() or len(texto) < 200)
                if bloqueado:
                    info['status'] = 'BLOQUEADO'
                    info['tamanho_texto'] = len(texto)
                else:
                    vals = parse_precos(texto)
                    titulo = (pg.title() or '').strip()
                    info['status'] = 'OK' if vals else 'SEM_PRECO'
                    info['titulo'] = titulo[:120]
                    info['menor'] = vals[0] if vals else None
                    info['listagens'] = vals[:3]
                    info['tamanho_texto'] = len(texto)
                print(cod, '->', info['status'], info.get('menor'))
            except Exception as e:
                info['status'] = 'ERRO'
                info['erro'] = str(e)[:200]
                print(cod, '-> ERRO', e)
            resultado['cartas'][cod] = info
            time.sleep(4)  # respeito ao site: espaco entre buscas
        nav.close()
    with open(ARQ_SAIDA, 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=1)
    print('gravado', ARQ_SAIDA)

if __name__ == '__main__':
    main()
