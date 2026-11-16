import { defineCapability, hostingErrors as errors, hostingBindings, authorizeHosting, hostingActor } from "./policy";
import { claimZoneInput, changeZoneInput, zoneSchema, claimZoneOutput, zonePageInput, zonePage } from "../zoneSchemas";
import type { HostingZone } from "hosting/interfaces/zones";

function projectZone(zone: HostingZone) {
    const { hostname, state, revision } = zone;
    return { hostname, state, revision };
}

export const claimZone = defineCapability({
    id: "zones.claim",
    description:
        "Claim a DNS zone for Control and return its dedicated TXT proof. Reclaiming a disabled zone rotates the proof.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    input: claimZoneInput,
    output: claimZoneOutput,
    errors,
    docs: ["zones.md"],
    bindings: hostingBindings("zones.claim", true),
    authorize: authorizeHosting,
    execute: async ({ input, services, context }) => {
        const result = await services.hosting.zones.claim(hostingActor(context), input.hostname);
        return { ...result, zone: projectZone(result.zone) };
    },
});

export const verifyZone = defineCapability({
    id: "zones.verify",
    description: "Verify the exact zone TXT proof at the expected revision to authorize automatic domain admissions.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    input: changeZoneInput,
    output: zoneSchema,
    errors,
    docs: ["zones.md"],
    bindings: hostingBindings("zones.verify", true),
    authorize: authorizeHosting,
    execute: async ({ input, services, context }) =>
        projectZone(await services.hosting.zones.verify(hostingActor(context), input.hostname, input.expectedRevision)),
});

export const listZones = defineCapability({
    id: "zones.list",
    description: "List a bounded page of DNS zones owned by this installation's Control instance.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: zonePageInput,
    output: zonePage,
    errors,
    docs: ["zones.md"],
    bindings: hostingBindings("zones.list", false),
    authorize: authorizeHosting,
    execute: async ({ input, services, context }) => {
        const page = await services.hosting.zones.list(hostingActor(context), input.after, input.limit);
        return { items: page.items.map(projectZone), nextCursor: page.nextCursor };
    },
});

export const disableZone = defineCapability({
    id: "zones.disable",
    description: "Disable this zone's automatic admission grant. Existing domains and instances retain their state.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    input: changeZoneInput,
    output: zoneSchema,
    errors,
    docs: ["zones.md"],
    bindings: hostingBindings("zones.disable", true),
    authorize: authorizeHosting,
    execute: async ({ input, services, context }) =>
        projectZone(
            await services.hosting.zones.disable(hostingActor(context), input.hostname, input.expectedRevision),
        ),
});
