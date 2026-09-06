import { IntegrationRuntimeError } from "./contracts.ts";
import type { IntegrationProvisionResourceResult } from "./contracts.ts";
import { StripeProvisioningClient } from "./client.ts";
import type { StripeV2WebhookDestination } from "./configuration.ts";

type StripeV2Destination = {
    id: string;
    event_payload?: string;
    events_from?: string[];
    metadata?: Record<string, string> | null;
    status?: string;
    webhook_endpoint?: { signing_secret?: string | null; url?: string };
    enabled_events?: string[];
};

export async function provisionV2Webhook(
    client: StripeProvisioningClient,
    destination: StripeV2WebhookDestination,
    options: {
        integrationKind: string;
        owner: string;
        version: string;
        apiVersion: string;
        existingSecret?: string;
        existingResourceId?: string;
        idempotencyKey: string;
    },
): Promise<{ secret: string; resource: IntegrationProvisionResourceResult; created: boolean }> {
    const owned = (await listDestinations(client, options.apiVersion)).filter(
        (candidate) =>
            candidate.metadata?.cmscore_integration === options.integrationKind &&
            candidate.metadata?.cmscore_instance === options.owner &&
            candidate.metadata?.cmscore_destination === destination.name,
    );
    if (owned.length > 1) {
        throw new IntegrationRuntimeError("Duplicate owned Stripe event destinations", 409);
    }
    const existing = owned[0];
    if (existing) {
        if (!options.existingSecret || options.existingResourceId !== existing.id) {
            throw new IntegrationRuntimeError(
                `Stripe event destination "${destination.name}" already exists but its signing secret is missing or does not match this endpoint`,
                409,
            );
        }
        assertImmutableConfiguration(existing, destination);
        await client.json(
            `/v2/core/event_destinations/${encodeURIComponent(existing.id)}`,
            "POST",
            options.apiVersion,
            updateBody(destination, options),
        );
        if (existing.status !== "enabled") {
            await client.json(
                `/v2/core/event_destinations/${encodeURIComponent(existing.id)}/enable`,
                "POST",
                options.apiVersion,
            );
        }
        return {
            secret: options.existingSecret,
            resource: { type: "event_destination", id: existing.id, action: "updated" },
            created: false,
        };
    }

    const created = await client.json<StripeV2Destination>(
        "/v2/core/event_destinations",
        "POST",
        options.apiVersion,
        createBody(destination, options),
        options.idempotencyKey,
    );
    const secret = created.webhook_endpoint?.signing_secret;
    if (!created.id || !secret) {
        throw new IntegrationRuntimeError(`Stripe did not return a signing secret for "${destination.name}"`, 502);
    }
    return {
        secret,
        resource: { type: "event_destination", id: created.id, action: "created" },
        created: true,
    };
}

export async function deleteV2Webhook(client: StripeProvisioningClient, apiVersion: string, id: string): Promise<void> {
    await client.json(`/v2/core/event_destinations/${encodeURIComponent(id)}`, "DELETE", apiVersion);
}

export async function listDestinations(
    client: StripeProvisioningClient,
    apiVersion: string,
): Promise<StripeV2Destination[]> {
    const destinations: StripeV2Destination[] = [];
    let path = "/v2/core/event_destinations?limit=100&include[0]=webhook_endpoint.url";
    const seen = new Set<string>();
    for (let page = 0; page < 100; page += 1) {
        if (seen.has(path) || !path.startsWith("/v2/core/event_destinations?")) {
            break;
        }
        seen.add(path);
        const response = await client.json<{ data?: StripeV2Destination[]; next_page_url?: string | null }>(
            path,
            "GET",
            apiVersion,
        );
        destinations.push(...(response.data ?? []));
        if (!response.next_page_url) {
            return destinations;
        }
        const next = new URL(response.next_page_url, "https://api.stripe.com");
        if (next.origin !== "https://api.stripe.com") {
            break;
        }
        path = `${next.pathname}${next.search}`;
    }
    throw new IntegrationRuntimeError("Stripe destination inventory could not be fully verified", 502);
}

function createBody(
    destination: StripeV2WebhookDestination,
    options: { integrationKind: string; owner: string; version: string },
): Record<string, unknown> {
    return {
        ...updateBody(destination, options),
        type: "webhook_endpoint",
        event_payload: "thin",
        events_from: destination.eventsFrom,
        include: ["webhook_endpoint.url", "webhook_endpoint.signing_secret"],
    };
}

function updateBody(
    destination: StripeV2WebhookDestination,
    options: { integrationKind: string; owner: string; version: string },
): Record<string, unknown> {
    return {
        name: `CmsCore ${options.integrationKind} ${destination.name}`,
        description: `Managed by CmsCore integration ${options.integrationKind}`,
        enabled_events: destination.enabledEvents,
        webhook_endpoint: { url: destination.url },
        metadata: {
            cmscore_integration: options.integrationKind,
            cmscore_instance: options.owner,
            cmscore_destination: destination.name,
            cmscore_version: options.version,
        },
        include: ["webhook_endpoint.url"],
    };
}

function assertImmutableConfiguration(existing: StripeV2Destination, destination: StripeV2WebhookDestination): void {
    const eventsFrom = normalizedEventSources(existing.events_from ?? []);
    const expected = normalizedEventSources(destination.eventsFrom);
    if (existing.event_payload !== "thin" || eventsFrom !== expected) {
        throw new IntegrationRuntimeError(
            `Stripe event destination "${destination.name}" has incompatible payload or event-source settings`,
            409,
        );
    }
}

function normalizedEventSources(sources: string[]): string {
    return sources
        .map((source) => {
            if (source === "@self") {
                return "self";
            }
            if (source === "@accounts") {
                return "other_accounts";
            }
            return source;
        })
        .sort()
        .join(",");
}
