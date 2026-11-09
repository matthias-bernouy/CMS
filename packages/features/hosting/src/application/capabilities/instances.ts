import {
    defineCapability,
    hostingErrors as errors,
    hostingBindings,
    authorizeHosting,
    hostingActor,
    projectDomain,
} from "./policy";
import {
    createInstanceInput,
    createInstanceOutput,
    instanceIdInput,
    instanceSchema,
    pageInput,
    instancePage,
} from "../schemas";

export const createInstance = defineCapability({
    id: "instances.create",
    description:
        "Provision an empty CMS instance. Repeat the same requestId and exact input to recover; inspect the returned status before treating provisioning as complete.",
    access: "admin",
    // Natural idempotence is persisted by the lifecycle. Do not journal administrator passwords in SDK receipts.
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    input: createInstanceInput,
    output: createInstanceOutput,
    errors,
    docs: ["overview.md"],
    bindings: hostingBindings("instances.create", true),
    authorize: authorizeHosting,
    execute: async ({ input, services, context }) => {
        const result = await services.hosting.instances.create(hostingActor(context), input);
        return { ...result, domain: projectDomain(result.domain) };
    },
});
export const listInstances = defineCapability({
    id: "instances.list",
    description: "Read a bounded page of hosted CMS instances from Control.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: pageInput,
    output: instancePage,
    errors,
    docs: ["overview.md"],
    bindings: hostingBindings("instances.list", false),
    authorize: authorizeHosting,
    execute: ({ input, services, context }) =>
        services.hosting.instances.list(hostingActor(context), input.after, input.limit),
});
export const getInstance = defineCapability({
    id: "instances.get",
    description: "Read hosting readiness and revision for one CMS instance.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: instanceIdInput,
    output: instanceSchema,
    errors,
    docs: ["overview.md"],
    bindings: hostingBindings("instances.get", false),
    authorize: authorizeHosting,
    execute: ({ input, services, context }) => services.hosting.instances.get(hostingActor(context), input.instanceId),
});
export const disableInstance = defineCapability({
    id: "instances.disable",
    description: "Disable a hosted CMS instance. Control is protected from this operation.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    input: instanceIdInput,
    output: instanceSchema,
    errors,
    docs: ["overview.md"],
    bindings: hostingBindings("instances.disable", true),
    authorize: authorizeHosting,
    execute: ({ input, services, context }) =>
        services.hosting.instances.disable(hostingActor(context), input.instanceId),
});
