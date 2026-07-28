import { resolveRequestSubject } from "@bernouy/cms-auth";
import { abandonPendingIntegrationOperation } from "@bernouy/cms-integrations";
import type { ControlCms } from "cms-control/ControlCms";
import HttpError from "cms-control/core/admin/http/errors/HttpError";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

export async function abandonPendingOperationFromControl(
    cms: ControlCms,
    request: Request,
    integrationId: string,
    body: Record<string, unknown>,
) {
    const subject = await resolveRequestSubject(cms.auth, request).catch(() => null);
    if (subject?.role !== "admin") {
        throw new HttpError(403, "Administrator access is required to abandon a pending integration operation.");
    }
    return await abandonPendingIntegrationOperation({
        installations: cms.integrationInstallations,
        installationId: integrationId,
        expectedOperationId: optionalText(body.expectedOperationId, "expectedOperationId"),
        expectedUpdatedAt: requiredDate(body.expectedUpdatedAt),
        actor: subject.identifier,
        reason: requiredText(body.reason, "reason"),
        confirmation: requiredText(body.confirmation, "confirmation"),
    });
}

function optionalText(value: unknown, name: string): string | undefined {
    return value === undefined ? undefined : requiredText(value, name);
}

function requiredText(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new MissingParam(name);
    }
    return value.trim();
}

function requiredDate(value: unknown): Date {
    if (typeof value !== "string" || !value.trim()) {
        throw new MissingParam("expectedUpdatedAt");
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        throw new InvalidParam("expectedUpdatedAt", "ISO date expected.");
    }
    return date;
}
