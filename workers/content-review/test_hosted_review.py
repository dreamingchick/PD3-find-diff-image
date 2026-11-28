import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import catalog
import hosted_review
import review
from test_review import fixture, encode

PROJECT = 'https://abcdefghijklmnopqrst.supabase.co'
WHEN = '2026-11-28T00:00:00Z'
ACTOR = '22222222-2222-4222-8222-222222222222'


def envelope():
    package = fixture()
    digest = package['reviewRequest']['contentDigest']
    images = [{'name': im['name'], 'sha256': im['sha256'], 'mime': 'image/png', 'path': f'{digest}/{side}.png'} for side, im in enumerate(package['images'])]
    return {'format': 'pd3-hosted-review-export', 'version': 1, 'visibility': 'private', 'source': {'url': PROJECT, 'authority': 'hosted-review-snapshot'}, 'contentDigest': digest, 'exportedAt': WHEN, 'serverReview': {'digest': digest, 'canonical': review.canonical(package['draft'], package['images']).decode(), 'images': images, 'reviewRequest': package['reviewRequest'], 'createdBy': '11111111-1111-4111-8111-111111111111', 'submittedAt': WHEN, 'validation': {'passed': True, 'validatorVersion': 'pd3-pixels-v1', 'message': 'Synthetic check', 'checkedAt': WHEN}, 'decision': {'decision': 'approved', 'actorId': ACTOR, 'note': 'Synthetic hosted decision', 'decidedAt': WHEN}}, 'independentCheck': {'passed': True}, 'package': package}


class HostedReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.vault, self.registry, self.snapshot = self.root/'vault', self.root/'registry', self.root/'snapshot.json'
        self.value = envelope()
        self.digest = self.value['contentDigest']
        self.write(self.value)

    def tearDown(self):
        self.temp.cleanup()

    def write(self, value):
        self.snapshot.write_bytes(encode(value))

    def receive(self):
        return hosted_review.import_snapshot(self.vault, self.snapshot, PROJECT, self.digest)

    def test_pending_import_then_explicit_local_decision_retains_hosted_actor_through_catalog(self):
        self.assertEqual(self.receive(), self.digest)
        self.assertFalse((self.vault/self.digest/'decision.json').exists())
        with self.assertRaises(FileNotFoundError): catalog.build(self.vault, self.registry, [self.digest])
        decided = review.decide(self.vault, self.digest, 'approved', 'Local synthetic operator', 'Checked private hosted import')
        self.assertEqual(decided['reviewer'], 'Local synthetic operator')
        self.assertEqual(decided['hostedSource']['serverReview']['decision']['actorId'], ACTOR)
        self.assertEqual(decided['hostedSource']['snapshotSha256'], hashlib.sha256(self.snapshot.read_bytes()).hexdigest())
        release = catalog.build(self.vault, self.registry, [self.digest])
        self.assertIsNone(catalog.current(self.registry))
        catalog.activate(self.vault, self.registry, release, 'none', 'Synthetic operator', 'Fixture only')
        catalog.export(self.vault, self.registry, self.root/'build')
        provenance = json.loads((self.registry/'releases'/release/self.digest/'provenance.json').read_text(encoding='utf-8'))
        self.assertEqual(provenance['decision'], decided)

    def test_bad_project_identity_approval_content_and_duplicate_json_leave_no_revision(self):
        for case in ['project', 'digest', 'actor', 'pending', 'failed', 'canonical', 'image-path', 'bytes', 'visibility', 'time']:
            value = copy.deepcopy(self.value)
            if case == 'project': value['source']['url'] = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'
            if case == 'digest': value['contentDigest'] = 'a'*64
            if case == 'actor': value['serverReview']['decision']['actorId'] = 'fake'
            if case == 'pending': value['serverReview']['decision']['decision'] = 'pending'
            if case == 'failed': value['serverReview']['validation']['passed'] = False
            if case == 'canonical': value['serverReview']['canonical'] += ' '
            if case == 'image-path': value['serverReview']['images'][0]['path'] = '../elsewhere.png'
            if case == 'bytes': value['package']['images'][0]['data'] = 'data:image/png;base64,YmFk'
            if case == 'visibility': value['visibility'] = 'public'
            if case == 'time': value['serverReview']['decision']['decidedAt'] = 'not-time'
            self.write(value)
            with self.subTest(case=case), self.assertRaises(ValueError): self.receive()
            self.assertFalse(self.vault.exists())
        with self.assertRaises(ValueError): hosted_review.validate_snapshot(b'{"format":1,"format":2}', PROJECT, self.digest)

    def test_import_is_idempotent_without_resetting_decision_or_replacing_origin(self):
        self.receive()
        decision = review.decide(self.vault, self.digest, 'rejected', 'Local operator', 'Synthetic rejection')
        self.receive()
        self.assertEqual(json.loads((self.vault/self.digest/'decision.json').read_text(encoding='utf-8')), decision)
        value = copy.deepcopy(self.value)
        value['exportedAt'] = '2026-11-29T00:00:00Z'
        self.write(value)
        with self.assertRaises(ValueError): self.receive()
        self.assertEqual(json.loads((self.vault/self.digest/'hosted-origin.json').read_text(encoding='utf-8')), self.value)

    def test_changed_or_missing_origin_blocks_existing_catalog_export(self):
        self.receive()
        review.decide(self.vault, self.digest, 'approved', 'Synthetic operator', 'Synthetic receipt review')
        release = catalog.build(self.vault, self.registry, [self.digest])
        path = self.vault/self.digest/'hosted-origin.json'
        original = path.read_bytes()
        value = copy.deepcopy(self.value)
        value['serverReview']['decision']['note'] = 'Changed audit note'
        path.write_bytes(encode(value))
        with self.assertRaises(ValueError): catalog.verify_release(self.vault, self.registry, release)
        path.unlink()
        with self.assertRaises(ValueError): review.approved_revision(self.vault, self.digest)
        path.write_bytes(original)
        self.assertEqual(catalog.verify_release(self.vault, self.registry, release)[0][0]['version'], self.digest)

    def test_existing_local_revision_and_public_destination_cannot_be_silently_adopted(self):
        package = self.root/'package.json'
        package.write_bytes(encode(self.value['package']))
        review.submit(self.vault, package)
        with self.assertRaises(OSError): self.receive()
        self.assertFalse((self.vault/self.digest/'hosted-origin.json').exists())
        with self.assertRaises(ValueError): hosted_review.import_snapshot(Path(review.__file__).resolve().parents[2]/'forbidden-vault', self.snapshot, PROJECT, self.digest)

    def test_concurrent_imports_commit_one_complete_identical_pending_revision(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(lambda _: self.receive(), range(2))), [self.digest]*2)
        self.assertEqual(len(list(self.vault.iterdir())), 1)
        self.assertFalse((self.vault/self.digest/'decision.json').exists())
        hosted_review.stored_evidence(self.vault/self.digest, self.digest)

    def test_actual_node_export_import_preserves_cross_language_evidence(self):
        source = Path(review.__file__).resolve().parents[2]
        script = """import fs from 'node:fs/promises';import {exportApprovedReview} from './scripts/export-approved-review.mjs';const v=JSON.parse(await fs.readFile(process.argv[1],'utf8')),s=v.serverReview,p=v.package;const row={digest:v.contentDigest,draft:p.draft,canonical:s.canonical,review_request:p.reviewRequest,images:s.images,created_by:s.createdBy,created_at:s.submittedAt,upload_complete:true,pd3_review_validations:{passed:true,message:s.validation.message,validator_version:s.validation.validatorVersion,created_at:s.validation.checkedAt},pd3_review_decisions:{decision:'approved',note:s.decision.note,actor_id:s.decision.actorId,created_at:s.decision.decidedAt}};const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:row,error:null})})})}),storage:{from:()=>({download:async path=>({data:new Blob([Buffer.from(p.images[row.images.findIndex(i=>i.path===path)].data.split(',')[1],'base64')]),error:null})})}};await exportApprovedReview(client,row.digest,process.argv[2],v.source.url);"""
        output = self.root/'node-export.json'
        env = dict(os.environ, PD3_PYTHON=sys.executable)
        env.pop('PD3_SUPABASE_SECRET_KEY', None)
        subprocess.run(['node', '--input-type=module', '-e', script, str(self.snapshot), str(output)], cwd=source, env=env, check=True, capture_output=True, timeout=60)
        self.snapshot = output
        self.receive()
        self.assertEqual(hosted_review.stored_evidence(self.vault/self.digest, self.digest)['serverReview']['decision']['actorId'], ACTOR)


if __name__ == '__main__':
    unittest.main()
