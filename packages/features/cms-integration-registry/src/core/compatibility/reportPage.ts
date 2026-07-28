import type { CompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import type {
    IntegrationCompatibilityReportPage,
    IntegrationCompatibilityReportPageRequest,
    ReleaseReportHistory,
} from "../../interfaces/reportStore";
import { IntegrationCompatibilityHistoryCursorError } from "./reportStoreErrors";

export function compatibilityReportPage(
    history: ReleaseReportHistory<CompatibilityReportV2>,
    page: IntegrationCompatibilityReportPageRequest,
): IntegrationCompatibilityReportPage {
    const limit = page.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new IntegrationCompatibilityHistoryCursorError("Compatibility history page limit must be from 1 to 100");
    }
    const root = history.revisions[0];
    if (!root || root.revisionType !== "root") {
        throw new TypeError("Compatibility report history has no root revision");
    }
    const revisions = history.revisions.slice(1);
    const cursorIndex = page.after ? revisions.findIndex((revision) => revision.reportId === page.after) : -1;
    if (page.after && cursorIndex < 0) {
        throw new IntegrationCompatibilityHistoryCursorError("Compatibility history cursor does not exist");
    }
    const offset = cursorIndex + 1;
    const selected = revisions.slice(offset, offset + limit);
    const hasMore = offset + selected.length < revisions.length;
    return Object.freeze({
        root,
        current: history.current,
        currentRevisionId: history.currentRevisionId,
        currentReportDigest: history.currentReportDigest,
        revisions: Object.freeze(selected),
        totalRevisions: revisions.length,
        ...(hasMore ? { nextCursor: selected.at(-1)!.reportId } : {}),
    });
}
