import { localSimulation } from "./simulation.ts";
import { type JsonRecord } from "../core/runtime.ts";
import { StripeWebhookProvisioner } from "./webhooks/StripeWebhookProvisioner.ts";
import { StripeProvisioningClient } from "./webhooks/client.ts";
import definitions from "./webhooks/destinations.json" with { type: "json" };
import type { IntegrationProvisionDeployment } from "./webhooks/contracts.ts";
import { validateCredentials } from "./settings.ts";

export function deployment(owner: string, version: string, secretKey: string): IntegrationProvisionDeployment {
    const base = `${Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "")}/functions/v1`;
    return JSON.parse(
        JSON.stringify({
            integrationKind: "stripe-connect",
            version,
            configuration: {
                ...definitions,
                owner,
                secretKey,
                destinations: definitions.destinations.map((value) => ({ ...value, url: `${base}${value.url}` })),
            },
            outputs: definitions.destinations.map(({ name }) => ({ name })),
        }),
    ) as IntegrationProvisionDeployment;
}
export async function reconcile(
    owner: string,
    version: string,
    secrets: JsonRecord,
    generated: JsonRecord,
    operationId?: string,
) {
    if (localSimulation(secrets)) {
        return {
            outputs: Object.fromEntries(
                definitions.destinations.map(({ name }) => [
                    name,
                    String(generated[name] ?? "").startsWith("whsec_local_")
                        ? String(generated[name])
                        : `whsec_local_${crypto.randomUUID()}`,
                ]),
            ),
            resources: definitions.destinations.map(({ name }) => ({
                type: "simulated_webhook",
                id: `local_${name}`,
                action: "updated" as const,
            })),
            rollback: async () => {},
        };
    }
    const secretKey = validateCredentials(secrets);
    await new StripeProvisioningClient(secretKey, fetch).form("/v1/account", "GET", definitions.v1ApiVersion);
    const existingOutputs = Object.fromEntries(
        Object.entries(generated).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string" && !entry[1].startsWith("pending_"),
        ),
    );
    return new StripeWebhookProvisioner().provision(
        { ...deployment(owner, version, secretKey), operationId },
        { existingOutputs },
    );
}
