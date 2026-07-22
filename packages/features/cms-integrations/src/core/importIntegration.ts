import { findIntegration } from "./definitions/catalog";
import { IntegrationInputError } from "./errors";
import { importDeclarativeIntegration } from "./import/declarative";
import type { IntegrationDefinition } from "../interfaces/Integration";
import type {
    IntegrationImportDeps,
    IntegrationImportDto,
    IntegrationImportResult,
} from "../interfaces/IntegrationImport";

export async function importIntegration(
    deps: IntegrationImportDeps,
    dto: IntegrationImportDto,
    siteIntegrations: IntegrationDefinition[] = [],
): Promise<IntegrationImportResult> {
    const definition = findIntegration(dto.kind, siteIntegrations);
    if (!definition) {
        throw new IntegrationInputError("kind", `unknown integration "${dto.kind}"`);
    }

    return importDeclarativeIntegration(deps, definition, dto.answers, dto.options);
}
