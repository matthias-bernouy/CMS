import { IntegrationInputError } from "../../core/errors";
import type { IntegrationAnswerValue } from "../../interfaces/Integration";
import type { IntegrationProvisionDeployment } from "../../interfaces/IntegrationImport";

export type StripeV1WebhookDestination = {
    protocol: "v1";
    name: string;
    url: string;
    connect: boolean;
    enabledEvents: string[];
};

export type StripeV2WebhookDestination = {
    protocol: "v2";
    name: string;
    url: string;
    enabledEvents: string[];
    eventsFrom: Array<"self" | "other_accounts">;
};

export type StripeWebhookConfiguration = {
    secretKey: string;
    owner: string;
    v1ApiVersion: string;
    v2ApiVersion: string;
    destinations: Array<StripeV1WebhookDestination | StripeV2WebhookDestination>;
};

export function parseStripeWebhookConfiguration(
    deployment: IntegrationProvisionDeployment,
): StripeWebhookConfiguration {
    const value = deployment.configuration;
    const destinations = array(value.destinations, "destinations").map((entry, index) =>
        parseDestination(record(entry, `destinations.${index}`), `destinations.${index}`),
    );
    const names = new Set(destinations.map(({ name }) => name));
    if (names.size !== destinations.length) {
        fail("destinations", "must use unique names");
    }
    const outputNames = new Set(deployment.outputs.map(({ name }) => name));
    if (names.size !== outputNames.size || [...names].some((name) => !outputNames.has(name))) {
        fail("outputs", "must match the configured Stripe destination names");
    }
    return {
        secretKey: string(value.secretKey, "secretKey"),
        owner: string(value.owner, "owner"),
        v1ApiVersion: string(value.v1ApiVersion, "v1ApiVersion"),
        v2ApiVersion: string(value.v2ApiVersion, "v2ApiVersion"),
        destinations,
    };
}

function parseDestination(
    value: Record<string, IntegrationAnswerValue>,
    name: string,
): StripeV1WebhookDestination | StripeV2WebhookDestination {
    const protocol = string(value.protocol, `${name}.protocol`);
    const common = {
        name: string(value.name, `${name}.name`),
        url: webhookUrl(value.url, `${name}.url`),
        enabledEvents: stringArray(value.enabledEvents, `${name}.enabledEvents`),
    };
    if (protocol === "v1") {
        if (typeof value.connect !== "boolean") {
            fail(`${name}.connect`, "must be boolean");
        }
        return { protocol, ...common, connect: value.connect };
    }
    if (protocol === "v2") {
        const eventsFrom = stringArray(value.eventsFrom, `${name}.eventsFrom`);
        if (eventsFrom.some((source) => source !== "self" && source !== "other_accounts")) {
            fail(`${name}.eventsFrom`, 'must contain only "self" or "other_accounts"');
        }
        return { protocol, ...common, eventsFrom: eventsFrom as Array<"self" | "other_accounts"> };
    }
    fail(`${name}.protocol`, 'must be "v1" or "v2"');
}

function webhookUrl(value: IntegrationAnswerValue | undefined, name: string): string {
    const parsed = string(value, name);
    let url: URL;
    try {
        url = new URL(parsed);
    } catch {
        fail(name, "must be an absolute URL");
    }
    if (url.protocol !== "https:") {
        fail(name, "must use HTTPS");
    }
    return url.toString();
}

function stringArray(value: IntegrationAnswerValue | undefined, name: string): string[] {
    const values = array(value, name).map((entry, index) => string(entry, `${name}.${index}`));
    if (!values.length) {
        fail(name, "must not be empty");
    }
    return values;
}

function array(value: IntegrationAnswerValue | undefined, name: string): IntegrationAnswerValue[] {
    if (!Array.isArray(value)) {
        fail(name, "must be an array");
    }
    return value;
}

function record(value: IntegrationAnswerValue, name: string): Record<string, IntegrationAnswerValue> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail(name, "must be an object");
    }
    return value;
}

function string(value: IntegrationAnswerValue | undefined, name: string): string {
    if (typeof value !== "string" || !value.trim()) {
        fail(name, "must be a non-empty string");
    }
    return value.trim();
}

function fail(name: string, message: string): never {
    throw new IntegrationInputError(`provisions.stripe-webhooks.${name}`, message);
}
