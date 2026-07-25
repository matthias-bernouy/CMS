import {
    IntegrationCompatibilityEvaluator,
    type IntegrationCompatibilityPackage,
} from "@bernouy/cms-integration-registry";
import { parseIntegrationDefinition, type IntegrationDefinition } from "@bernouy/cms-integrations";

export const BASELINE_DIGEST = "a".repeat(64);
export const CANDIDATE_DIGEST = "b".repeat(64);

export function definition(version: string, overrides: Record<string, unknown> = {}): IntegrationDefinition {
    return parseIntegrationDefinition({
        kind: "demo",
        label: "Demo",
        version,
        inputs: [],
        ...overrides,
    });
}

export function packageState(
    version: string,
    overrides: Record<string, unknown> = {},
    packageDigest = version === "1.0.0" ? BASELINE_DIGEST : CANDIDATE_DIGEST,
): IntegrationCompatibilityPackage {
    return { definition: definition(version, overrides), packageDigest };
}

export function evaluator() {
    let sequence = 0;
    return new IntegrationCompatibilityEvaluator({
        identity: { name: "cms-compatibility", version: "1.0.0" },
        now: () => "2026-07-26T10:00:00.000Z",
        createReportId: () => `report-${++sequence}`,
    });
}

export function connector(overrides: Record<string, unknown> = {}) {
    return {
        provider: "supabase",
        root: "connectors/supabase",
        ...overrides,
    };
}

export function schemaContract(columnOverrides: Record<string, unknown> = {}) {
    return {
        namespaces: [
            {
                name: "app",
                relations: [
                    {
                        name: "items",
                        columns: [{ name: "id", type: "bigint", nullable: false, ...columnOverrides }],
                        constraints: [{ kind: "primary-key", name: "items_pkey", columns: ["id"] }],
                    },
                ],
            },
        ],
    };
}

export function functionTemplate(overrides: Record<string, unknown> = {}) {
    return {
        name: "webhook",
        directory: "functions/webhook",
        configPath: "supabase.config.toml",
        compatibility: {
            http: {
                requiredSecrets: [],
                endpoints: [httpEndpoint()],
            },
        },
        ...overrides,
    };
}

export function httpEndpoint(overrides: Record<string, unknown> = {}) {
    return {
        route: "/events",
        method: "POST",
        requiredInputs: [],
        requiredHeaders: [],
        responses: [{ status: "200", body: { type: "object", properties: { id: { type: "string" } } } }],
        ...overrides,
    };
}
