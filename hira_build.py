"""Build the existing portal with a refreshed fee page; publish only public assets."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def build():
    data = json.loads((ROOT / 'hira-prices.json').read_text(encoding='utf-8'))
    expected = set(json.loads((ROOT / 'hira-codes.json').read_text(encoding='utf-8')))
    assert {r['code'] for r in data['fees']} == expected
    assert len(data['fees']) == len(expected)
    assert data['source'] == 'HIRA' and data['institution'] == '의원'
    assert all(type(r['price']) is int and r['price'] > 0 for r in data['fees'])
    seed = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    site = ROOT / 'site'
    site.mkdir(parents=True, exist_ok=True)
    for source in ROOT.glob('*.html'):
        if source.name == 'ysarang-combination.html':
            html = source.read_text(encoding='utf-8')
            marker = '<script id="shared-fee-seed" type="application/json"></script>'
            assert html.count(marker) == 1
            html = html.replace(marker, '<script id="shared-fee-seed" type="application/json">' + seed + '</script>')
            (site / source.name).write_text(html, encoding='utf-8')
        else:
            shutil.copyfile(source, site / source.name)
    for name in ['xlsx.full.min.js', '진설로고.png']:
        shutil.copyfile(ROOT / name, site / name)
    shutil.copyfile(ROOT / 'hira-prices.json', site / 'hira-prices.json')
    (site / '.nojekyll').write_text('', encoding='utf-8')
    print('Existing portal and public fee table built. No secrets in output.')


if __name__ == '__main__':
    build()
