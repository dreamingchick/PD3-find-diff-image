# Practice growth and rewards — staging balance

These values are provisional and live in `packages/game-engine/economy.mjs`.

| Action | Current value |
| --- | --- |
| First completion of a picture | 100 coins + 60 EXP |
| Level interval | 100 total EXP per level |
| Exchange earned coins for one stock hint | 25 coins |
| Free hints | One per attempt, used before stock hints |

A picture grants its first-completion reward once across normal and challenge modes. Replays, reloads, retries and another tab cannot grant it again. Repeat rewards, daily caps, challenge continues, collections and missions are not implemented in this increment. Coins have no payment integration.

The lobby shows the level, progress to the next level, coins and stock hints. The clear result distinguishes a new first reward from a replay. Stock hints are available after the attempt's free hint. All hints count toward score and stars. Returning to a normal session preserves its free-hint flag and total hint count; challenge sessions are not resumed.

## Persistence and migration

Progress and portable backups now use version 2. Previous IndexedDB records and version-1 backups remain readable. A legacy completion migrates to one reward claim per picture, counting both modes together. Existing records and unfinished normal sessions are retained. Level is derived from persisted total EXP.

Record updates and first-reward claims share one IndexedDB transaction. Hint exchange/debit also uses transactions; session saves never replace the wallet. Writes within a tab are queued, revisions keep older UI snapshots from winning, and other tabs refresh via BroadcastChannel/focus. Monotonic hint counts prevent an older timer save from undoing a debit. Answer input waits for a pending hint transaction so clear scoring cannot omit that hint.

A failed transaction leaves resources unchanged. A valid backup can repair invalid local state. Restoring a backup explicitly replaces records and resources with that snapshot; it is not an additive import. These are editable local practice records, not evidence for server rankings or an anti-tamper currency system.

## Verification

Engine tests cover idempotent rewards, overflow/underflow, level thresholds, migration, backup round trips and invalid data. Browser journeys use real IndexedDB to exercise cross-mode/replay/reload, free then stock hints, migrated backups, corrupt-state repair, concurrent clears/exchanges/debits in two tabs, and a deliberately held transaction racing the final answer. Existing gesture, spotlight, viewport, keyboard and progress journeys remain part of CI.

The IndexedDB database also upgrades to version 2. This blocks an already-open legacy bundle from reopening it with version 1 and overwriting the new wallet through its old whole-snapshot saver. Existing object stores are retained, and newer connections close on version changes. Version-1 progress and backup data remain supported. Browser tests create a real version-1 database before app startup and verify migration plus rejection of legacy writer opens.

## Discovery collection increment

Seven cosmetic discovery badges now derive from retained practice records: one/three/ten distinct pictures, one/three pictures with a three-star record, one challenge completion, and 30 stars using each picture's best mode. Normal/challenge records count once per picture. A worse replay cannot lower max-star achievements. Historical records for pictures outside the current catalog still count toward this personal collection.

The lobby has a compact collection entry and a dedicated Badges tab with earned/locked states and bounded progress. No badge claim, currency/EXP grant or new storage/backup schema is introduced. Restoring a backup recalculates badges from that snapshot; an older or empty backup can reduce the displayed collection. Badges are local practice accomplishments, not ranked-server evidence. Existing first-clear rewards and hint costs are unchanged. Daily missions, collectible items, badge rewards and broader repeat economy remain pending.

Validation adds five engine tests and eight browser cases across desktop, high-DPR portrait, small portrait and landscape. Real clears, cross-mode deduplication, cross-tab updates, reload, historical backup restore, empty restore, no additional coin grant and viewport/menu accessibility are covered. Responsive screenshots use synthetic sample records only.
