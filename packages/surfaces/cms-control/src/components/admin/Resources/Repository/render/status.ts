import type { RepositoryStatusView } from "../contracts/types";
import { labelledValue } from "./dom";

export function renderRepositoryStatus(target: HTMLElement, status: RepositoryStatusView): void {
    const values = [
        labelledValue("Health", status.health),
        labelledValue("Ready", status.ready ? "Yes" : "No"),
        labelledValue("Integrations", String(status.integrations)),
        labelledValue("Versions", String(status.versions)),
        labelledValue("Diagnostics", String(status.diagnostics)),
        labelledValue("Quarantined", String(status.quarantined)),
        labelledValue("Recovery events", String(status.recoveryDiagnostics)),
    ];
    if (status.metrics) {
        const operations = status.metrics.operations;
        values.push(
            labelledValue("Publications", operationSummary(operations.publication)),
            labelledValue("Stable promotions", operationSummary(operations.stablePromotion)),
            labelledValue("Compatibility reevaluations", operationSummary(operations.compatibilityReevaluation)),
            labelledValue("Compatibility warnings", String(status.metrics.compatibility.warnings)),
            labelledValue(
                "Package traffic",
                `${status.metrics.publicPackages.packagesServed} downloads / ${formatBytes(
                    String(status.metrics.publicPackages.packageBytes),
                )}`,
            ),
            labelledValue("Rate-limit rejections", String(status.metrics.publicPackages.rateLimitRejections)),
            labelledValue(
                "Repository reads",
                `${status.metrics.repositoryReads.succeeded}/${status.metrics.repositoryReads.total} succeeded, ${status.metrics.repositoryReads.notFound} not found, ${status.metrics.repositoryReads.rejected} rejected, ${status.metrics.repositoryReads.failed} failed, max ${status.metrics.repositoryReads.maximumDurationMs} ms`,
            ),
            labelledValue("Registry capacity", filesystemSummary(status.metrics.filesystem)),
        );
    }
    target.replaceChildren(...values);
}

function operationSummary(value: {
    attempted: number;
    succeeded: number;
    rejected: number;
    failed: number;
    maximumDurationMs: number;
}): string {
    return `${value.succeeded}/${value.attempted} succeeded, ${value.rejected} rejected, ${value.failed} failed, max ${value.maximumDurationMs} ms`;
}

function filesystemSummary(filesystem: NonNullable<RepositoryStatusView["metrics"]>["filesystem"]): string {
    return filesystem.status === "unavailable"
        ? "Unavailable"
        : `${formatBytes(filesystem.availableBytes)} available / ${formatBytes(filesystem.totalBytes)} (${(
              filesystem.usedBasisPoints / 100
          ).toFixed(2)}% used)`;
}

function formatBytes(decimal: string): string {
    const bytes = BigInt(decimal);
    const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
    let unit = 0;
    let divisor = 1n;
    while (unit < units.length - 1 && bytes >= divisor * 1_024n) {
        divisor *= 1_024n;
        unit += 1;
    }
    if (unit === 0) {
        return `${bytes} B`;
    }
    const tenths = (bytes * 10n) / divisor;
    return `${tenths / 10n}.${tenths % 10n} ${units[unit]}`;
}
