import { numberData, tileFromEvent } from "../utils";

export class MediaDragController {
    private dragFrom: number | null = null;

    constructor(
        private root: () => ShadowRoot,
        private move: (from: number, to: number) => void,
        private setSuppressClick: (value: boolean) => void,
    ) {}

    start = (event: Event): void => {
        const tile = tileFromEvent(event);
        const index = numberData(tile?.dataset.index);
        if (!tile || index === null) {
            return;
        }
        const dragEvent = event as DragEvent;
        this.dragFrom = index;
        this.setSuppressClick(true);
        tile.toggleAttribute("data-dragging", true);
        dragEvent.dataTransfer?.setData("text/plain", String(index));
        if (dragEvent.dataTransfer) {
            dragEvent.dataTransfer.effectAllowed = "move";
        }
    };

    over = (event: Event): void => {
        if (this.dragFrom === null) {
            return;
        }
        event.preventDefault();
        const dragEvent = event as DragEvent;
        if (dragEvent.dataTransfer) {
            dragEvent.dataTransfer.dropEffect = "move";
        }
        this.markDropTarget(tileFromEvent(event));
    };

    drop = (event: Event): void => {
        if (this.dragFrom === null) {
            return;
        }
        event.preventDefault();
        const to = numberData(tileFromEvent(event)?.dataset.index);
        if (to !== null) {
            this.move(this.dragFrom, to);
        }
        this.clear();
    };

    end = (): void => this.clear();

    private markDropTarget(target: HTMLElement | null): void {
        this.root()
            .querySelectorAll("[data-drop-target]")
            .forEach((tile) => tile.removeAttribute("data-drop-target"));
        if (target && numberData(target.dataset.index) !== this.dragFrom) {
            target.toggleAttribute("data-drop-target", true);
        }
    }

    private clear(): void {
        this.dragFrom = null;
        this.root()
            .querySelectorAll("[data-dragging], [data-drop-target]")
            .forEach((tile) => {
                tile.removeAttribute("data-dragging");
                tile.removeAttribute("data-drop-target");
            });
        window.setTimeout(() => this.setSuppressClick(false), 0);
    }
}
