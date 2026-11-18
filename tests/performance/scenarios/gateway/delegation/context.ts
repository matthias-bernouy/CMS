import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import { readProviderCredential } from "../../../../integration/instance/providers/credentials";
import { gatewayRoute, assertGatewayScope } from "../context";
import { assertCondition, requireRecord } from "../../queries/types";
import type { GatewayProviderContext } from "../providers/context";

export async function delegationContext(context: GatewayProviderContext) {
    const { gateway } = context;
    const route = gatewayRoute(await gateway.checked("gateway.route.get", { contractId: "ulvia/cms.content" }));
    assertGatewayScope(route, gateway.environment.stack.instanceId);
    const selected = requireRecord(route.selection);
    const local = await readProviderCredential(
        gateway.environment.stack.providerName,
        context.credentialKey,
        String(selected.installationId),
        gateway.environment.stack.instanceId,
    );
    const source = {
        siteId: "default",
        requestId: crypto.randomUUID(),
        installationId: selected.installationId,
        contractId: "ulvia/cms.content",
        version: selected.version,
        digest: selected.digest,
        capabilityId: "delivery.resolve-resource",
        actor: { kind: "anonymous" },
        deadline: 0,
    };
    const targetRoute = gatewayRoute(
        await gateway.checked("gateway.route.get", { contractId: "ulvia/cms.installations" }),
    );
    assertGatewayScope(targetRoute, gateway.environment.stack.instanceId);
    const destination = requireRecord(targetRoute.selection);
    const target = (ticket: string) => ({
        siteId: "default",
        sourceInstallationId: selected.installationId,
        contractId: "ulvia/cms.installations",
        capabilityId: "initialization.entry",
        ticket,
        sourceCredentialFingerprint: providerCredentialFingerprint(local.token),
    });
    let delegation: Readonly<Record<string, unknown>> | undefined;
    let closed = false;
    const capture = (value: unknown) => {
        delegation = requireRecord(requireRecord(value).delegation);
        closed = false;
        assertCondition(
            typeof delegation.ticket === "string" && /^[A-Za-z0-9_-]{43}$/u.test(delegation.ticket),
            "delegation-ticket-shape",
        );
        assertCondition(
            Number.isSafeInteger(delegation.expiresAt) &&
                Number(delegation.expiresAt) > Date.now() &&
                Number(delegation.expiresAt) <= source.deadline,
            "delegation-ticket-deadline",
        );
    };
    const check = (value: unknown) => {
        const row = requireRecord(value);
        const actor = requireRecord(row.actor);
        assertCondition(
            actor.kind === "anonymous" &&
                actor.subjectId === undefined &&
                actor.authorizationRevision === undefined &&
                row.rootRequestId === source.requestId,
            "delegation-actor-and-root-request",
        );
    };
    const issue = async () => {
        capture(await gateway.checked("gateway.delegation.issue", { source }));
    };
    const close = async () => {
        if (delegation && !closed) {
            const row = requireRecord(
                await gateway.checked("gateway.delegation.close", {
                    context: { siteId: source.siteId, ticket: delegation.ticket, requestId: source.requestId },
                }),
            );
            assertCondition(row.accepted === true);
            closed = true;
        }
    };
    const use = async () => {
        const requestId = crypto.randomUUID();
        const issued = requireRecord(
            await gateway.checked("gateway.invocation.issue", {
                requestId,
                installationId: destination.installationId,
                contractId: "ulvia/cms.installations",
                contractVersion: destination.version,
                capabilityId: "initialization.entry",
                sourceInstallationId: selected.installationId,
                sourceCredentialFingerprint: providerCredentialFingerprint(local.token),
                delegatedTicket: delegation!.ticket,
            }),
        );
        assertCondition(typeof issued.token === "string" && issued.instanceId === gateway.environment.stack.instanceId);
        const used = await gateway.call(
            "initialization.entry",
            {},
            (value) => assertCondition(requireRecord(value).pending === false),
            issued.token,
            "ulvia/cms.installations",
            requestId,
        );
        assertCondition(used.observation.validated, "delegation-signed-child-invocation");
    };
    return {
        context,
        source,
        capture,
        check,
        issue,
        use,
        close,
        target: () => target(String(delegation!.ticket)),
        get delegation() {
            return delegation;
        },
        setClosed() {
            closed = true;
        },
    };
}

export type DelegationContext = Awaited<ReturnType<typeof delegationContext>>;
