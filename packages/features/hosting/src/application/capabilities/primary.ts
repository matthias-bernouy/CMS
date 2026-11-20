import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import {
    defineCapability,
    hostingErrors,
    hostingBindings,
    authorizeHosting,
    hostingActor,
    projectDomain,
} from "./policy";
import { domainSchema } from "../schemas";

export const electPrimaryDomain = defineCapability({
    id: "instances.set-primary-domain",
    description:
        "Elect an active domain as this instance's public canonical origin. Existing contract callback and Repository identities are preserved.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    input: z.strictObject({
        instanceId: contractString({ minLength: 1, maxLength: 128 }),
        hostname: contractString({ minLength: 1, maxLength: 253 }),
        expectedInstanceRevision: z.int().min(1),
        expectedDomainRevision: z.int().min(1),
    }),
    output: z.strictObject({
        instanceId: contractString({ minLength: 1, maxLength: 128 }),
        origin: contractString({ minLength: 1, maxLength: 2048 }),
        revision: z.int().min(1),
        domain: domainSchema,
    }),
    errors: hostingErrors,
    bindings: hostingBindings("instances.set-primary-domain", true),
    authorize: authorizeHosting,
    docs: ["overview.md"],
    execute: async ({ input, services, context }) => {
        const result = await services.hosting.primaryDomains.elect(hostingActor(context), input);
        return { ...result, domain: projectDomain(result.domain) };
    },
});
