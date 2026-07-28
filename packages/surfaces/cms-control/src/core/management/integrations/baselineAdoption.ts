import { resolveRequestSubject } from "@bernouy/cms-auth";
import {
    adoptLegacyConnectorBaseline,
    IntegrationInputError,
    IntegrationRuntimeError,
    MissingIntegrationInstallationError,
    resolveUpgradePackage,
} from "@bernouy/cms-integrations";
import type { ControlCms } from "cms-control/ControlCms";
import HttpError from "cms-control/core/admin/http/errors/HttpError";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { definitionForUpgrade } from "./definitions";

export async function adoptLegacyBaselineFromControl(
    cms: ControlCms,
    request: Request,
    integrationId: string,
    body: Record<string, unknown>,
) {
    const subject = await resolveRequestSubject(cms.auth, request).catch(() => null);
    if (subject?.role !== "admin") {
        throw new HttpError(403, "Administrator access is required to adopt a legacy connector baseline.");
    }
    const sourceVersion = requiredText(body.sourceVersion, "sourceVersion");
    const sourcePackageDigest = requiredText(body.sourcePackageDigest, "sourcePackageDigest");
    const connectorKey = requiredText(body.connectorKey, "connectorKey");
    const confirmation = requiredText(body.confirmation, "confirmation");
    const installation = await cms.integrationInstallations.get(integrationId);
    if (!installation) {
        throw new MissingIntegrationInstallationError(integrationId);
    }
    if (installation.definitionVersion !== sourceVersion || installation.packageDigest !== sourcePackageDigest) {
        throw new IntegrationInputError(
            "sourcePackageDigest",
            "request provenance no longer matches the installed package",
        );
    }
    const targetDefinition = await definitionForUpgrade(cms.integrationCatalog, integrationId, body);
    const targetPackage = await resolveUpgradePackage(cms.integrationPackageResolver, installation, targetDefinition);
    if (!targetPackage) {
        throw new IntegrationRuntimeError("integration package resolver is required for baseline adoption", 503);
    }
    return await adoptLegacyConnectorBaseline({
        installations: cms.integrationInstallations,
        installation,
        targetPackage,
        connectorKey,
        actor: subject.identifier,
        confirmation,
        adopters: cms.integrationConnectorBaselineAdopters,
    });
}

function requiredText(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new MissingParam(name);
    }
    return value.trim();
}
