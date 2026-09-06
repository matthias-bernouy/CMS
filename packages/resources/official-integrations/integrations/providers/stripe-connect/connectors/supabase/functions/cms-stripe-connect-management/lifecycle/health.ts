import { localSimulation } from "./simulation.ts";
import { type JsonRecord } from "../core/runtime.ts";
import { listEndpoints } from "./webhooks/v1.ts";
import { listDestinations } from "./webhooks/v2.ts";
import { readSettings } from "./store.ts";
import { validateCredentials } from "./settings.ts";
import { deployment } from "./reconcile.ts";
import { StripeProvisioningClient } from "./webhooks/client.ts";
import { parseStripeWebhookConfiguration } from "./webhooks/configuration.ts";
import { signingBindingMatches } from "./webhooks/signingBindings.ts";

type Check = {
    id: string;
    status: "ok" | "warning" | "error" | "unknown";
    code: string;
    message: string;
    actionIds?: string[];
};
export async function sourceHealth(owner: string, secrets: JsonRecord, generated: JsonRecord) {
    const settings = await readSettings();
    const checks: Check[] = [];
    let secretKey = "";
    try {
        secretKey = validateCredentials(secrets);
    } catch {
        checks.push({
            id: "credentials",
            status: "warning",
            code: "credentials_missing_or_incoherent",
            message: "Select matching Stripe credentials in Connection settings.",
        });
    }
    let simulated = false;
    try {
        simulated = localSimulation(secrets);
    } catch {
        secretKey = "";
        checks.push({
            id: "simulation",
            status: "error",
            code: "unsafe_local_credentials",
            message: "Local simulation requires synthetic provider credentials.",
        });
    }
    if (simulated) {
        checks.push({
            id: "provider",
            status: "ok",
            code: "local_provider_simulation",
            message: "Local provider simulation is active; no Stripe requests were made.",
        });
    }
    if (secretKey && !simulated) {
        const client = new StripeProvisioningClient(secretKey, fetch);
        const configuration = parseStripeWebhookConfiguration(deployment(owner, "health", secretKey));
        try {
            const account = await client.form<{ id?: string }>("/v1/account", "GET", configuration.v1ApiVersion);
            if (!account.id) {
                throw new Error("Stripe account identity could not be verified");
            }
            checks.push({
                id: "credentials",
                status: "ok",
                code: "credentials_validated",
                message: "Stripe accepted the configured credentials.",
            });
            for (const destination of configuration.destinations) {
                const inventory =
                    destination.protocol === "v1"
                        ? await listEndpoints(client, configuration.v1ApiVersion)
                        : await listDestinations(client, configuration.v2ApiVersion);
                const owned = inventory.filter((item) => {
                    const metadata = item.metadata as JsonRecord | undefined;
                    return (
                        metadata?.cmscore_integration === "stripe-connect" &&
                        metadata.cmscore_instance === owner &&
                        metadata.cmscore_destination === destination.name
                    );
                });
                const item = owned[0] as JsonRecord | undefined;
                const url =
                    destination.protocol === "v1" ? item?.url : (item?.webhook_endpoint as JsonRecord | undefined)?.url;
                const events = item?.enabled_events as string[] | undefined;
                const signingValid =
                    typeof item?.id === "string" &&
                    signingBindingMatches(
                        settings.resources,
                        account.id,
                        item.id,
                        destination.name,
                        generated[destination.name],
                    );
                const valid =
                    owned.length === 1 &&
                    item?.status === "enabled" &&
                    url === destination.url &&
                    Array.isArray(events) &&
                    [...new Set(events)].sort().join(",") === destination.enabledEvents.slice().sort().join(",") &&
                    signingValid &&
                    (destination.protocol !== "v1" || item.api_version === configuration.v1ApiVersion) &&
                    (destination.protocol !== "v2" ||
                        (item.event_payload === "thin" &&
                            Array.isArray(item.events_from) &&
                            item.events_from
                                .map((value) =>
                                    value === "@self" ? "self" : value === "@accounts" ? "other_accounts" : value,
                                )
                                .sort()
                                .join(",") === destination.eventsFrom.slice().sort().join(",")));
                checks.push({
                    id: destination.name,
                    status: item && !signingValid ? "error" : valid ? "ok" : "warning",
                    code:
                        item && !signingValid
                            ? "signing_secret_binding_unverified"
                            : valid
                              ? "webhook_verified"
                              : "webhook_configuration_drift",
                    message:
                        item && !signingValid
                            ? "The stored signing secret is not verified for this Stripe account and destination. Restore its matching secret before retrying."
                            : valid
                              ? "Owned destination URL, status and events verified; signing secret matches its stored provisioning receipt."
                              : "Owned webhook configuration needs reconciliation.",
                    actionIds: valid ? [] : ["apply-settings"],
                });
            }
        } catch {
            checks.push({
                id: "provider",
                status: "error",
                code: "provider_verification_failed",
                message: "Stripe could not verify credentials or webhook state. Check access and retry.",
            });
        }
    }
    if (settings.saved_revision !== settings.applied_revision || !settings.applied_revision) {
        checks.push({
            id: "configuration",
            status: "warning",
            code: "settings_not_applied",
            message: "Saved settings have not finished applying.",
            actionIds: ["apply-settings"],
        });
    }
    const status = checks.some((c) => c.status === "error")
        ? "blocked"
        : !secretKey || !settings.applied_revision || settings.saved_revision !== settings.applied_revision
          ? "needs_configuration"
          : checks.some((c) => c.status === "warning")
            ? "degraded"
            : "ready";
    return {
        schemaVersion: 1,
        status,
        checkedAt: new Date().toISOString(),
        configuration: { savedRevision: settings.saved_revision, appliedRevision: settings.applied_revision },
        operation: {
            id: settings.saved_revision ?? "unconfigured",
            status:
                settings.operation === "failed" ? "failed" : settings.operation === "idle" ? "succeeded" : "running",
            steps: [
                {
                    id: "reconcile",
                    status:
                        settings.operation === "applying"
                            ? "running"
                            : settings.operation === "failed"
                              ? "failed"
                              : settings.saved_revision
                                ? "succeeded"
                                : "pending",
                },
                {
                    id: "runtime_sync",
                    status:
                        settings.operation === "pending_sync"
                            ? "running"
                            : settings.applied_revision === settings.saved_revision && settings.applied_revision
                              ? "succeeded"
                              : "pending",
                },
            ],
        },
        checks,
    };
}
