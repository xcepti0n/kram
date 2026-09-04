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

## 2. Schema

Three nullable columns on `tasks`:

```
location_label  TEXT, null      "Hardware store", "Office"
location_lat    REAL, null
location_lng    REAL, null
```

A label without coordinates is allowed — *"in the garage"* is a useful note even without a point on
a map. Coordinates without a label are back-filled with a formatted coordinate string for display.

Kept as columns rather than a separate table because a task has at most one location, and a join for
three nullable fields would earn nothing.

## 3. Capture

Low friction matters here or it will not be used (FR-10):

- **"Use my current location"** — one tap, via the browser geolocation API, filling coordinates and
  leaving the label for the user.
- **Free-text label** — typed, no coordinates needed.
- **Saved places** — labels already used on other tasks are offered as autocomplete, so *"Hardware
  store"* is typed once and reused with its coordinates.

Permission is requested only when the button is pressed, never on load.

## 4. Display and filtering — FR-8.2

The task row shows a small location chip when a location is set. The side sheet shows the label and,
where coordinates exist, a link opening the platform's map application.

The task list filters by location label. This is the useful behaviour today: *"show me everything I
need to do at the hardware store"* before setting off, which delivers most of the practical value of
the notification feature without needing background execution.

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

**Schema impact when built.** Additive — a `radius_m` column on tasks, and a `geofences` table if a
place is ever shared by several tasks. No existing table changes shape.

## 7. Testing

| Case | Requirement |
| --- | --- |
| Set a location label with no coordinates | FR-8.1 |
| Set coordinates via the current-location button (mocked) | §3 |
| Location chip appears on the row when set | FR-8.2 |
| Filter the list by location label | FR-8.2 |
| Clearing a location removes it | FR-8.1 |
| Label autocomplete offers previously used places | §3 |
| Export and import round-trip location fields | `../data/design.md` |
