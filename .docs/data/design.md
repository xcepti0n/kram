# Feature Design — Storage, Export & Import

**Status:** Approved
**Last updated:** 2026-09-04
**Requirements:** NFR-1.4, NFR-4 · **Parent:** [`../DESIGN.md`](../DESIGN.md)

---

## 1. Why SQLite

The workload is one user, a handful of concurrent requests, and a few thousand rows growing slowly.
Against that, SQLite wins on the things that actually cost effort over a system's life:

**No service to operate.** Postgres is a process to install, configure, secure, patch, monitor,
back up and eventually major-version upgrade. On a home server that maintenance is the dominant
cost of running the app, and it buys nothing the workload needs.

**Backup is already solved.** The database is one file inside the LXC. Proxmox already snapshots
the LXC, so the database is already in the backup rotation with no additional mechanism. Restoring
is restoring the snapshot.

**Fewer failure modes.** No network hop, no connection pool, no auth between app and database, no
"is the database up before the app starts" ordering problem in systemd. The database cannot be
down while the app is up.

**Synchronous access.** `better-sqlite3` is in-process and synchronous, which suits this workload
and removes a class of async bugs. Reads are sub-millisecond.

**WAL mode** allows concurrent readers alongside a writer, which is more than sufficient for one
user on several devices.

### 1.1 What this gives up

**Concurrent writers do not scale.** SQLite serialises writes. Irrelevant at one user; it would
matter at a dozen writing simultaneously.

**No network access to the database.** Nothing can connect to it but the app itself. In practice
this is a benefit here, but it does mean no external reporting tool pointed at the data — which is
part of why export exists.

**Weaker types and no native `DATE`.** Dates are stored as `YYYY-MM-DD` text. The repository layer
is the only code that touches SQL, so this is contained.

### 1.2 If it is ever outgrown

The repository layer is the only code with SQL in it. Porting means rewriting that layer, and the
JSON export below is a ready-made migration path — export from SQLite, import into whatever
replaces it. The trigger would be genuine multi-user concurrent writing, which is not the current
direction.

## 2. Export and import

A portable, human-readable snapshot of everything, independent of the storage engine. This serves
three purposes: a backup that does not depend on Proxmox, a migration path off SQLite, and simple
peace of mind that the data is not trapped.

### 2.1 Export

`GET /api/export` returns the full dataset as JSON, and `GET /api/export?download=1` sends it as a
file named `kram-YYYY-MM-DD.json`.

```jsonc
{
  "format": "task-timeline.export.v1",
  "version": 1,
  "exported_at": "2026-09-04T10:30:00Z",
  "users": [ { "id": "u1", "name": "vaiibhav", "created_at": "…" } ],
  "pages": [
    {
      "id": "p1", "name": "Home Server", "colour": "#4C7EF3",
      "position": "a", "created_at": "…",
      "members": [ "u1" ]
    }
  ],
  "tasks": [
    {
      "id": "t1", "page_id": "p1",
      "created_by": "u1", "assigned_to": "u1",
      "title": "Build task tracker",
      "description": null,
      "status": "in_progress",
      "colour": "#4C7EF3", "position": "a",
      "created_on": "2026-08-12", "completed_on": null,
      "location": null,
      "status_events": [
        { "id": "e1", "status": "todo",        "occurred_on": "2026-08-12" },
        { "id": "e2", "status": "in_progress", "occurred_on": "2026-08-14" }
      ],
      "updates": [
        { "id": "s1", "body": "Added backend",             "occurred_on": "2026-08-19" },
        { "id": "s2", "body": "Added frontend with theme", "occurred_on": "2026-09-02" }
      ]
    }
  ],
  "settings": [ { "user_id": "u1", "theme": "calm", "mode": "system", "density": "comfortable" } ]
}
```

Design notes:

- **Children nest inside their parent.** Updates and status events sit inside their task rather than
  in flat arrays. The file is meant to be read by a person, and nesting is how a person reads it.
- **Real ids are preserved**, so an export can round-trip back into the same database without
  duplicating rows.
- **`version` is present from the start**, so a future format change can be detected and converted
  rather than guessed at.
- **Soft-deleted rows are excluded** by default; `?include_deleted=1` includes them with their
  `deleted_at` intact, for a true full-fidelity backup.

### 2.2 Import

`POST /api/import` accepts the same document. The body carries a mode:

| Mode | Behaviour |
| --- | --- |
| `merge` (default) | Insert rows whose ids are absent; skip ids that already exist |
| `replace` | Delete everything, then insert the file's contents |
| `duplicate` | Insert everything under fresh ids, leaving existing data alone |

The whole import runs inside one transaction, so a malformed file leaves the database untouched.
Validation runs before any write, using the same Zod schemas the API uses, and reports every problem
at once rather than failing at the first.

`replace` is destructive, so it is the one place in the app that requires explicit confirmation
rather than offering undo — an undo toast cannot restore a wholesale wipe. The server automatically
writes a pre-import export to `data/backups/` first, so there is always a way back.

### 2.3 In the UI

Settings carries an Export button (downloads the file) and an Import control (file picker, then a
summary of what will be added or changed before it is applied). No confirmation dialogs beyond the
`replace` case.

## 3. Migrations

Ordered SQL files applied on boot before the server accepts connections, tracked in a
`schema_migrations` table. A deploy that changes the schema needs no separate step. Migrations are
forward-only; a mistake is corrected by a new migration rather than by editing an applied one.

## 4. Backup summary

Three layers, in increasing order of effort and decreasing order of automation:

| Layer | Mechanism | Recovers |
| --- | --- | --- |
| Proxmox LXC snapshot | Already running | Everything, including the app |
| Pre-import auto-export | `data/backups/`, written before any import | The last state before a risky import |
| Manual JSON export | Settings → Export | Anything, anywhere, engine-independent |

## 5. Testing

| Case | Coverage |
| --- | --- |
| Export contains every table's rows with children nested | Unit |
| Export round-trips: export → wipe → import `replace` → identical data | Unit |
| Import `merge` skips existing ids and inserts new ones | Unit |
| Import `duplicate` creates fresh ids without touching existing rows | Unit |
| A malformed file writes nothing and reports all errors | Unit |
| `replace` writes a pre-import backup first | Unit |
| Export and import from Settings | Playwright |
| Migrations run before the server listens | Integration |
