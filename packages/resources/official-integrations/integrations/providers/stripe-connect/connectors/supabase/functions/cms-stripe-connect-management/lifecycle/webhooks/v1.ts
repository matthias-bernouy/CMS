import { IntegrationRuntimeError } from "./contracts.ts";
import type { IntegrationProvisionResourceResult } from "./contracts.ts";
import { StripeProvisioningClient } from "./client.ts";
import type { StripeV1WebhookDestination } from "./configuration.ts";

type StripeV1Endpoint = {
    id: string;
    api_version?: string | null;
    metadata?: Record<string, string>;
    secret?: string;
    status?: string;
    url?: string;
    enabled_events?: string[];
};

export async function provisionV1Webhook(
    client: StripeProvisioningClient,
    destination: StripeV1WebhookDestination,
    options: {
        integrationKind: string;
        owner: string;
        version: string;
        apiVersion: string;
        existingSecret?: string;
        idempotencyKey: string;
    },
): Promise<{ secret: string; resource: IntegrationProvisionResourceResult; created: boolean }> {
    const owned = (await listEndpoints(client, options.apiVersion)).filter(
        (candidate) =>
            candidate.metadata?.cmscore_integration === options.integrationKind &&
            candidate.metadata?.cmscore_instance === options.owner &&
            candidate.metadata?.cmscore_destination === destination.name,
    );
    if (owned.length > 1) {
        throw new IntegrationRuntimeError("Duplicate owned Stripe webhook destinations", 409);
    }
    const endpoint = owned[0];
    if (endpoint) {
        if (!options.existingSecret) {
            throw missingSecret(destination.name);
        }
        if (endpoint.api_version !== options.apiVersion) {
            throw new IntegrationRuntimeError(
                `Stripe webhook "${destination.name}" uses API version "${endpoint.api_version}" instead of "${options.apiVersion}"`,
                409,
            );
        }
        await client.form(
            `/v1/webhook_endpoints/${encodeURIComponent(endpoint.id)}`,
            "POST",
            options.apiVersion,
            endpointParams(destination, options, false),
        );
        return {
            secret: options.existingSecret,
            resource: { type: "webhook_endpoint", id: endpoint.id, action: "updated" },
            created: false,
        };
    }

    const body = endpointParams(destination, options, true);
    const created = await client.form<StripeV1Endpoint>(
        "/v1/webhook_endpoints",
        "POST",
        options.apiVersion,
        body,
        options.idempotencyKey,
    );
    if (!created.id || !created.secret) {
        throw new IntegrationRuntimeError(`Stripe did not return a signing secret for "${destination.name}"`, 502);
    }
    return {
        secret: created.secret,
        resource: { type: "webhook_endpoint", id: created.id, action: "created" },
        created: true,
    };
}

export async function deleteV1Webhook(client: StripeProvisioningClient, apiVersion: string, id: string): Promise<void> {
    await client.form(`/v1/webhook_endpoints/${encodeURIComponent(id)}`, "DELETE", apiVersion);
}

export async function listEndpoints(client: StripeProvisioningClient, apiVersion: string): Promise<StripeV1Endpoint[]> {
    const endpoints: StripeV1Endpoint[] = [];
    let after = "";
    for (let page = 0; page < 100; page += 1) {
        const query = new URLSearchParams({ limit: "100", ...(after ? { starting_after: after } : {}) });
        const response = await client.form<{ data?: StripeV1Endpoint[]; has_more?: boolean }>(
            `/v1/webhook_endpoints?${query}`,
            "GET",
            apiVersion,
        );
        const data = response.data ?? [];
        endpoints.push(...data);
        if (!response.has_more) {
            return endpoints;
        }
        const next = data.at(-1)?.id;
        if (!next || next === after) {
            break;
        }
        after = next;
    }
    throw new IntegrationRuntimeError("Stripe webhook inventory could not be fully verified", 502);
}

function endpointParams(
    destination: StripeV1WebhookDestination,
    options: { integrationKind: string; owner: string; version: string; apiVersion: string },
    create: boolean,
): URLSearchParams {
    const params = new URLSearchParams({
        url: destination.url,
        description: `CmsCore ${options.integrationKind} ${destination.name}`,
        "metadata[cmscore_integration]": options.integrationKind,
        "metadata[cmscore_instance]": options.owner,
        "metadata[cmscore_destination]": destination.name,
        "metadata[cmscore_version]": options.version,
    });
    for (const event of destination.enabledEvents) {
        params.append("enabled_events[]", event);
    }
    if (create) {
        params.set("connect", String(destination.connect));
        params.set("api_version", options.apiVersion);
    } else {
        params.set("disabled", "false");
    }
    return params;
}

function missingSecret(name: string): IntegrationRuntimeError {
    return new IntegrationRuntimeError(
        `Stripe webhook "${name}" already exists but its signing secret is missing from the CMS secret store`,
        409,
    );
}
