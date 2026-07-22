import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";

export const EMPTY_INTEGRATION_CATALOG: IntegrationDefinitionRepository = {
    list: async () => [],
    getIndex: async () => null,
    listVersions: async () => [],
    get: async () => null,
};

export function mergeUnique(primary: readonly string[], secondary: readonly string[] | undefined): string[] {
    return [...new Set([...primary, ...(secondary ?? [])])];
}
