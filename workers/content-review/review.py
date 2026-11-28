"""Offline private review gate. Operator labels are audit data, not authentication.

Never point --vault or --output at the public player repository. No network,
deployment, credential handling or runtime catalog mutation happens here.
"""
import argparse
import base64
import hashlib
import io
import json
import os
import re
import shutil
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

LEVELS = {'easy': 5, 'normal': 6, 'hard': 7}
TYPES = {'add', 'remove', 'color', 'size', 'move', 'rotate', 'shape', 'detail', 'count'}
MAX_PACKAGE = 50 * 1024 * 1024


def require(ok, message):
    if not ok:
        raise ValueError(message)


def integer(value, low, high):
    return type(value) is int and low <= value <= high


def text(value, limit):
    return isinstance(value, str) and len(value.encode('utf-16-le')) // 2 <= limit


def parse_draft(value):
    require(isinstance(value, dict), 'invalid draft')
    d = value
    require(text(d.get('id'), 80) and re.fullmatch(r'[A-Za-z0-9_-]{1,80}', d['id']) and d['id'] not in ('__proto__', 'constructor', 'prototype'), 'invalid stage ID')
    require(text(d.get('title'), 120) and d['title'].strip(), 'invalid title')
    require(text(d.get('chapter', ''), 80) and text(d.get('notes', ''), 2000), 'invalid metadata')
    require(d.get('difficulty') in LEVELS and integer(d.get('limit'), 10, 3600) and integer(d.get('resolution'), 256, 2048), 'invalid difficulty/time/resolution')
    regions = d.get('regions')
    require(isinstance(regions, list) and len(regions) == LEVELS[d['difficulty']], 'incorrect answer count')
    ids, parsed = set(), []
    for r in regions:
        require(isinstance(r, dict) and integer(r.get('id'), 1, 1000000) and r['id'] not in ids, 'invalid region ID')
        ids.add(r['id'])
        box = r.get('box')
        require(isinstance(box, list) and len(box) == 4 and all(integer(v, 0, d['resolution']) for v in box), 'invalid box')
        x0, y0, x1, y1 = box
        require(x0 < x1 and y0 < y1, 'empty box')
        require(r.get('difficulty') in LEVELS and r.get('changeType') in TYPES, 'unclassified answer or invalid difficulty')
        for previous in parsed:
            a = previous['box']
            require(not (x0 <= a[2] and x1 >= a[0] and y0 <= a[3] and y1 >= a[1]), 'overlapping or touching boxes')
        parsed.append({'id': r['id'], 'box': box[:], 'difficulty': r['difficulty'], 'changeType': r['changeType']})
    require(max(Counter(r['changeType'] for r in parsed).values()) <= 2, 'more than two answers of one type')
    return {'id': d['id'], 'title': d['title'], 'chapter': d.get('chapter', ''), 'notes': d.get('notes', ''), 'difficulty': d['difficulty'], 'limit': d['limit'], 'resolution': d['resolution'], 'regions': parsed}


def canonical(draft, images):
    value = {'draft': draft, 'images': [{'name': im['name'], 'sha256': im['sha256']} for im in images]}
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def validate_package(raw, expected=None):
    require(len(raw) <= MAX_PACKAGE, 'package exceeds 50MB')
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    value = json.loads(raw, object_pairs_hook=unique)
    require(isinstance(value, dict) and value.get('format') == 'pd3-studio-draft' and type(value.get('version')) is int and value['version'] == 1 and value.get('visibility') == 'private', 'not a private Studio package')
    draft = parse_draft(value.get('draft'))
    images = value.get('images')
    require(isinstance(images, list) and len(images) == 2, 'two images required')
    pixels, binaries = [], []
    for im in images:
        require(isinstance(im, dict) and text(im.get('name'), 160), 'invalid image name')
        require(isinstance(im.get('sha256'), str) and re.fullmatch('[a-f0-9]{64}', im['sha256']), 'invalid image digest')
        data = im.get('data')
        require(isinstance(data, str) and len(data) <= 24 * 1024 * 1024, 'invalid image data')
        match = re.fullmatch(r'data:image/(png|webp);base64,([A-Za-z0-9+/]+={0,2})', data)
        require(match is not None, 'PNG/WebP data URL required')
        binary = base64.b64decode(match[2], validate=True)
        require(0 < len(binary) <= 16 * 1024 * 1024 and hashlib.sha256(binary).hexdigest() == im['sha256'], 'image digest mismatch')
        with Image.open(io.BytesIO(binary)) as image:
            require(image.format == match[1].upper() and image.size == (draft['resolution'],) * 2 and getattr(image, 'n_frames', 1) == 1, 'invalid image format/size or animation')
            rgba = np.array(image.convert('RGBA'))
        require(np.all(rgba[:, :, 3] == 255), 'transparent images unsupported')
        pixels.append(rgba)
        binaries.append((binary, match[1]))
    digest = hashlib.sha256(canonical(draft, images)).hexdigest()
    request = value.get('reviewRequest')
    require(isinstance(request, dict) and type(request.get('version')) is int and request['version'] == 1 and request.get('contentDigest') == digest and request.get('testPlayCleared') is True and request.get('semanticReviewConfirmed') is True, 'missing or stale review request')
    require(expected is None or digest == expected, 'stored revision changed')
    # Browser QA assertions are never used as proof. Recompute from decoded bytes.
    changed = np.any(pixels[0] != pixels[1], axis=2)
    union = np.zeros(changed.shape, dtype=bool)
    counts = []
    for r in draft['regions']:
        x0, y0, x1, y1 = r['box']
        count = int(changed[y0:y1, x0:x1].sum())
        require(count > 0, 'region contains no changed pixels')
        counts.append(count)
        union[y0:y1, x0:x1] = True
    require(not np.any(changed & ~union), 'changed pixels outside declared regions')
    return {'digest': digest, 'draft': draft, 'binaries': binaries, 'counts': counts}


def read_limited(path):
    with Path(path).open('rb') as stream:
        raw = stream.read(MAX_PACKAGE + 1)
    require(len(raw) <= MAX_PACKAGE, 'package exceeds 50MB')
    return raw


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def private_destination(value):
    path = Path(value).resolve()
    source = Path(__file__).resolve().parents[2]
    require(not path.is_relative_to(source), 'private outputs must be outside the player source checkout')
    return path


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def revision_path(vault, digest):
    require(isinstance(digest, str) and re.fullmatch('[a-f0-9]{64}', digest), 'invalid revision digest')
    root = private_destination(vault)
    path = root / digest
    require(not path.is_symlink(), 'revision symlinks unsupported')
    return path


def load_revision(vault, digest):
    path = revision_path(vault, digest)
    require(not (path / 'request.json').is_symlink(), 'request symlinks unsupported')
    return path, validate_package(read_limited(path / 'request.json'), digest)


def submit(vault, package):
    raw = read_limited(package)
    result = validate_package(raw)
    root = private_destination(vault)
    root.mkdir(parents=True, exist_ok=True)
    destination = revision_path(root, result['digest'])
    if destination.exists():
        load_revision(root, result['digest'])
        return result['digest']  # Idempotent; never resets an existing decision.
    temporary = Path(tempfile.mkdtemp(prefix='.pending-', dir=root))
    try:
        (temporary / 'request.json').write_bytes(raw)
        write_json(temporary / 'received.json', {'version': 1, 'digest': result['digest'], 'receivedAt': timestamp(), 'outsideChanged': 0, 'regionChanged': result['counts']})
        try:
            os.rename(temporary, destination)
        except OSError:
            if not destination.exists():
                raise
            load_revision(root, result['digest'])
        return result['digest']
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def decide(vault, digest, decision, reviewer, note):
    path, _ = load_revision(vault, digest)
    require(decision in ('approved', 'rejected') and text(reviewer, 120) and reviewer.strip() and text(note, 2000) and note.strip(), 'explicit reviewer and review note required')
    record = {'version': 1, 'digest': digest, 'decision': decision, 'reviewer': reviewer, 'note': note, 'decidedAt': timestamp(), 'authority': 'trusted-local-operator'}
    # Link a complete temporary record atomically. Concurrent decisions cannot
    # replace one another, and readers never see a partially written approval.
    fd, temp = tempfile.mkstemp(prefix='.decision-', dir=path)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(record, stream, ensure_ascii=False, indent=2)
        os.link(temp, path / 'decision.json')
    finally:
        Path(temp).unlink(missing_ok=True)
    return record


def stage(vault, digest, output, target='staging'):
    require(target == 'staging', 'only private staging export is allowed')
    path, result = load_revision(vault, digest)
    require(not (path / 'decision.json').is_symlink(), 'decision symlinks unsupported')
    decision = json.loads((path / 'decision.json').read_text(encoding='utf-8'))
    require(isinstance(decision, dict) and type(decision.get('version')) is int and decision['version'] == 1 and decision.get('digest') == digest and decision.get('decision') == 'approved' and decision.get('authority') == 'trusted-local-operator' and isinstance(decision.get('reviewer'), str) and decision['reviewer'].strip() and isinstance(decision.get('note'), str) and decision['note'].strip(), 'revision not approved')
    destination = private_destination(output)
    require(not destination.exists(), 'output already exists; use a new version directory')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.stage-', dir=destination.parent))
    try:
        d, images, answers = result['draft'], [], []
        for side, (raw, extension) in enumerate(result['binaries']):
            name = f'{digest}-{side}.{extension}'
            (temporary / name).write_bytes(raw)
            images.append('/qa/' + name)
        n = d['resolution']
        for r in d['regions']:
            x0, y0, x1, y1 = r['box']
            box = {'shape': 'rect', 'x': x0/n, 'y': y0/n, 'w': (x1-x0)/n, 'h': (y1-y0)/n}
            answers.append({'id': r['id'], 'x': (x0+x1)/(2*n), 'y': (y0+y1)/(2*n), 'r': max(x1-x0, y1-y0)/(2*n), 'hitboxes': [box.copy(), box.copy()], 'difficulty': r['difficulty']})
        write_json(temporary / 'stage.json', {'id': d['id'], 'title': d['title'], 'chapter': d['chapter'], 'difficulty': d['difficulty'], 'limit': d['limit'], 'version': digest, 'images': images, 'answers': answers})
        write_json(temporary / 'provenance.json', {'version': 1, 'target': 'staging', 'contentDigest': digest, 'decision': decision, 'createdAt': timestamp()})
        os.rename(temporary, destination)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vault', required=True, type=Path)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('submit').add_argument('package', type=Path)
    decision = commands.add_parser('decide')
    decision.add_argument('digest')
    decision.add_argument('--decision', required=True, choices=['approved', 'rejected'])
    decision.add_argument('--reviewer', required=True)
    decision.add_argument('--note', required=True)
    export = commands.add_parser('stage')
    export.add_argument('digest')
    export.add_argument('--output', required=True, type=Path)
    export.add_argument('--target', default='staging', choices=['staging'])
    args = parser.parse_args()
    try:
        if args.command == 'submit':
            print(submit(args.vault, args.package))
        elif args.command == 'decide':
            decide(args.vault, args.digest, args.decision, args.reviewer, args.note)
            print(args.decision)
        else:
            stage(args.vault, args.digest, args.output, args.target)
            print('approved private staging bundle created')
    except (ValueError, OSError, KeyError, TypeError, Image.DecompressionBombError) as error:
        parser.exit(1, f'Review gate rejected: {error}\n')


if __name__ == '__main__':
    main()
