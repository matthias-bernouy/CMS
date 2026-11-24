import { SchemaResolutionError } from "@bernouy/ulvia-contracts/resolution";
import { defineFeature } from "@bernouy/ulvia-sdk";
import { EventsError } from "cms-events/core/errors";
import * as definitions from "cms-events/application/definitions";
import * as initiators from "cms-events/application/initiators";
import * as deliveries from "cms-events/application/deliveries";
import * as subscriptions from "cms-events/application/subscriptions";
import { publish } from "cms-events/application/publications";
export const eventsFeature = defineFeature({
    contractId: "ulvia/cms.events",
    publisherId: "ulvia",
    version: "1.0.0",
    name: "CMS Events",
    description: "Contract-defined typed domain events, authorized publication and durable asynchronous subscriptions.",
    catalogue: { icon: "event", categories: ["administration", "automation"] },
    documents: new URL("../docs/", import.meta.url),
    capabilities: [
        definitions.resolve,
        definitions.get,
        definitions.list,
        publish,
        initiators.capture,
        initiators.resolve,
        deliveries.list,
        subscriptions.create,
        subscriptions.get,
        subscriptions.list,
        subscriptions.update,
        subscriptions.remove,
    ],
    mapError: (error, capability) =>
        error instanceof SchemaResolutionError && error.code === "SCHEMA_VERSION_CONFLICT"
            ? {
                  code: "SCHEMA_VERSION_CONFLICT",
                  output: { message: "The schema changed without a new resource version." },
              }
            : error instanceof SchemaResolutionError && error.code === "INVALID_SELECTOR"
              ? { code: "INVALID_INPUT", output: { message: "The event schema selector is invalid." } }
              : error instanceof EventsError
                ? {
                      code: Object.hasOwn(capability.errors, error.code) ? error.code : "CORE_UNAVAILABLE",
                      output: { message: "The event request was refused." },
                  }
                : undefined,
});
export type { EventServices } from "cms-events/interfaces/services";
