import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { loadIntegrationDefinition } from "../../../../../../../tests/helpers/integrationDefinition";
import { connectEndpoint, definitionUrl, trackingEndpoint, type JsonRecord } from "../runtime.ts";

export async function definition(): Promise<IntegrationDefinition> {
    return loadIntegrationDefinition<IntegrationDefinition>(definitionUrl);
}

export function createShipmentField(createForm: JsonRecord | undefined, fieldId: string): JsonRecord | undefined {
    const sections = [...arrayValue(createForm?.main), ...arrayValue(createForm?.aside)];
    return sections
        .flatMap((section) => arrayValue((section as JsonRecord).fields))
        .find((field): field is JsonRecord => (field as JsonRecord).id === fieldId);
}

export function arrayValue(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

export function integrationAnswers(): Record<string, string> {
    return {
        id: "delivery",
        mondialRelayConnectEndpoint: connectEndpoint,
        mondialRelayConnectLogin: "connect-login",
        mondialRelayConnectPassword: "connect-password",
        mondialRelayConnectCustomerId: "TTMRSDBX",
        mondialRelayTrackingEndpoint: trackingEndpoint,
        mondialRelayTrackingBrand: "BDTEST",
        mondialRelayTrackingPrivateKey: "tracking-private-key",
    };
}
