import type { SiteInitializationService } from "repository/collections/installations/initialization/execution/service";
import type { z } from "zod";
import type { initializationStatusOutputSchema } from "repository/application/installations/schemas/initialization/status";
export type InitializationService = Pick<
    SiteInitializationService,
    "siteId" | "entry" | "status" | "list" | "plan" | "apply"
>;
export type InitializationOperation = Pick<
    z.output<typeof initializationStatusOutputSchema>,
    "operationId" | "operationStatus" | "errorMessage"
>;
