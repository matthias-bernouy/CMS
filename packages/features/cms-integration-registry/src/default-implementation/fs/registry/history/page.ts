import { IntegrationCompatibilityHistoryCursorError } from "../../../../core/compatibility/reportStoreErrors";
import type { IntegrationCompatibilityReportRevision } from "../../../../interfaces/compatibility";
import type {
    IntegrationCompatibilityReportCollection,
    IntegrationCompatibilityReportPage,
    IntegrationCompatibilityReportPageRequest,
} from "../../../../interfaces/reportStore";

export function compatibilityHistoryPage(
    history: IntegrationCompatibilityReportCollection,
    page: IntegrationCompatibilityReportPageRequest,
): IntegrationCompatibilityReportPage {
    const limit = page.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new IntegrationCompatibilityHistoryCursorError("Compatibility history page limit must be from 1 to 100");
    }
    const revisions = history.reports.slice(1) as readonly IntegrationCompatibilityReportRevision[];
    const cursorIndex = page.after ? revisions.findIndex((revision) => revision.id === page.after) : -1;
    if (page.after && cursorIndex < 0) {
        throw new IntegrationCompatibilityHistoryCursorError("Compatibility history cursor does not exist");
    }
    const offset = cursorIndex + 1;
    const selected = revisions.slice(offset, offset + limit);
    const hasMore = offset + selected.length < revisions.length;
    return Object.freeze({
        admission: history.admission,
        current: history.current,
        revisions: Object.freeze(selected),
        totalRevisions: revisions.length,
        ...(hasMore ? { nextCursor: selected.at(-1)!.id } : {}),
    });
}
