import { capabilitiesFor, contractString, defineFeature, implementFeature, z } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";

export interface Control {
    allowed: boolean;
    fail: boolean;
    invalid: boolean;
    calls: string[];
    onAuthorize?: (signal?: AbortSignal) => Promise<void>;
}
export interface JobServices {
    readonly control: Control;
}
export class Refused extends Error {}
export const contractId = "example/durable-jobs";
export const providerId = "example/job-provider";
const defineCapability = capabilitiesFor<JobServices>();
export function jobFeature(version = "1.0.0") {
    const start = defineCapability({
        id: "start",
        access: "admin",
        behavior: { effect: "command", execution: "operation", idempotency: "keyed", sensitive: false },
        input: z.strictObject({ value: contractString({ maxLength: 16 }) }),
        output: z.strictObject({ marker: contractString({ maxLength: 32 }) }),
        errors: {
            REFUSED: { retryable: false, output: z.strictObject({ message: contractString({ maxLength: 64 }) }) },
        },
        bindings: [
            {
                id: "primary",
                transport: "http",
                method: "POST",
                path: "/jobs",
                input: { body: true },
                response: {
                    successStatuses: [202],
                    contentTypes: ["application/json"],
                    errorStatuses: { REFUSED: 409 },
                },
            },
            {
                id: "review",
                transport: "http",
                method: "POST",
                path: "/review/jobs",
                input: { body: true },
                response: {
                    successStatuses: [202],
                    contentTypes: ["application/json"],
                    errorStatuses: { REFUSED: 422 },
                },
            },
        ],
        authorize: async ({ services, context }) => {
            await services.control.onAuthorize?.(context.signal);
            if (!services.control.allowed) {
                throw new Refused("private-authorization-detail");
            }
        },
        execute: ({ services }) => {
            services.control.calls.push(version);
            if (services.control.fail) {
                throw new Refused("private-business-detail");
            }
            return services.control.invalid ? { marker: version, extra: "invalid-output" } : { marker: version };
        },
    });
    return defineFeature({
        contractId,
        version,
        name: "Durable jobs",
        publisherId: "example",
        capabilities: [start],
        mapError: (cause) =>
            cause instanceof Refused ? { code: "REFUSED", output: { message: "A public refusal." } } : undefined,
    });
}
export async function jobBuild(versions: readonly string[] = ["1.0.0"], inherited = false) {
    const features = versions.map((version) => {
        const parent = jobFeature(version);
        return inherited
            ? defineFeature({
                  contractId: "example/specialized-jobs",
                  version: "2.0.0",
                  publisherId: "example",
                  name: "Specialized jobs",
                  extends: parent,
                  capabilities: [
                      defineCapability({
                          id: "status",
                          access: "public",
                          behavior: { effect: "query", execution: "sync", sensitive: false },
                          input: z.strictObject({}),
                          output: z.boolean(),
                          errors: {},
                          bindings: [
                              {
                                  id: "http",
                                  transport: "http",
                                  method: "GET",
                                  path: "/status",
                                  response: {
                                      successStatuses: [200],
                                      contentTypes: ["application/json"],
                                      errorStatuses: {},
                                  },
                              },
                          ],
                          execute: () => true,
                      }),
                  ],
              })
            : parent;
    });
    return compileProvider({
        providerId,
        name: "Job Provider",
        version: "1.0.0",
        provenance: { publisherId: "example", publishedAt: "2026-01-01T00:00:00Z" },
        buildVersionRange: ">=1.0.0 <2.0.0",
        endpoint: { allowedOrigins: ["https://provider.test"], defaultOrigin: "https://provider.test" },
        configuration: z.strictObject({}),
        credentialSlots: [],
        requires: [],
        implementations: features.map((feature) => implementFeature(feature)),
    });
}
