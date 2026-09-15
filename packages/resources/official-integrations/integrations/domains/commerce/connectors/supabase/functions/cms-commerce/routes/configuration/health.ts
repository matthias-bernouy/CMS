import { isRecord } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { consentRequest } from "../order/payment/consent/client.ts";
import { getSettings } from "./index.ts";

type HealthStatus = "ready" | "degraded" | "blocked";
type HealthResult = { status: HealthStatus; checks: JsonRecord[] };

export async function commerceHealth(): Promise<JsonRecord> {
    const [configuration, database, consent] = await Promise.all([
        configurationHealth(),
        databaseHealth(),
        consentHealth(),
    ]);
    return {
        schemaVersion: 1,
        status: combinedStatus(configuration.status, database.status, consent.status),
        checkedAt: new Date().toISOString(),
        configuration: configuration.configuration,
        checks: [...configuration.checks, ...database.checks, ...consent.checks],
    };
}

async function configurationHealth(): Promise<HealthResult & { configuration: JsonRecord }> {
    try {
        const settingsResponse = await getSettings();
        const settings = await settingsResponse.json();
        if (!isRecord(settings) || settings.version === undefined || settings.version === null) {
            throw new Error("invalid settings");
        }
        const revision = String(settings.version);
        return {
            status: "ready",
            configuration: { savedRevision: revision, appliedRevision: revision },
            checks: [{ id: "commerceConfiguration", status: "ok", code: "commerce_configuration_available" }],
        };
    } catch {
        return {
            status: "blocked",
            configuration: { savedRevision: null, appliedRevision: null },
            checks: [
                {
                    id: "commerceConfiguration",
                    status: "error",
                    code: "commerce_configuration_unavailable",
                    message: "The active Commerce configuration could not be loaded",
                },
            ],
        };
    }
}

async function databaseHealth(): Promise<HealthResult> {
    try {
        const value = await rpc("application_health", {});
        if (!isRecord(value) || !isHealthStatus(value.status) || !Array.isArray(value.checks)) {
            throw new Error("invalid health response");
        }
        const checks = value.checks.filter(isRecord);
        if (checks.length !== value.checks.length) {
            throw new Error("invalid health checks");
        }
        return { status: value.status, checks };
    } catch {
        return {
            status: "blocked",
            checks: [
                {
                    id: "database",
                    status: "error",
                    code: "commerce_database_unavailable",
                    message: "Commerce database health could not be verified",
                },
            ],
        };
    }
}

async function consentHealth(): Promise<HealthResult> {
    try {
        const [service, context] = await Promise.all([
            consentRequest("/management", { operation: "health", input: {} }),
            consentRequest("/admin/context?context=buyer_checkout"),
        ]);
        const serviceReady = service.schemaVersion === 1 && service.status === "ready";
        const documents = Array.isArray(context.documents) ? context.documents.filter(isRecord) : [];
        const buyerCheckoutReady =
            context.contextKey === "buyer_checkout" &&
            context.enabled === true &&
            documents.some(
                (document) =>
                    document.enabled === true &&
                    typeof document.versionId === "string" &&
                    document.versionId.length > 0 &&
                    typeof document.contentHash === "string" &&
                    /^[a-f0-9]{64}$/.test(document.contentHash) &&
                    typeof document.publishedSnapshotUrl === "string" &&
                    /^https?:\/\//.test(document.publishedSnapshotUrl),
            );
        return {
            status: !buyerCheckoutReady ? "blocked" : serviceReady ? "ready" : "degraded",
            checks: [
                {
                    id: "consentService",
                    status: serviceReady ? "ok" : "warning",
                    code: serviceReady ? "consent_available" : "consent_policy_health_degraded",
                },
                {
                    id: "buyerCheckoutConsent",
                    status: buyerCheckoutReady ? "ok" : "error",
                    code: buyerCheckoutReady
                        ? "buyer_checkout_consent_ready"
                        : "buyer_checkout_consent_documents_missing",
                    message: buyerCheckoutReady
                        ? `${documents.length} consent documents are configured for buyer checkout`
                        : "Enable buyer_checkout and publish at least one current consent document",
                },
            ],
        };
    } catch {
        return {
            status: "blocked",
            checks: [
                {
                    id: "consentService",
                    status: "error",
                    code: "checkout_consent_unavailable",
                    message: "The Consent dependency could not be reached",
                },
                {
                    id: "buyerCheckoutConsent",
                    status: "error",
                    code: "buyer_checkout_consent_unverified",
                    message: "Buyer checkout consent documents could not be verified",
                },
            ],
        };
    }
}

function combinedStatus(...statuses: HealthStatus[]): HealthStatus {
    if (statuses.includes("blocked")) {
        return "blocked";
    }
    return statuses.includes("degraded") ? "degraded" : "ready";
}

function isHealthStatus(value: unknown): value is HealthStatus {
    return value === "ready" || value === "degraded" || value === "blocked";
}
