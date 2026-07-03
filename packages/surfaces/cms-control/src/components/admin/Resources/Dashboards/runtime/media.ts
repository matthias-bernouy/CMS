import type { DashboardField } from "@bernouy/cms-dashboards";
import { route } from "../api";
import type { DashboardMediaItem } from "../widgets/w-media-field/types";
import { arrayAt, textAt } from "./expressions";

type MediaField = Extract<DashboardField, { type: "media" }>;

export function mediaValue(value: unknown, field: MediaField, sourceId: string): DashboardMediaItem[] {
    return (Array.isArray(value) ? value : arrayAt({ value }, "value")).map(item => ({
        id: textAt(item, field.item.idPath, textAt(item, field.item.urlPath)),
        url: mediaUrl(item, field, sourceId),
        alt: field.item.altPath ? textAt(item, field.item.altPath) : undefined,
    })).filter(item => item.id && item.url);
}

function mediaUrl(item: unknown, field: MediaField, sourceId: string): string {
    const raw = textAt(item, field.item.urlPath);
    if (isRenderableUrl(raw)) return raw;
    const id = textAt(item, field.item.idPath);
    const endpoint = mediaFileEndpoint(field);
    if (!sourceId || !endpoint || !id) return raw;
    return route(`/.cms/sources/${encodeURIComponent(sourceId)}/${encodeURIComponent(endpoint)}?id=${encodeURIComponent(id)}`);
}

function mediaFileEndpoint(field: MediaField): string {
    const upload = field.actions?.upload?.endpoint ?? "";
    if (!upload.startsWith("upload") || upload.length <= "upload".length) return "";
    const rest = upload.slice("upload".length);
    return `${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
}

function isRenderableUrl(value: string): boolean {
    return /^(https?:|blob:|data:|\/)/.test(value);
}
