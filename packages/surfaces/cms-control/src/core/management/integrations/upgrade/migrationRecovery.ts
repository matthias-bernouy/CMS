import { resolveRequestSubject } from "@bernouy/cms-auth";
import { retryAmbiguousMigrationReconciliation } from "@bernouy/cms-integrations";
import type { ControlCms } from "cms-control/ControlCms";
import HttpError from "cms-control/core/admin/http/errors/HttpError";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

export async function retryAmbiguousMigrationFromControl(
    cms: ControlCms,
    request: Request,
    integrationId: string,
    body: Record<string, unknown>,
) {
    const subject = await resolveRequestSubject(cms.auth, request).catch(() => null);
    if (subject?.role !== "admin") {
        throw new HttpError(403, "Administrator access is required to retry an ambiguous migration.");
    }
    return await retryAmbiguousMigrationReconciliation({
        installations: cms.integrationInstallations,
        installationId: integrationId,
        expectedOperationId: requiredText(body.expectedOperationId, "expectedOperationId"),
        expectedRevision: requiredRevision(body.expectedRevision),
        actor: subject.identifier,
        reason: requiredText(body.reason, "reason"),
        confirmation: requiredText(body.confirmation, "confirmation"),
        clock: { now: () => new Date() },
    });
}

function requiredText(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new MissingParam(name);
    }
    return value.trim();
}

function requiredRevision(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1) {
        throw new InvalidParam("expectedRevision", "Positive integer expected.");
    }
    return value as number;
}
