# Roadmap
- [ ] M0 문서/모노레포/CI 기반
- [ ] M1 검증용 1쌍 플레이 프로토타입, 이후 난이도별 3쌍
- [ ] M2 핵심 게임, 타이머, 힌트, 줌, 점수/별, 단위 테스트
- [ ] M3 챕터/해금/로컬 저장/백업/접근성
- [ ] M4 Studio 기본 등록/편집/테스트/배포
- [ ] M5 서버 판정/일일 랭킹/익명 토큰/시즌 집계
- [ ] M6 초기 30스테이지+튜토리얼, 통합/E2E/반응형/콘텐츠 검사, 스테이징, 사용자 승인
- [ ] M7 AI 대량 제작/성장/수집/미션/PWA 확장
무료 인프라 우선, 사업자 선정 후 검증. 정식 배포 승인 전 금지.

## Verified increment — 2026-11-27
- M1: three private draft QA stages deployed to authenticated staging; visual content approval pending.
- M3: chapter labels, sequential unlock with configurable star requirements, IndexedDB restoration, validated portable local backup, keyboard aiming and visible focus implemented. Broader accessibility review remains.
- M7: growth/collection/mission systems remain unimplemented; no final economy values selected.
- Release and paid service approval remains required.

## Growth increment — 2026-11-28
- Current three-stage private playtest accepted by the user.
- Basic growth/rewards implemented: stage-level first claims, coins, total EXP/derived levels, stock hints and exchange. Values remain provisional.
- Local persistence/backup upgraded compatibly; concurrent reward and debit boundaries covered by browser tests.
- This supersedes the earlier note that all growth work was unimplemented. Collections, missions, repeat-reward caps and challenge continues remain pending.
- Next content-production milestone: private Studio stage/answer editing and validation. Public release still needs separate approval.

## Studio increment — 2026-11-28

- M4 local authoring implemented at `/studio`: image pairs, linked rectangular regions, metadata, pixel QA, independent test play, local drafts and private package exchange.
- Existing catalog entries are copied into drafts; the editor does not publish or change runtime stages. Separate server roles, storage, approval and publication remain pending.
- See STUDIO.md for supported geometry, privacy boundaries and validation. Keep all staging paths under authentication. This does not complete M4 or authorize public release.

## Review gate increment — 2026-11-28

- M4: content-bound review requests and an offline trusted-operator approval gate implemented; approved-only private staging bundles can be generated without changing the active game.
- Server accounts/roles, durable server draft storage, authenticated decisions and runtime catalog activation remain pending. Local reviewer labels do not implement these roles.
- Public publication and paid resources remain outside the authorized staging scope.

## Catalog selection increment — 2026-11-28

- M4: approved revisions can form ordered private staging build catalogs, with checked activation/rollback and a selected-catalog build input in PD3-assets.
- Local unfinished sessions are pinned to content versions; revision changes preserve historical progression and rewards while resetting stale answer positions.
- Private operator tooling is implemented. Server identity/roles/storage, web activation and production publication remain pending; M4 is not complete.

## Web review backend increment — 2026-11-28

- M4: administrator inbox UI, Auth/Storage/Postgres adapter, enforceable role/ownership policies, worker-only image QA and immutable authenticated review decisions implemented.
- Dedicated hosted project, account/membership bootstrap, worker secret and real managed-service login/policy verification remain setup requirements. Unconfigured staging stays explicit; local policy tests and mocked auth flows are not a claim of hosted activation.
- Editable-draft cloud autosave, web catalog activation, public publication and broader M4/release approval remain pending.

## Hosted export increment — 2026-11-28

- M4: dedicated backend, active administrator membership, real Auth sign-in, managed policies and private worker connection verified; synthetic live API lifecycle assertions passed and test residue was cleaned separately.
- Approved hosted reviews can be explicitly exported as revalidated private snapshots. They remain pending under the local vault/catalog authority model; automatic authority transfer and web activation remain unfinished.
- Live browser button flow remains unverified due the desktop browser tool limitation. No milestone or release is marked complete.

