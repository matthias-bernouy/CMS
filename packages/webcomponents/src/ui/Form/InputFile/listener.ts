import { updateFileValue } from './domain/value';

export const handleDragOver = (host: HTMLElement, e: Event) => {
    e.preventDefault();
    if (host.hasAttribute('disabled')) return;
    host.toggleAttribute('dragging', true);
};

export const handleDragLeave = (host: HTMLElement, e: Event) => {
    e.preventDefault();
    host.toggleAttribute('dragging', false);
};

export const handleDrop = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    preview: HTMLElement | null,
    liveRegion: HTMLElement | null,
    internals: ElementInternals,
    e: Event,
) => {
    const dragEvent = e as DragEvent;
    dragEvent.preventDefault();
    host.removeAttribute('dragging');
    if (host.hasAttribute('disabled')) return;
    if (dragEvent.dataTransfer?.files && input) {
        input.files = dragEvent.dataTransfer.files;
        updateFileValue(host, input, preview, liveRegion, internals);
    }
};
