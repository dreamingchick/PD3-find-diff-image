import base64
import copy
import hashlib
import io
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw
import review


def fixture():
    regions = [{'id': i+1, 'box': [20+i*40, 80, 36+i*40, 96], 'difficulty': 'easy', 'changeType': kind} for i, kind in enumerate(['add', 'remove', 'color', 'size', 'move'])]
    draft = {'id': 'studio-fixture', 'title': '제작 테스트', 'chapter': '검수', 'notes': '', 'difficulty': 'easy', 'limit': 120, 'resolution': 256, 'regions': regions}
    original = Image.new('RGB', (256, 256), (230, 230, 230))
    modified = original.copy()
    draw = ImageDraw.Draw(modified)
    for r in regions:
        x0, y0, x1, y1 = r['box']
        draw.rectangle((x0, y0, x1-1, y1-1), fill=(220, 40, 80))
    images = []
    for name, image in zip(['원본.png', '변형.png'], [original, modified]):
        stream = io.BytesIO()
        image.save(stream, format='PNG')
        raw = stream.getvalue()
        images.append({'name': name, 'data': 'data:image/png;base64,'+base64.b64encode(raw).decode(), 'sha256': hashlib.sha256(raw).hexdigest()})
    package = {'format': 'pd3-studio-draft', 'version': 1, 'visibility': 'private', 'draft': draft, 'images': images, 'qa': {'passed': True}}
    seal(package)
    return package


def seal(package):
    package['reviewRequest'] = {'version': 1, 'contentDigest': hashlib.sha256(review.canonical(package['draft'], package['images'])).hexdigest(), 'testPlayCleared': True, 'semanticReviewConfirmed': True, 'requestedAt': '2026-11-28T00:00:00Z'}


def encode(package):
    return json.dumps(package, ensure_ascii=False).encode()


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.vault = self.root/'private-vault'
        self.package = fixture()
        self.input = self.root/'request.json'
        self.input.write_bytes(encode(self.package))

    def tearDown(self):
        self.temp.cleanup()

    def test_pending_cannot_stage_and_approval_binds_exact_revision(self):
        digest = review.submit(self.vault, self.input)
        with self.assertRaises(FileNotFoundError):
            review.stage(self.vault, digest, self.root/'output')
        decision = review.decide(self.vault, digest, 'approved', 'Synthetic QA reviewer', 'Synthetic image review only')
        out = review.stage(self.vault, digest, self.root/'output')
        stage = json.loads((out/'stage.json').read_text(encoding='utf-8'))
        self.assertEqual(stage['version'], digest)
        self.assertEqual(len(stage['answers']), 5)
        self.assertEqual(stage['answers'][0]['hitboxes'][0]['x'], 20/256)
        self.assertEqual(json.loads((out/'provenance.json').read_text(encoding='utf-8'))['decision'], decision)
        for index, name in enumerate(stage['images']):
            self.assertEqual(hashlib.sha256((out/Path(name).name).read_bytes()).hexdigest(), self.package['images'][index]['sha256'])
        with self.assertRaises(ValueError):
            review.stage(self.vault, digest, self.root/'production', 'production')
        with self.assertRaises(ValueError):
            review.stage(self.vault, digest, out)

    def test_rejection_and_duplicate_submits_never_reset_a_decision(self):
        digest = review.submit(self.vault, self.input)
        review.decide(self.vault, digest, 'rejected', 'Synthetic QA reviewer', 'Needs visual correction')
        self.assertEqual(review.submit(self.vault, self.input), digest)
        with self.assertRaises(FileExistsError):
            review.decide(self.vault, digest, 'approved', 'Other reviewer', 'Changed mind')
        with self.assertRaises(ValueError):
            review.stage(self.vault, digest, self.root/'output')

    def test_edit_cannot_reuse_prior_request_or_approval(self):
        digest = review.submit(self.vault, self.input)
        review.decide(self.vault, digest, 'approved', 'Synthetic QA reviewer', 'Synthetic only')
        changed = copy.deepcopy(self.package)
        changed['draft']['title'] += ' revision'
        with self.assertRaises(ValueError):
            review.validate_package(encode(changed))
        seal(changed)
        self.input.write_bytes(encode(changed))
        next_digest = review.submit(self.vault, self.input)
        self.assertNotEqual(digest, next_digest)
        with self.assertRaises(FileNotFoundError):
            review.stage(self.vault, next_digest, self.root/'output')
        (self.vault/digest/'request.json').write_bytes(encode(changed))
        with self.assertRaises(ValueError):
            review.stage(self.vault, digest, self.root/'tampered')

    def test_forged_qa_flags_and_image_digests_are_not_trusted(self):
        bad = copy.deepcopy(self.package)
        bad['images'][1]['sha256'] = '0'*64
        seal(bad)
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            review.validate_package(encode(bad))
        bad = copy.deepcopy(self.package)
        image = Image.open(io.BytesIO(base64.b64decode(bad['images'][1]['data'].split(',')[1]))).convert('RGB')
        image.putpixel((250, 250), (0, 0, 0))
        stream = io.BytesIO()
        image.save(stream, format='PNG')
        raw = stream.getvalue()
        bad['images'][1].update(data='data:image/png;base64,'+base64.b64encode(raw).decode(), sha256=hashlib.sha256(raw).hexdigest())
        seal(bad)
        with self.assertRaisesRegex(ValueError, 'outside'):
            review.validate_package(encode(bad))

    def test_review_type_geometry_and_input_limits_are_enforced(self):
        for change in ['unclassified', 'overlap', 'empty', 'count', 'id', 'public', 'missing-request']:
            bad = copy.deepcopy(self.package)
            if change == 'unclassified': bad['draft']['regions'][0]['changeType'] = 'unclassified'
            if change == 'overlap': bad['draft']['regions'][1]['box'] = bad['draft']['regions'][0]['box']
            if change == 'empty': bad['draft']['regions'][0]['box'] = [1, 1, 2, 2]
            if change == 'count': bad['draft']['regions'].pop()
            if change == 'id': bad['draft']['id'] = '../escape'
            if change == 'public': bad['visibility'] = 'public'
            seal(bad)
            if change == 'missing-request': del bad['reviewRequest']
            with self.subTest(change=change), self.assertRaises(ValueError):
                review.validate_package(encode(bad))
        with self.assertRaises(ValueError): review.validate_package(b'x'*(review.MAX_PACKAGE+1))
        with self.assertRaises(ValueError): review.validate_package(b'{"format":1,"format":2}')
        with self.assertRaises(ValueError): review.revision_path(self.vault, '../escape')
        with self.assertRaises(ValueError): review.private_destination(Path(review.__file__).resolve().parents[2]/'private-output')

    def test_atomic_decisions_have_only_one_winner(self):
        digest = review.submit(self.vault, self.input)
        def decide(label):
            try:
                review.decide(self.vault, digest, 'approved', label, 'Synthetic concurrent review')
                return 1
            except FileExistsError:
                return 0
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sum(pool.map(decide, ['QA one', 'QA two'])), 1)
        self.assertIn(json.loads((self.vault/digest/'decision.json').read_text(encoding='utf-8'))['reviewer'], ['QA one', 'QA two'])

    def test_cross_language_canonical_content_ignores_noncontent_flags(self):
        package = self.package
        images = [{'name': '원본.png', 'sha256': 'a'*64}, {'name': '변형.png', 'sha256': 'b'*64}]
        result = hashlib.sha256(review.canonical(package['draft'], images)).hexdigest()
        # Same fixture and literal are asserted by studio-core's Node tests.
        self.assertEqual(result, '774508aacfa61506d50f566597fa49a4b3dcbc588650834767eb4fa314857eca')


if __name__ == '__main__':
    unittest.main()
