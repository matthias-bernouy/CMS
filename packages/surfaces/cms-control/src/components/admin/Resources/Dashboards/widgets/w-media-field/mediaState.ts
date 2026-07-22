import {
    W_MEDIA_FIELD_ACTION_EVENT,
    type DashboardMediaAction,
    type DashboardMediaActionDetail,
    type DashboardMediaItem,
} from "./types";
import { localId } from "./utils";

export class LocalMediaFiles {
    private readonly urls = new Set<string>();

    create(file: File): DashboardMediaItem {
        const url = URL.createObjectURL(file);
        this.urls.add(url);
        return { id: `local-${localId()}`, url, thumbnailUrl: url, alt: file.name, name: file.name, pending: true };
    }

    revoke(url: string | undefined): void {
        if (!url || !this.urls.has(url)) {
            return;
        }
        URL.revokeObjectURL(url);
        this.urls.delete(url);
    }
}

export function dispatchMediaChange(
    host: HTMLElement,
    action: DashboardMediaAction,
    items: DashboardMediaItem[],
    detail: Partial<DashboardMediaActionDetail>,
): void {
    host.dispatchEvent(
        new CustomEvent(W_MEDIA_FIELD_ACTION_EVENT, {
            bubbles: true,
            composed: true,
            detail: { ...detail, action, value: items },
        }),
    );
    host.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}
