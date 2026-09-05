import { type Place, type TaskStatus, type TaskWithChildren } from '@tasktracker/shared';
import { type PlaceWithCount } from '../../components/PlacePicker.js';
interface Props {
    task: TaskWithChildren;
    pageName?: string;
    places: PlaceWithCount[];
    onCreatePlace: (name: string, coords?: {
        lat: number;
        lng: number;
    }) => Promise<Place>;
    onClose: () => void;
    onUpdate: (input: Record<string, unknown>) => void;
    onStatusChange: (status: TaskStatus, occurred_on?: string) => void;
    onAddUpdate: (body: string, occurred_on: string, status?: TaskStatus) => void;
    onEditUpdate: (id: string, input: {
        body?: string;
        occurred_on?: string;
    }) => void;
    onDeleteUpdate: (id: string) => void;
    onEditStatusEvent: (id: string, occurred_on: string) => void;
}
export declare function TaskSheet({ task, pageName, places, onCreatePlace, onClose, onUpdate, onStatusChange, onAddUpdate, onEditUpdate, onDeleteUpdate, onEditStatusEvent, }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=TaskSheet.d.ts.map