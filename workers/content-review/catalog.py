"""Versioned private staging catalogs. Selection affects the next private build,
not the live deployment. Trusted local filesystem/operator model; no server auth.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path

import review


def digest(value):
    review.require(isinstance(value, str) and re.fullmatch('[a-f0-9]{64}', value), 'invalid content/release digest')
    return value


def read_json(path):
    review.require(not path.is_symlink() and path.is_file(), 'missing file or unsupported symlink')
    return json.loads(review.read_limited(path))


def release_identity(entries):
    return hashlib.sha256(json.dumps({'version': 1, 'target': 'staging', 'stages': entries}, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode()).hexdigest()


def release_path(registry, release):
    root = review.private_destination(registry)
    path = root / 'releases' / digest(release)
    review.require(not (root/'releases').is_symlink() and not path.is_symlink(), 'release symlinks unsupported')
    return path


@contextmanager
def lock(registry):
    root = review.private_destination(registry)
    root.mkdir(parents=True, exist_ok=True)
    marker = root / '.catalog-lock'
    try:
        marker.mkdir()
    except FileExistsError:
        raise ValueError('catalog busy; a stopped operator must verify and remove a stale lock') from None
    try:
        yield root
    finally:
        marker.rmdir()


def verify_release(vault, registry, release):
    folder = release_path(registry, release)
    value = read_json(folder/'catalog.json')
    review.require(isinstance(value, dict) and value.get('format') == 'pd3-staging-catalog' and value.get('version') == 1 and value.get('target') == 'staging' and value.get('releaseId') == release, 'invalid catalog')
    entries = value.get('stages')
    review.require(isinstance(entries, list) and 1 <= len(entries) <= 100, 'catalog needs 1–100 stages')
    normalized, ids, versions, stages, images = [], set(), set(), [], []
    for entry in entries:
        review.require(isinstance(entry, dict) and isinstance(entry.get('id'), str), 'invalid catalog entry')
        version = digest(entry.get('digest'))
        review.require(entry['id'] not in ids and version not in versions, 'duplicate picture ID or revision')
        ids.add(entry['id'])
        versions.add(version)
        normalized.append({'id': entry['id'], 'digest': version})
        result, decision = review.approved_revision(vault, version)
        expected = review.stage_value(result)
        review.require(expected['id'] == entry['id'], 'catalog ID mismatch')
        bundle = folder / version
        review.require(not bundle.is_symlink(), 'bundle symlinks unsupported')
        review.require(read_json(bundle/'stage.json') == expected, 'stage bundle differs from approved revision')
        provenance = read_json(bundle/'provenance.json')
        review.require(isinstance(provenance, dict) and provenance.get('target') == 'staging' and provenance.get('contentDigest') == version and provenance.get('decision') == decision, 'bundle approval mismatch')
        for side, (binary, extension) in enumerate(result['binaries']):
            name = f'{version}-{side}.{extension}'
            file = bundle / name
            review.require(not file.is_symlink() and review.read_limited(file) == binary, 'bundle image changed')
            images.append((name, binary))
        stages.append(expected)
    review.require(entries == normalized and release_identity(normalized) == release, 'catalog content/order changed')
    return stages, images


def build(vault, registry, revisions, target='staging'):
    review.require(target == 'staging' and 1 <= len(revisions) <= 100 and len(set(revisions)) == len(revisions), 'invalid staging catalog selection')
    with lock(registry) as root:
        destination_root = root / 'releases'
        review.require(not destination_root.is_symlink(), 'release symlinks unsupported')
        destination_root.mkdir(exist_ok=True)
        temporary = Path(tempfile.mkdtemp(prefix='.release-', dir=destination_root))
        try:
            entries, ids = [], set()
            for revision in revisions:
                digest(revision)
                bundle = review.stage(vault, revision, temporary / revision)
                stage = read_json(bundle/'stage.json')
                review.require(stage['id'] not in ids, 'duplicate picture ID')
                ids.add(stage['id'])
                entries.append({'id': stage['id'], 'digest': revision})
            release = release_identity(entries)
            write = {'format': 'pd3-staging-catalog', 'version': 1, 'target': 'staging', 'releaseId': release, 'stages': entries}
            review.write_json(temporary/'catalog.json', write)
            destination = release_path(registry, release)
            if destination.exists():
                verify_release(vault, root, release)
            else:
                os.rename(temporary, destination)
            return release
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)


def current(registry):
    root = review.private_destination(registry)
    pointer = root / 'active.json'
    if not pointer.exists():
        review.require(not pointer.is_symlink(), 'active pointer symlink unsupported')
        return None
    value = read_json(pointer)
    review.require(isinstance(value, dict) and value.get('version') == 1 and value.get('target') == 'staging' and isinstance(value.get('eventId'), str) and re.fullmatch('[a-f0-9]{32}', value['eventId']), 'invalid active pointer')
    digest(value.get('releaseId'))
    review.require(not (root/'events').is_symlink(), 'event symlinks unsupported')
    event = read_json(root/'events'/f"{value['eventId']}.json")
    review.require(isinstance(event, dict) and event.get('version') == 1 and event.get('target') == 'staging' and event.get('eventId') == value['eventId'] and event.get('releaseId') == value['releaseId'] and event.get('action') in ('activate', 'rollback') and isinstance(event.get('actor'), str) and event['actor'].strip() and isinstance(event.get('note'), str) and event['note'].strip(), 'active receipt mismatch')
    previous = event.get('previousRelease')
    if previous is not None:
        digest(previous)
    return {**value, 'event': event}


def _select(vault, registry, release, expected, actor, note, action):
    review.require(review.text(actor, 120) and actor.strip() and review.text(note, 2000) and note.strip(), 'explicit actor and note required')
    with lock(registry) as root:
        active = current(root)
        token = active['eventId'] if active else 'none'
        review.require(expected == token, 'stale catalog selection; inspect current state and retry')
        if action == 'rollback':
            review.require(active is not None and active['event'].get('previousRelease') is not None, 'no previous release to restore')
            release = active['event']['previousRelease']
        verify_release(vault, root, release)
        review.require(active is None or active['releaseId'] != release, 'release already selected')
        event_id = uuid.uuid4().hex
        event = {'version': 1, 'target': 'staging', 'eventId': event_id, 'action': action, 'releaseId': release, 'previousRelease': active['releaseId'] if active else None, 'previousEvent': token if active else None, 'actor': actor, 'note': note, 'createdAt': review.timestamp()}
        events = root / 'events'
        review.require(not events.is_symlink(), 'event symlinks unsupported')
        events.mkdir(exist_ok=True)
        # The receipt is written first; active.json is the atomic commit point.
        # A crash before replacement leaves an unreferenced receipt, not a selection.
        with (events/f'{event_id}.json').open('x', encoding='utf-8') as stream:
            json.dump(event, stream, ensure_ascii=False, indent=2)
        fd, temporary = tempfile.mkstemp(prefix='.active-', dir=root)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                json.dump({'version': 1, 'target': 'staging', 'releaseId': release, 'eventId': event_id}, stream)
            os.replace(temporary, root/'active.json')
        finally:
            Path(temporary).unlink(missing_ok=True)
        return current(root)


def activate(vault, registry, release, expected, actor, note):
    return _select(vault, registry, release, expected, actor, note, 'activate')


def rollback(vault, registry, expected, actor, note):
    return _select(vault, registry, None, expected, actor, note, 'rollback')


def active_snapshot(vault, registry):
    with lock(registry) as root:
        active = current(root)
        review.require(active is not None, 'no selected staging catalog')
        stages, images = verify_release(vault, root, active['releaseId'])
        return active, stages, images


STAGE_PREFIX = 'import type {Answer} from "../../../packages/game-engine/index.mjs";\nexport type Stage={id:string;title:string;difficulty:string;limit:number;chapter?:string;requiredStars?:number;version?:string;images:[string,string];answers:(Answer&{difficulty?:string})[]};\n'


def export(vault, registry, output):
    active, stages, images = active_snapshot(vault, registry)
    destination = review.private_destination(output)
    review.require(not destination.exists(), 'output exists; use a fresh private build directory')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.catalog-', dir=destination.parent))
    try:
        assets = temporary/'qa'
        assets.mkdir()
        for name, binary in images:
            (assets/name).write_bytes(binary)
        (temporary/'stages.ts').write_text(STAGE_PREFIX+'export const stages:Stage[]='+json.dumps(stages, ensure_ascii=False)+';\n', encoding='utf-8')
        review.write_json(temporary/'catalog-state.json', {key: active[key] for key in ('version', 'target', 'releaseId', 'eventId')})
        os.rename(temporary, destination)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vault', required=True, type=Path)
    parser.add_argument('--registry', required=True, type=Path)
    commands = parser.add_subparsers(dest='command', required=True)
    b = commands.add_parser('build')
    b.add_argument('digests', nargs='+')
    for command in ('activate', 'rollback'):
        p = commands.add_parser(command)
        if command == 'activate': p.add_argument('release')
        p.add_argument('--expected', required=True)
        p.add_argument('--actor', required=True)
        p.add_argument('--note', required=True)
    commands.add_parser('status')
    p = commands.add_parser('export')
    p.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'build': print(build(args.vault, args.registry, args.digests))
        elif args.command == 'status': print(json.dumps(current(args.registry), ensure_ascii=False))
        elif args.command == 'activate': print(json.dumps(activate(args.vault, args.registry, args.release, args.expected, args.actor, args.note), ensure_ascii=False))
        elif args.command == 'rollback': print(json.dumps(rollback(args.vault, args.registry, args.expected, args.actor, args.note), ensure_ascii=False))
        else:
            export(args.vault, args.registry, args.output)
            print('selected private catalog exported for the next build; live deployment unchanged')
    except (ValueError, OSError, KeyError, TypeError) as error:
        parser.exit(1, f'Catalog rejected: {error}\n')


if __name__ == '__main__': main()
