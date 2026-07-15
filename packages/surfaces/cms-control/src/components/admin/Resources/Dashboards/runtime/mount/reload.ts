export function detailReloadEvent(sourceId: string, dashboardId: string, collection: string, row: string): string {
    return `cms-dashboard:${encodePart(sourceId)}:${encodePart(dashboardId)}:${encodePart(collection)}:${encodePart(row || "new")}:reload`;
}

function encodePart(value: string): string { return encodeURIComponent(value); }
