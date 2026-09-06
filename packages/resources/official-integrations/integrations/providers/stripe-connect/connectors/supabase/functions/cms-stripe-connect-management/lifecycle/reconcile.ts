import { localSimulation } from "./simulation.ts";
import { HttpError, type JsonRecord } from "../core/runtime.ts";
import { signingBinding, trustedSigningOutputs } from "./webhooks/signingBindings.ts";
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
    existingResources: JsonRecord[] = [],
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
    const account = await new StripeProvisioningClient(secretKey, fetch).form<{ id?: string }>(
        "/v1/account",
        "GET",
        definitions.v1ApiVersion,
    );
    if (!account.id) {
        throw new HttpError(502, "Stripe account identity could not be verified");
    }
    const result = await new StripeWebhookProvisioner().provision(
        { ...deployment(owner, version, secretKey), operationId },
        trustedSigningOutputs(existingResources, account.id, generated),
    );
    return {
        ...result,
        resources: result.resources.map((resource, index) => {
            const destination = definitions.destinations[index]!.name;
            return {
                ...resource,
                signingSecret: signingBinding(account.id!, resource.id, destination, result.outputs[destination]!),
            };
        }),
    };
}
