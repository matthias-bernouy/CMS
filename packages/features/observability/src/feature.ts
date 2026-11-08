import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapObservabilityError } from "observability/capabilities/mapError";
import { appendLogs } from "observability/capabilities/append";
import { queryLogs } from "observability/capabilities/query";
import { getLogs } from "observability/capabilities/get";
import { aggregateLogs } from "observability/capabilities/aggregate";
export const observabilityFeature = defineFeature({
    contractId: "ulvia/cms.observability",
    name: "CMS Observability",
    description: "Collect and search bounded diagnostic journals for one authenticated CMS instance.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { icon: "activity", categories: ["administration", "observability"] },
    mapError: mapObservabilityError,
    documents: new URL("../docs/", import.meta.url),
    capabilities: [appendLogs, queryLogs, getLogs, aggregateLogs],
});
export type { ObservabilityService, ObservabilityServices } from "observability/interfaces/ObservabilityServices";
