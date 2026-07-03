export type DashboardMediaItem = {
    id: string;
    url: string;
    thumbnailUrl?: string;
    alt?: string;
    name?: string;
    pending?: boolean;
};

export type DashboardMediaAction = "upload" | "replace" | "remove" | "reorder";

export type DashboardMediaActionDetail = {
    action: DashboardMediaAction;
    value: DashboardMediaItem[];
    index?: number;
    from?: number;
    to?: number;
    item?: DashboardMediaItem;
    previousItem?: DashboardMediaItem;
    file?: File;
    files?: File[];
};

export const W_MEDIA_FIELD_ACTION_EVENT = "cms-dashboard-w-media-field:action";
