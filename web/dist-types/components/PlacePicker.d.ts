import type { Place } from '@tasktracker/shared';
export interface PlaceWithCount extends Place {
    task_count: number;
}
interface Props {
    places: PlaceWithCount[];
    selectedId: string | null;
    onSelect: (placeId: string | null) => void;
    onCreate: (name: string, coords?: {
        lat: number;
        lng: number;
    }) => Promise<Place> | void;
}
export declare function PlacePicker({ places, selectedId, onSelect, onCreate }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=PlacePicker.d.ts.map