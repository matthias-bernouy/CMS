import { IntegrationRuntimeError } from "../../core/errors";
import type { IntegrationProvisionResourceResult } from "../../interfaces/IntegrationImport";
import { StripeProvisioningClient } from "./client";
import type { StripeV1WebhookDestination } from "./configuration";

type StripeV1Endpoint = {
    id: string;
    api_version?: string | null;
    metadata?: Record<string, string>;
    secret?: string;
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
    const endpoint = (await listEndpoints(client, options.apiVersion)).find(
        (candidate) =>
            candidate.metadata?.cmscore_integration === options.integrationKind &&
            candidate.metadata?.cmscore_instance === options.owner &&
            candidate.metadata?.cmscore_destination === destination.name,
    );
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

async function listEndpoints(client: StripeProvisioningClient, apiVersion: string): Promise<StripeV1Endpoint[]> {
    const response = await client.form<{ data?: StripeV1Endpoint[] }>(
        "/v1/webhook_endpoints?limit=100",
        "GET",
        apiVersion,
    );
    return Array.isArray(response.data) ? response.data : [];
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
