import { defineFeature } from "@bernouy/ulvia-sdk";
import { initializationEntry } from "./capabilities/entry";
import { initializationPlan } from "./capabilities/plan";
import { initializationStatus } from "./capabilities/status";
import { initializationApply } from "./capabilities/apply";
import { mapResourceError } from "./core/policy";
export const resourcesFeature = defineFeature({
    contractId: "ulvia/cms.resources",
    publisherId: "ulvia",
    name: "CMS Resources",
    version: "1.0.0",
    description: "Review and copy base resources into ordinary site content during explicit one-time initialization.",
    catalogue: { icon: "resources", categories: ["administration", "content"] },
    documents: new URL("../../docs/", import.meta.url),
    mapError: mapResourceError,
    capabilities: [initializationEntry, initializationStatus, initializationPlan, initializationApply],
});
export type {
    ResourceServices,
    ResourceInitializationPort,
    ResourceAdministratorPort,
    ResourceOperationState,
    ResourceInitializationStatus,
} from "./interfaces/services";
