import { InstallationError } from "repository/application/installations/core/errors";

/** Validate the complete result before a mutation; never clip persisted resource counts. */
export function assertResourceCounts(
    items: readonly { textCount: number; themeTokenCount: number }[],
    maximum: number,
) {
    if (items.some((item) => item.textCount > maximum || item.themeTokenCount > maximum)) {
        throw new InstallationError("INVALID_INPUT");
    }
}
