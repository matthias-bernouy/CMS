import { docker } from "../../../integration/instance/docker";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";
import { gatewayRoute, assertGatewayScope } from "./context";
import { TEST_SITE_ID } from "../../fixtures/scope";
import type { GatewayContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";

/** Query only the synthetic event's indexed identity; never export business log contents. */
async function persistedAudit(stackId: string, event: Readonly<Record<string, unknown>>) {
    const query = { _id: event.id, ...event };
    const result = await docker([
        "exec",
        `${stackId}-mongo`,
        "mongosh",
        "--quiet",
        "--eval",
        `let count=0;for(const info of db.adminCommand({listDatabases:1}).databases){if(!["admin","config","local"].includes(info.name)){count+=db.getSiblingDB(info.name).getCollection("cms_gateway_command_audit").countDocuments(${JSON.stringify(query)});}}print(JSON.stringify({count}));`,
    ]);
    assertCondition(JSON.parse(result.stdout.trim()).count === 1);
}

export async function prepareGatewayBasic(context: GatewayContext, capability: string): Promise<PreparedSample> {
    const { entry, selections } = await context.readers.provider();
    if (capability === "gateway.route.get") {
        const input = { contractId: context.content.release.contractId };
        const assert = (output: unknown) => {
            const route = gatewayRoute(output);
            const selected = requireRecord(route.selection);
            const installation = requireRecord(requireRecord(route.installation).installation);
            const requested = requireRecord(requireRecord(route.requestedRelease).admission);
            const release = requireRecord(requested.release);
            assertGatewayScope(route, context.environment.stack.instanceId);
            assertCondition(selected.installationId === entry.id);
            assertCondition(installation.id === entry.id && installation.status === "enabled");
            assertCondition(
                release.contractId === input.contractId && release.version === context.content.release.version,
            );
            assertCondition(requested.digest === context.content.release.digest);
            assertCondition(
                selections.some((pin) => pin.contractId === selected.contractId && pin.digest === selected.digest),
            );
        };
        return {
            async send() {
                return (await context.call(capability, input, assert)).observation;
            },
            async verify() {
                await context.unauthorized(capability, input);
                await context.refused(capability, { contractId: "performance/missing-contract" }, [404]);
                assert(await context.checked(capability, input));
            },
        };
    }
    if (capability === "gateway.identity.resolve") {
        const input = { providerId: entry.providerId, subjectId: `performance-subject-${crypto.randomUUID()}` };
        let alias: unknown;
        return {
            async send() {
                return (
                    await context.call(capability, input, (output) => {
                        alias = requireRecord(output).providerSubjectId;
                        assertCondition(typeof alias === "string" && alias.length > 0 && alias !== input.subjectId);
                    })
                ).observation;
            },
            async verify() {
                await context.unauthorized(capability, input);
                assertCondition(requireRecord(await context.checked(capability, input)).providerSubjectId === alias);
                const other = await context.checked(capability, { ...input, providerId: "performance/other-provider" });
                assertCondition(requireRecord(other).providerSubjectId !== alias);
                assertCondition(requireRecord(await context.checked(capability, input)).providerSubjectId === alias);
            },
        };
    }
    const event = {
        id: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        siteId: TEST_SITE_ID,
        installationId: entry.id,
        contractId: context.content.release.contractId,
        capabilityId: "site.get",
        actorKind: "administrator",
        actorSubjectId: context.environment.main.subjectId,
        stage: "completed",
        status: 200,
    };
    const input = { event: canonicalizeIJson(event) };
    return {
        async send() {
            return (
                await context.call(capability, input, (output) =>
                    assertCondition(requireRecord(output).accepted === true),
                )
            ).observation;
        },
        async verify() {
            await context.unauthorized(capability, input);
            await persistedAudit(context.environment.stack.id, event);
            await context.checked(capability, input);
            await persistedAudit(context.environment.stack.id, event);
            await context.refused(capability, { event: "not-json" }, [422]);
            await persistedAudit(context.environment.stack.id, event);
        },
    };
}
