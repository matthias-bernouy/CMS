import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import type { ClassifiedIntegration } from "cms-cli/push/integrations/classify";
import type { LocalIntegrationImport } from "cms-cli/push/integrations/scan";

type Dependency = NonNullable<NonNullable<LocalIntegrationImport["definition"]>["dependencies"]>[number];

export function integration(
    kind: string,
    dependencies: Dependency[] = [],
    status: ClassifiedIntegration["status"] = "new",
): ClassifiedIntegration {
    return {
        integration: {
            id: kind,
            slug: kind,
            file: `integrations/${kind}.json`,
            request: {
                kind,
                answers: {},
                definition: {
                    kind,
                    label: kind,
                    inputs: [],
                    ...(dependencies.length > 0 ? { dependencies } : {}),
                },
            },
            hash: `hash-${kind}`,
        },
        status,
    };
}

export function kindOnlyIntegration(
    kind: string,
    status: ClassifiedIntegration["status"] = "new",
): ClassifiedIntegration {
    const entry = integration(kind, [], status);
    entry.integration.request = { kind, answers: {} };
    return entry;
}

export function definition(kind: string, dependencies: Dependency[] = []): IntegrationDefinition {
    return {
        kind,
        label: kind,
        inputs: [],
        ...(dependencies.length > 0 ? { dependencies } : {}),
    };
}

export function ids(entries: ClassifiedIntegration[]): string[] {
    return entries.map((entry) => entry.integration.id);
}
