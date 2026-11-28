import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import catalog
import review
from test_review import fixture, seal, encode


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.vault, self.registry = self.root/'vault', self.root/'registry'

    def tearDown(self):
        self.temp.cleanup()

    def revision(self, title, stage_id='studio-fixture', decision='approved'):
        value = fixture()
        value['draft'].update(title=title, id=stage_id)
        seal(value)
        source = self.root/'input.json'
        source.write_bytes(encode(value))
        version = review.submit(self.vault, source)
        if decision:
            review.decide(self.vault, version, decision, 'Synthetic catalog QA', 'Generated fixtures only')
        return version

    def release(self, title):
        return catalog.build(self.vault, self.registry, [self.revision(title)])

    def select(self, release, expected='none'):
        return catalog.activate(self.vault, self.registry, release, expected, 'Synthetic catalog QA', 'Synthetic staging selection')

    def test_only_approved_unique_ordered_revisions_build(self):
        pending = self.revision('Pending', decision=None)
        with self.assertRaises(FileNotFoundError): catalog.build(self.vault, self.registry, [pending])
        rejected = self.revision('Rejected', decision='rejected')
        with self.assertRaises(ValueError): catalog.build(self.vault, self.registry, [rejected])
        a, b = self.revision('A'), self.revision('B')
        for selection in [[], [a, a], [a, b]]:
            with self.assertRaises(ValueError): catalog.build(self.vault, self.registry, selection)
        c = self.revision('C', 'second-picture')
        first = catalog.build(self.vault, self.registry, [a, c])
        self.assertEqual(catalog.build(self.vault, self.registry, [a, c]), first)
        self.assertNotEqual(catalog.build(self.vault, self.registry, [c, a]), first)
        self.assertIsNone(catalog.current(self.registry))

    def test_activate_export_and_rollback_restore_exact_version(self):
        a, b = self.release('First revision'), self.release('Second revision')
        first = self.select(a)
        second = self.select(b, first['eventId'])
        rolled = catalog.rollback(self.vault, self.registry, second['eventId'], 'Synthetic QA', 'Return to tested version')
        self.assertEqual(rolled['releaseId'], a)
        self.assertEqual(rolled['event']['action'], 'rollback')
        self.assertNotEqual(rolled['eventId'], first['eventId'])
        out = catalog.export(self.vault, self.registry, self.root/'private-build')
        source = (out/'stages.ts').read_text(encoding='utf-8')
        self.assertIn('First revision', source)
        self.assertNotIn('Second revision', source)
        self.assertEqual(len(list((out/'qa').glob('*.png'))), 2)
        receipt = json.loads((out/'catalog-state.json').read_text(encoding='utf-8'))
        self.assertEqual(receipt['eventId'], rolled['eventId'])
        with self.assertRaises(ValueError): catalog.export(self.vault, self.registry, out)

    def test_stale_selection_tokens_and_concurrent_operators_cannot_overwrite(self):
        a, b, c = [self.release(name) for name in ('A', 'B', 'C')]
        first = self.select(a)
        with self.assertRaises(ValueError): self.select(b, 'none')
        def attempt(release):
            try:
                return self.select(release, first['eventId'])['releaseId']
            except ValueError:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            winners = [x for x in pool.map(attempt, [b, c]) if x]
        self.assertEqual(len(winners), 1)
        self.assertEqual(catalog.current(self.registry)['releaseId'], winners[0])
        current = catalog.current(self.registry)
        catalog.rollback(self.vault, self.registry, current['eventId'], 'Synthetic QA', 'Rollback')
        with self.assertRaises(ValueError): self.select(b, first['eventId'])

    def test_tampered_images_geometry_and_manifests_leave_current_unchanged(self):
        a, b = self.release('A'), self.release('B')
        active = self.select(a)
        folder = catalog.release_path(self.registry, b)
        manifest = json.loads((folder/'catalog.json').read_text(encoding='utf-8'))
        version = manifest['stages'][0]['digest']
        paths = [folder/'catalog.json', folder/version/'stage.json', next((folder/version).glob('*.png')), self.vault/version/'decision.json', self.vault/version/'request.json']
        for path in paths:
            original = path.read_bytes()
            path.write_bytes(b'{}')
            try:
                with self.subTest(path=path.name), self.assertRaises(ValueError): self.select(b, active['eventId'])
                self.assertEqual(catalog.current(self.registry)['eventId'], active['eventId'])
            finally:
                path.write_bytes(original)

    def test_rollback_revalidates_old_approval_and_requires_previous(self):
        a, b = self.release('A'), self.release('B')
        first = self.select(a)
        with self.assertRaises(ValueError): catalog.rollback(self.vault, self.registry, first['eventId'], 'QA', 'No previous')
        second = self.select(b, first['eventId'])
        entry = json.loads((catalog.release_path(self.registry, a)/'catalog.json').read_text(encoding='utf-8'))['stages'][0]
        decision = self.vault/entry['digest']/'decision.json'
        record = json.loads(decision.read_text(encoding='utf-8'))
        record['decision'] = 'rejected'
        review.write_json(decision, record)
        with self.assertRaises(ValueError): catalog.rollback(self.vault, self.registry, second['eventId'], 'QA', 'Bad prior version')
        self.assertEqual(catalog.current(self.registry)['eventId'], second['eventId'])

    def test_atomic_pointer_failure_and_missing_receipts_fail_closed(self):
        a, b = self.release('A'), self.release('B')
        first = self.select(a)
        with patch('catalog.os.replace', side_effect=OSError('Synthetic write interruption')):
            with self.assertRaises(OSError): self.select(b, first['eventId'])
        self.assertEqual(catalog.current(self.registry)['eventId'], first['eventId'])
        self.select(b, first['eventId'])
        pointer = self.registry/'active.json'
        value = json.loads(pointer.read_text())
        value['eventId'] = '0'*32
        review.write_json(pointer, value)
        with self.assertRaises(ValueError): catalog.active_snapshot(self.vault, self.registry)

    def test_busy_lock_and_public_or_production_destinations_are_rejected(self):
        a = self.revision('A')
        with self.assertRaises(ValueError): catalog.build(self.vault, self.registry, [a], target='production')
        self.registry.mkdir(exist_ok=True)
        (self.registry/'.catalog-lock').mkdir()
        with self.assertRaises(ValueError): catalog.build(self.vault, self.registry, [a])
        (self.registry/'.catalog-lock').rmdir()
        with self.assertRaises(ValueError): catalog.build(self.vault, Path(review.__file__).resolve().parents[2]/'catalog', [a])
        with self.assertRaises(ValueError): catalog.release_path(self.registry, '../escape')


if __name__ == '__main__': unittest.main()
