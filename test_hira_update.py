import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('updater', Path(__file__).resolve().parent / 'hira_update.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


def item(**changes):
    result = dict(mdfeeCd='LA241', korNm='기본/', adtStaDd='20260101', unprc1='31010', payTpCd='급여')
    result.update(changes)
    return result


class FeeTests(unittest.TestCase):
    def test_base_code_not_surcharge(self):
        result = updater.choose_fee([item(mdfeeCd='LA241010', unprc1='46520'), item()], 'LA241', '20260917')
        self.assertEqual(result['price'], 31010)

    def test_bad_or_future_records_are_not_applied(self):
        for records in [[item(adtStaDd='20270101')], [item(adtStaDd='20260230')],
                        [item(unprc1='')], [item(unprc1='0')], [item(payTpCd='비급여')],
                        [item(), item(unprc1='32000')], [item(mdfeeCd='LA241010')]]:
            with self.subTest(records=records), self.assertRaises(updater.FeeError):
                updater.choose_fee(records, 'LA241', '20260917')

    def test_missing_clinic_does_not_use_hospital_price(self):
        row = item(unprc1='')
        row['unprc2'] = '27180'
        with self.assertRaises(updater.FeeError):
            updater.choose_fee([row], 'LA241', '20260917')

    def test_failure_preserves_entire_last_good_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'fees.json'
            path.write_text('previous good data', encoding='utf-8')
            def fetch(code, key, date):
                if code == 'KK062':
                    raise updater.FeeError('Failed')
                return {'code': code}
            with self.assertRaises(updater.FeeError):
                updater.refresh(['LA241', 'KK062'], 'TEST-KEY', path, fetcher=fetch)
            self.assertEqual(path.read_text(encoding='utf-8'), 'previous good data')

    def test_secret_not_in_network_exception(self):
        def fail(*args, **kwargs):
            raise OSError('url contains TEST-KEY')
        with self.assertRaises(updater.FeeError) as caught:
            updater.fetch_fee('LA241', 'TEST-KEY', '20260917', request=fail)
        self.assertNotIn('TEST-KEY', str(caught.exception))

    def test_xml_fields_and_error_handling(self):
        xml = b'<response><header><resultCode>00</resultCode></header><body><items><item><mdfeeCd>LA241</mdfeeCd><unprc1>31010</unprc1><unprc2>27180</unprc2></item></items><totalCount>1</totalCount></body></response>'
        rows, count = updater.parse_response(xml)
        self.assertEqual(count, 1)
        self.assertEqual(rows[0]['unprc1'], '31010')
        self.assertNotIn('unprc2', rows[0])
        with self.assertRaises(updater.FeeError):
            updater.parse_response(b'<response><header><resultCode>30</resultCode></header></response>')


if __name__ == '__main__':
    unittest.main()
