import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import { assertCondition, requireRecord } from "../../queries/types";
import { assertApprovalStateUnchanged } from "../../providers/oracles";
import type { GatewayProviderContext } from "./context";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { Variant } from "../../../capabilities/types";

export async function prepareProviderAuthority(
    context: GatewayProviderContext,
    capability: string,
    variant: Variant,
): Promise<PreparedSample> {
    try {
        const resolving = capability === "gateway.provider.resolve";
        const input = resolving ? { token: context.credential.token } : context.target;
        let replacement: string | undefined;
        if (variant === "invalidation") {
            assertCondition(
                !resolving && requireRecord(await context.gateway.checked(capability, input)).allowed === true,
            );
            replacement = await context.rotate();
        }
        const before = await context.provider.snapshot();
        return {
            async send() {
                return (
                    await context.gateway.call(capability, input, (value) => {
                        const row = requireRecord(value);
                        assertCondition(
                            resolving
                                ? row.installationId === context.source.id
                                : row.allowed === (variant !== "invalidation"),
                            "gateway-provider-authority-result",
                        );
                    })
                ).observation;
            },
            async verify() {
                await context.gateway.unauthorized(capability, input);
                if (resolving) {
                    const missing = requireRecord(
                        await context.gateway.checked(capability, { token: crypto.randomUUID().replaceAll("-", "") }),
                    );
                    assertCondition(missing.installationId === null);
                } else {
                    for (const patch of [
                        { capabilityId: "logs.query" },
                        { version: "99.0.0" },
                        { sourceCredentialFingerprint: "0".repeat(64) },
                        { targetInstallationId: `foreign-${crypto.randomUUID()}` },
                    ]) {
                        const denied = requireRecord(await context.gateway.checked(capability, { ...input, ...patch }));
                        assertCondition(denied.allowed === false, "gateway-provider-undocumented-authority-allowed");
                    }
                }
                const crossed = await context.originalGateway.call(capability, input, (value) => {
                    const row = requireRecord(value);
                    assertCondition(resolving ? row.installationId === null : row.allowed === false);
                });
                assertCondition(crossed.observation.validated, "gateway-provider-cross-instance-isolation");
                if (replacement) {
                    const current = requireRecord(
                        await context.gateway.checked(capability, {
                            ...context.target,
                            sourceCredentialFingerprint: providerCredentialFingerprint(replacement),
                        }),
                    );
                    assertCondition(current.allowed === true);
                    const old = requireRecord(
                        await context.gateway.checked("gateway.provider.resolve", { token: context.credential.token }),
                    );
                    const fresh = requireRecord(
                        await context.gateway.checked("gateway.provider.resolve", { token: replacement }),
                    );
                    assertCondition(old.installationId === null && fresh.installationId === context.source.id);
                }
                assertApprovalStateUnchanged(before, await context.provider.snapshot());
            },
            close: context.close,
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}
