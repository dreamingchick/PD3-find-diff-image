"""Import an unsigned hosted snapshot as PENDING, retaining its audit evidence."""
import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path

import review

MAX_SNAPSHOT = 51 * 1024 * 1024


def read_snapshot(path):
    review.require(not Path(path).is_symlink(), 'snapshot symlinks unsupported')
    with Path(path).open('rb') as stream:
        raw = stream.read(MAX_SNAPSHOT + 1)
    review.require(len(raw) <= MAX_SNAPSHOT, 'snapshot exceeds size limit')
    return raw


def unique(pairs):
    value = {}
    for key, item in pairs:
        review.require(key not in value, 'duplicate snapshot key')
        value[key] = item
    return value


def valid_uuid(value):
    try:
        return isinstance(value, str) and str(uuid.UUID(value)) == value
    except (ValueError, AttributeError):
        return False


def valid_time(value):
    try:
        return isinstance(value, str) and datetime.fromisoformat(value.replace('Z', '+00:00')).tzinfo is not None
    except ValueError:
        return False


def validate_snapshot(raw, project, digest):
    review.require(isinstance(project, str) and re.fullmatch(r'https://[a-z0-9]{20}\.supabase\.co', project), 'dedicated source project required')
    review.require(isinstance(digest, str) and re.fullmatch('[a-f0-9]{64}', digest), 'exact content digest required')
    review.require(len(raw) <= MAX_SNAPSHOT, 'snapshot exceeds size limit')
    value = json.loads(raw, object_pairs_hook=unique)
    review.require(isinstance(value, dict) and value.get('format') == 'pd3-hosted-review-export' and type(value.get('version')) is int and value['version'] == 1 and value.get('visibility') == 'private' and value.get('contentDigest') == digest, 'not the selected private hosted snapshot')
    source, server, package = value.get('source'), value.get('serverReview'), value.get('package')
    review.require(isinstance(source, dict) and source.get('url') == project and source.get('authority') == 'hosted-review-snapshot', 'snapshot project or authority mismatch')
    review.require(isinstance(server, dict) and isinstance(package, dict), 'missing server/package evidence')
    package_raw = json.dumps(package, ensure_ascii=False, separators=(',', ':')).encode()
    checked = review.validate_package(package_raw, digest)  # Decode and recompute actual pixels.
    expected_images = []
    for index, (image, (_, extension)) in enumerate(zip(package['images'], checked['binaries'])):
        expected_images.append({'name': image['name'], 'sha256': image['sha256'], 'mime': 'image/' + extension, 'path': f'{digest}/{index}.{extension}'})
    validation, decision = server.get('validation'), server.get('decision')
    review.require(server.get('digest') == digest and server.get('canonical') == review.canonical(checked['draft'], package['images']).decode() and server.get('images') == expected_images and server.get('reviewRequest') == package['reviewRequest'], 'snapshot content evidence mismatch')
    review.require(valid_uuid(server.get('createdBy')) and valid_time(server.get('submittedAt')) and valid_time(value.get('exportedAt')), 'invalid submission audit identity/time')
    review.require(isinstance(validation, dict) and validation.get('passed') is True and validation.get('validatorVersion') == 'pd3-pixels-v1' and review.text(validation.get('message'), 500) and valid_time(validation.get('checkedAt')), 'invalid server validation evidence')
    review.require(isinstance(decision, dict) and decision.get('decision') == 'approved' and valid_uuid(decision.get('actorId')) and review.text(decision.get('note'), 2000) and decision['note'].strip() and valid_time(decision.get('decidedAt')), 'invalid server approval evidence')
    evidence = {'authority': 'unsigned-hosted-snapshot', 'project': project, 'digest': digest, 'snapshotSha256': hashlib.sha256(raw).hexdigest(), 'serverReview': server}
    return package_raw, checked, evidence


def stored_evidence(path, digest):
    raw = read_snapshot(path / 'hosted-origin.json')
    value = json.loads(raw, object_pairs_hook=unique)
    review.require(isinstance(value, dict) and isinstance(value.get('source'), dict), 'invalid stored hosted origin')
    package_raw, _, evidence = validate_snapshot(raw, value['source'].get('url'), digest)
    review.require(json.loads(review.read_limited(path / 'request.json')) == json.loads(package_raw), 'stored request differs from hosted origin')
    return evidence


def import_snapshot(vault, snapshot, project, digest):
    raw = read_snapshot(snapshot)
    package_raw, checked, evidence = validate_snapshot(raw, project, digest)
    root = review.private_destination(vault)
    root.mkdir(parents=True, exist_ok=True)
    destination = review.revision_path(root, digest)
    if destination.exists():
        review.require(stored_evidence(destination, digest) == evidence, 'existing revision has different hosted evidence')
        return digest  # Never adds/replaces/resets an existing local decision.
    temporary = Path(tempfile.mkdtemp(prefix='.pending-', dir=root))
    try:
        (temporary / 'request.json').write_bytes(package_raw)
        (temporary / 'hosted-origin.json').write_bytes(raw)
        review.write_json(temporary / 'received.json', {'version': 1, 'digest': digest, 'receivedAt': review.timestamp(), 'outsideChanged': 0, 'regionChanged': checked['counts'], 'source': 'hosted-snapshot-pending-local-review'})
        try:
            os.rename(temporary, destination)
        except OSError:
            if not destination.exists():
                raise
            review.require(stored_evidence(destination, digest) == evidence, 'concurrent import evidence mismatch')
        return digest
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vault', required=True, type=Path)
    parser.add_argument('--snapshot', required=True, type=Path)
    parser.add_argument('--project', required=True)
    parser.add_argument('--digest', required=True)
    args = parser.parse_args()
    try:
        print(import_snapshot(args.vault, args.snapshot, args.project, args.digest))
    except (ValueError, OSError, KeyError, TypeError, review.Image.DecompressionBombError):
        parser.exit(1, 'Hosted snapshot import rejected; no approval was granted.\n')


if __name__ == '__main__':
    main()
