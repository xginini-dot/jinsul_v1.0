"""Fetch public clinic fees; credentials never enter output files or error logs."""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENDPOINT = 'https://apis.data.go.kr/B551182/mdfeeCrtrInfoService/getDiagnossMdfeeList'


class FeeError(Exception):
    pass


def parse_response(body):
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        raise FeeError('Invalid XML response') from None
    if root.findtext('./header/resultCode') != '00':
        raise FeeError('HIRA authentication, quota, or service error')
    try:
        total = int(root.findtext('./body/totalCount', ''))
        if total < 0:
            raise ValueError()
    except ValueError:
        raise FeeError('Invalid result count') from None
    items = [{field: (node.findtext(field) or '').strip() for field in
              ['mdfeeCd', 'korNm', 'adtStaDd', 'unprc1', 'payTpCd']}
             for node in root.findall('./body/items/item')]
    return items, total


def choose_fee(items, code, as_of):
    exact = [x for x in items if x['mdfeeCd'] == code]
    eligible = []
    for item in exact:
        try:
            effective = datetime.strptime(item['adtStaDd'], '%Y%m%d').strftime('%Y%m%d')
        except ValueError:
            continue
        if effective == item['adtStaDd'] and effective <= as_of:
            eligible.append(item)
    if not eligible:
        raise FeeError('No exact base-code fee applicable to the current date')
    latest = max(x['adtStaDd'] for x in eligible)
    records = [x for x in eligible if x['adtStaDd'] == latest]
    if len({(x['unprc1'], x['korNm'], x['payTpCd']) for x in records}) != 1:
        raise FeeError('Ambiguous base-code records')
    item = records[0]
    raw = item['unprc1'].replace(',', '')
    if not re.fullmatch(r'\d+', raw) or not 0 < int(raw) < 10**10 or '비급여' in item['payTpCd']:
        raise FeeError('No usable covered clinic price')
    return {'code': code, 'name': item['korNm'].rstrip('/'),
            'price': int(raw), 'effective': latest, 'pay': item['payTpCd']}


def fetch_fee(code, key, as_of, request=None):
    request = request or urllib.request.urlopen
    all_items = []
    for page in range(1, 21):
        query = urllib.parse.urlencode({'ServiceKey': key, 'mdfeeCd': code,
                                       'numOfRows': 100, 'pageNo': page})
        try:
            with request(ENDPOINT + '?' + query, timeout=25) as response:
                body = response.read()
        except Exception:
            # Exceptions may contain the credential-bearing URL. Never print them.
            raise FeeError('HIRA network request failed') from None
        items, total = parse_response(body)
        all_items.extend(items)
        if page * 100 >= total:
            return choose_fee(all_items, code, as_of)
        if not items:
            raise FeeError('Incomplete paginated response')
    raise FeeError('Pagination limit exceeded')


def refresh(codes, key, destination, fetcher=fetch_fee):
    now = datetime.now(timezone(timedelta(hours=9)))
    fees = []
    for code in codes:
        fees.append(fetcher(code, key, now.strftime('%Y%m%d')))
        print(f'{code}: OK')
    # All codes must succeed. A failure above leaves the previous complete file untouched.
    data = {'schemaVersion': 1, 'source': 'HIRA', 'institution': '의원',
            'sourceUrl': 'https://www.data.go.kr/data/15021028/openapi.do',
            'updatedAt': now.isoformat(timespec='seconds'), 'fees': fees}
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(destination)
    return data


def main():
    key = urllib.parse.unquote(os.environ.get('HIRA_API_KEY', '').strip())
    if not key:
        print('HIRA_API_KEY secret is missing. Previous fee table is unchanged.', file=sys.stderr)
        return 1
    codes = json.loads((ROOT / 'hira-codes.json').read_text(encoding='utf-8'))
    try:
        refresh(codes, key, ROOT / 'hira-prices.json')
    except FeeError as error:
        print(f'Update aborted: {error}. Previous fee table is unchanged.', file=sys.stderr)
        return 1
    except Exception:
        print('Update aborted due to a local processing error. No credential details logged.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
