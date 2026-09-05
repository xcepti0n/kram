# Feature Design — Location

**Status:** Approved — storage only; notifications deferred
**Last updated:** 2026-09-04
**Requirements:** FR-8 (P1) · **Parent:** [`../DESIGN.md`](../DESIGN.md)

---

## 1. Scope

A task may carry an optional location. It is stored, displayed and filterable. **Arrival
notifications are deferred** (DD-12).

The reason is honest rather than convenient: browsers cannot reliably evaluate geofences in the
background. iOS is strictest — a web app gets no background geolocation at all — and Android is
unreliable once the tab is discarded. Shipping a notification feature that silently fails to fire is
worse than not having one, because it would be trusted.

Storing the data now means it accumulates from day one and is ready when a workable trigger exists.

## 2. Places, not per-task locations (DD-23)

A place is somewhere you return to: the office, the hardware store, home. It is a record in its own
right, and tasks reference it.

```
places
├── id         PK
├── user_id    FK → users
├── name       TEXT        "Office"
├── lat        REAL, null
├── lng        REAL, null
├── radius_m   INTEGER     default 150; the trigger radius when alerts exist
└── created_at

tasks.place_id  FK → places, null
```

**Why not free text on each task.** The useful question is *"what can I do while I am at the
office"*. Two tasks at the same place must therefore resolve to the same thing — unrelated strings
cannot answer that, and neither can coordinates entered twice. Naming a place once and attaching
tasks to it also makes the planned "you are at X, these match" panel a query rather than a redesign.

`tasks.location_label` survives as a fallback for a location that is a note rather than a place
("in the garage").

## 3. Capture (DD-24)

The interaction is **choose, not describe**:

- **Type to filter** the places already saved, ordered by how many tasks use them — the place you
  attach work to most is the one you probably want.
- **Create** appears only when nothing matches what you typed.
- **"Use where I am"** saves the current position under the typed name, via the browser geolocation
  API. Permission is asked for on that press, never on load.

**No address search.** Geocoding means calling an external service from the home server, sending
search text off the machine, and handling rate limits — for a lookup needed once per place, and only
for a place you are not at. Saving the position while standing there is simpler and more accurate.
The cost is that a place you have never visited needs its coordinates typed or saved on first
arrival; until then the name alone is enough.

## 4. Display and filtering — FR-8.2

The task row shows a place chip when one is set. In the picker, a place with coordinates carries a
small dot: it can eventually trigger an arrival alert, where a name-only place cannot.

`GET /api/tasks?place_id=` filters to one place — *"show me everything I need to do at the hardware
store"* before setting off. That delivers most of the practical value of arrival notifications
without needing background execution.

`GET /api/places/near?lat=&lng=` returns places whose radius contains a position, nearest first.
Nothing calls it yet; it is the query the suggestion panel below is built on.

## 5. Future prioritisation

Location is an input to conditional sorting, described in
[`../tasks/design.md`](../tasks/design.md#42-sorting). A `sort=nearby` mode would score tasks by
distance from the device's current position, requiring a scoring function and a one-off location
read — no schema change.

## 6. Deferred: arrival notifications

Recorded so today's schema stays compatible.

**What is needed.** A trigger that fires when the device enters a region, and a delivery channel.
The plausible shapes:

| Approach | Reliability | Setup |
| --- | --- | --- |
| Phone automation (iOS Shortcuts, Tasker) calling a webhook | High — the OS owns geofencing | Per-device, manual |
| PWA with a service worker polling position | Poor on iOS, mediocre on Android | None |
| Companion poller on the home network | Only works at home | Moderate |

The first is most likely: the operating system already does geofencing well, and the app only needs
to receive a webhook and decide what to say.

**Schema impact when built.** None. `places.radius_m` already exists and `/api/places/near` already
answers the question; what is missing is only the trigger that calls it.

**The planned panel.** A third view beside Overview and Timeline: read the device position once,
call `/api/places/near`, and list the open tasks at whichever places match. That is a view over
existing endpoints, which is the point of modelling places as records.

## 7. Testing

| Case | Requirement |
| --- | --- |
| Create a place from the picker and attach it | FR-8.1 |
| Saving the same name twice reuses the first place | DD-23 |
| A place created without coordinates gains them later | DD-23 |
| Filtering the picker as you type | §3 |
| Place chip appears on the task row | FR-8.2 |
| Removing a place from a task | FR-8.1 |
| `?place_id=` filters the task list | FR-8.2 |
| Deleting a place detaches it but keeps the tasks | DD-23 |
| `/api/places/near` respects each place's radius | §6 |
| Export and import round-trip places and their task links | `../data/design.md` |
