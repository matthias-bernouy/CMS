import { resolveIntegrationDefinitionFile } from "@bernouy/cms-integrations/fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export async function loadIntegrationDefinition<T>(definition: string | URL): Promise<T> {
    const definitionPath = definition instanceof URL ? fileURLToPath(definition) : definition;
    return (await resolveIntegrationDefinitionFile(definitionPath, dirname(definitionPath))) as T;
}
