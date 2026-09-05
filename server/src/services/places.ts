/**
 * Places (DD-23).
 *
 * A place is somewhere you return to — the office, the hardware store, home.
 * Naming it once and attaching many tasks to it is what makes "what can I do
 * while I am here" answerable; free-text coordinates per task cannot answer
 * that, because two tasks at the same place would carry unrelated strings.
 */
import { randomUUID } from 'node:crypto';
import type { CreatePlaceInput, Place, UpdatePlaceInput } from '@tasktracker/shared';
import type { DB } from '../db/index.js';
import * as repo from '../repositories/index.js';
import { NotFound } from './tasks.js';

export function listPlaces(db: DB, userId: string): (Place & { task_count: number })[] {
  const counts = repo.placeTaskCounts(db, userId);
  return repo
    .listPlaces(db, userId)
    .map((place) => ({ ...place, task_count: counts.get(place.id) ?? 0 }));
}

/**
 * Create a place, or return the existing one with that name.
 *
 * Saving "Office" a second time should attach to the first rather than make a
 * near-duplicate — the whole value of places is that they are shared.
 */
export function createPlace(db: DB, userId: string, input: CreatePlaceInput): Place {
  const existing = repo.findPlaceByName(db, userId, input.name);
  if (existing) {
    // Fill in coordinates if the existing place had none and we now have them.
    if (existing.lat === null && input.lat != null && input.lng != null) {
      repo.updatePlace(db, existing.id, { lat: input.lat, lng: input.lng });
      return repo.getPlace(db, userId, existing.id)!;
    }
    return existing;
  }

  const place: Place = {
    id: randomUUID(),
    name: input.name,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    radius_m: input.radius_m ?? 150,
    created_at: new Date().toISOString(),
  };
  repo.insertPlace(db, place, userId);
  return place;
}

export function updatePlace(
  db: DB,
  userId: string,
  placeId: string,
  input: UpdatePlaceInput,
): Place {
  if (!repo.getPlace(db, userId, placeId)) throw new NotFound('place not found');
  repo.updatePlace(db, placeId, input);
  return repo.getPlace(db, userId, placeId)!;
}

/** Soft-delete, detaching it from its tasks so nothing points at a place that
 *  is no longer listed. The tasks themselves are untouched. */
export function deletePlace(db: DB, userId: string, placeId: string): void {
  if (!repo.getPlace(db, userId, placeId)) throw new NotFound('place not found');
  repo.softDeletePlace(db, placeId, new Date().toISOString());
}

/** Metres between two points, by the haversine formula. Used to rank places by
 *  proximity when the browser offers a position. */
export function distanceMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Places within their own radius of a position, nearest first.
 *
 * This is the query the planned "you are at X, these tasks match" panel needs;
 * exposing it now keeps that feature a view rather than a redesign (DD-23).
 */
export function placesNear(
  db: DB,
  userId: string,
  position: { lat: number; lng: number },
): (Place & { distance_m: number })[] {
  return repo
    .listPlaces(db, userId)
    .filter((p): p is Place & { lat: number; lng: number } => p.lat !== null && p.lng !== null)
    .map((place) => ({ ...place, distance_m: Math.round(distanceMetres(position, place)) }))
    .filter((place) => place.distance_m <= place.radius_m)
    .sort((a, b) => a.distance_m - b.distance_m);
}
