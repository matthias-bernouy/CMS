import type { SiteInitializationService } from "repository/collections/installations/initialization/execution/service";
import type { z } from "zod";
import type { initializationStatusOutputSchema } from "repository/application/installations/schemas/initialization/status";
import type {
    configureRepositoryInputSchema,
    createRepositoryInputSchema,
    repositorySettingsOutputSchema,
} from "repository/application/installations/schemas/initialization/repository";
export interface RepositorySettings {
    readonly siteId: string;
    get(): Promise<z.output<typeof repositorySettingsOutputSchema>>;
    configure(
        input: z.output<typeof configureRepositoryInputSchema>,
    ): Promise<z.output<typeof repositorySettingsOutputSchema>>;
    create(
        input: z.output<typeof createRepositoryInputSchema>,
        administratorId: string,
    ): Promise<z.output<typeof repositorySettingsOutputSchema>>;
}
export type InitializationService = Pick<
    SiteInitializationService,
    "siteId" | "entry" | "status" | "list" | "plan" | "apply"
>;
export type InitializationOperation = Pick<
    z.output<typeof initializationStatusOutputSchema>,
    "operationId" | "operationStatus" | "errorMessage"
>;
