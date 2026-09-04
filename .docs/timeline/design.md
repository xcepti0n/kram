# Feature Design — Timeline

**Status:** Approved
**Last updated:** 2026-09-04
**Requirements:** FR-5 · **Parent:** [`../DESIGN.md`](../DESIGN.md)

The centerpiece. One row per task, a calendar axis running left to right, each task a coloured line
carrying a point for every status update and segmented by what the task was doing when.

---

## 1. Why hand-written SVG (DD-5)

No charting library renders this natively — it is not a Gantt chart (no dependencies, no
durations-as-estimates) and not a scatter plot. Adapting one would cost more than drawing it, and
would fight the library at every customisation.

SVG keeps each update point as a real DOM node, so hover, focus and tap work without hit-testing a
canvas. That matters for touch (NFR-2.2) and for keyboard access. It also lets theme tokens drive
geometry directly, so Dense and Bold reshape the chart without touching its code.

## 2. Scale

One linear mapping from date to pixel:

```
x(date) = (date − range.from) / (range.to − range.from) × plotWidth
```

Zoom changes `range`, never the transform, so geometry stays exact at every level and text never
scales. Four levels set both range width and axis tick interval:

| Level | Typical span | Ticks |
| --- | --- | --- |
| Day | 2 weeks | Daily, weekday labels |
| Week | 3 months | Weekly, week-commencing |
| Month | 1 year | Monthly |
| Quarter | 3 years | Quarterly |

## 3. Layout

```
 ┌──────────┬──────────────────────────────────────────────────────┐
 │ (sticky) │  Aug 12    Aug 19    Aug 26    Sep 2                 │  ← axis, sticky top
 │  names   │    │         │         │         ┊                   │
 ├──────────┼────┼─────────┼─────────┼─────────┊───────────────────┤
 │ Build app│    ●━━━━━━━━━●╌╌╌╌╌╌╌╌╌●━━━━━━━━━┊━━━━━━━━━━━━━━━━━▶ │  in progress
 │ Garden   │    ●━━━━━━━━━━━━━━━━━━━◆         ┊                   │  done
 │ Taxes    │              ●━━━━━━━━━●         ┊                   │
 │ Invoices │         ●╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┊╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌▶  │  blocked
 └──────────┴──────────────────────────────────┊───────────────────┘
                                            today
   ━━━ in progress    ╌╌╌ blocked    ▶ open    ◆ done
```

The name column is sticky horizontally; the axis is sticky vertically. Both survive panning, so a
row is always identifiable.

## 4. Status segments — FR-4, FR-5.3

This is what separates the view from a row of dots. A task's line is drawn as **segments**, one per
interval between consecutive `status_events`, each styled by the status in force during it:

| Status | Rendering |
| --- | --- |
| `todo` | Thin, muted |
| `in_progress` | Full weight, full colour |
| `blocked` | Dashed, desaturated |
| `done` | Line terminates with a diamond cap |

So a task that ran, stalled for ten days, then finished reads as solid → dashed → solid → diamond,
and the length of the dashed stretch is the answer to *how long was that blocked?*

An open task's line runs to today and ends in an arrow, meaning "still going". A done task's line
ends at `completed_on`.

Segment construction, given a task's events sorted by `occurred_on`:

```
segments = []
for i, event in events:
    from = event.occurred_on
    to   = events[i+1]?.occurred_on ?? (completed_on ?? today)
    segments.push({ from, to, status: event.status })
```

Events sharing a date collapse to the last one — a task that went `todo → in_progress` on the same
day has no zero-width segment.

## 5. Points — FR-5.4, FR-5.6

Each status update is a point at `x(occurred_on)`, radius from `--point-radius`. Points sit above
the line and take the task's colour with a background-coloured ring, so they stay legible where
segments change style.

Hover or tap raises a card with the update's text and its date. Each point is a focusable SVG
element with an accessible label, so the same card is reachable by keyboard.

**Overlap.** When two points fall within one diameter of each other, they collapse into one marker
badged with the count; interacting expands them into a list. Without this a busy week becomes an
unreadable smear.

## 6. Colour — FR-5.5

Each task takes the next unused colour from an ordered palette on creation, and can be overridden.
The palette is chosen for distinguishability at small sizes and holds up in both light and dark
mode. Where a page grouping is active, the page's colour heads the group while tasks keep their
own, so a task is identifiable both by its page and individually.

## 7. Interaction — FR-5.7

| Action | Input |
| --- | --- |
| Pan | Horizontal drag, trackpad scroll, arrow keys |
| Zoom | `+` / `−`, pinch, `Ctrl`+scroll — anchored on the cursor |
| Jump to today | `T` |
| Point detail | Hover, tap, or keyboard focus |
| Open task | Click its name |

Cursor-anchored zoom means the date under the pointer stays put as the scale changes, which is what
makes zooming feel like a physical thing rather than a jump.

## 8. Grouping — FR-6.5

On the Overview timeline, rows group by page under a collapsible header carrying the page's colour.
A collapsed group renders one summary row showing the page's aggregate span, which keeps many pages
scannable at once.

## 9. Data

One request returns the whole view, avoiding an N+1 of per-task fetches:

`GET /api/timeline?from=&to=&page_ids=&include_done=&assigned_to=`

```jsonc
{
  "range": { "from": "2026-08-01", "to": "2026-09-04" },
  "pages": [ { "id": "p1", "name": "Home Server", "colour": "#4C7EF3" } ],
  "tasks": [
    {
      "id": "t1", "title": "Build app", "colour": "#4C7EF3", "page_id": "p1",
      "created_on": "2026-08-12", "completed_on": null, "status": "in_progress",
      "status_events": [
        { "status": "todo",        "occurred_on": "2026-08-12" },
        { "status": "in_progress", "occurred_on": "2026-08-14" },
        { "status": "blocked",     "occurred_on": "2026-08-19" },
        { "status": "in_progress", "occurred_on": "2026-08-29" }
      ],
      "updates": [
        { "id": "s1", "occurred_on": "2026-08-19", "body": "Blocked on API key" },
        { "id": "s2", "occurred_on": "2026-09-02", "body": "Added frontend with theme" }
      ]
    }
  ]
}
```

Tasks are included when their span intersects the requested range, so a task that started before
`from` still renders with its line clipped at the viewport edge.

## 10. Performance — NFR-3.2

Target: smooth at 200 tasks × 20 updates. Measures, in the order they will be applied:

1. Render only rows intersecting the vertical viewport.
2. Render only segments and points intersecting the horizontal range.
3. Memoise scale computation per range, not per element.
4. Throttle pan and zoom to animation frames.

The first two are the significant ones; the rest follow if profiling shows a need.

## 11. Testing — FR-5

| Case | Requirement |
| --- | --- |
| Line spans `created_on` → today for an open task | FR-5.3 |
| Line terminates at `completed_on` for a done task | FR-5.3 |
| A point renders per update, at the correct x | FR-5.4 |
| Blocked stretch renders as a distinct segment | FR-4, FR-5.3 |
| Each task uses its own colour | FR-5.5 |
| Hover and tap reveal update text and date | FR-5.6 |
| Points are keyboard-focusable | NFR-2.2 |
| Zoom across all four levels; cursor anchor holds | FR-5.7 |
| Today marker present and correctly placed | FR-5.8 |
| One page versus all pages | FR-5.9 |
| Overview groups by page and collapses | FR-6.5 |
| A task spanning the range edge is clipped, not dropped | §9 |
| Overlapping points collapse with a count | §5 |

Unit tests cover the scale function, segment construction from events, range clipping and tick
intervals — pure logic where a browser adds nothing.
