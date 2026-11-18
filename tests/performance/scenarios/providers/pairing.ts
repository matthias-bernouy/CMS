import { assertCondition, requireRecord } from "../queries/types";
import { assertSelectionUnchanged } from "./oracles";
import { json } from "./context";
import type { ProviderContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";

export async function preparePairing(
    context: ProviderContext,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    let installationId: string | undefined;
    const close = async () => {
        try {
            if (installationId) {
                const current = await context.checked("get-provider-access", { installationId });
                const entry = await context.find();
                if (entry?.status === "disabled") {
                    await context.checked("set-provider-status", {
                        installationId,
                        expectedRevision: current.revision,
                        action: "enable",
                    });
                }
            }
        } finally {
            await context.close();
        }
    };
    try {
        const entry = await context.ensure();
        installationId = String(entry.id);
        const rotating = capability === "pair-provider-connection";
        let access = await context.checked("get-provider-access", { installationId });
        if (!access.paired) {
            await context.checked("pair-provider-connection", { installationId, expectedRevision: access.revision });
            access = await context.checked("get-provider-access", { installationId });
        }
        const credential = await context.credential(installationId);
        assertCondition(requireRecord((await context.append(credential.token)).output).stored === 1);
        const before = await context.snapshot();
        const input = {
            installationId,
            expectedRevision: access.revision,
            ...(rotating ? { rotate: true } : { action: "disable" }),
        };
        return {
            async send() {
                return (
                    await context.call(
                        capability,
                        input,
                        (value) => {
                            const row = requireRecord(value);
                            assertCondition(row.installationId === installationId);
                            assertCondition(
                                rotating
                                    ? row.paired === true
                                    : row.status === "disabled" && row.revision === Number(access.revision) + 1,
                            );
                        },
                        binding,
                    )
                ).observation;
            },
            async verify() {
                const saved = await context.checked("get-provider-access", { installationId });
                assertCondition(
                    saved.paired === true && saved.revision === Number(access.revision) + (rotating ? 2 : 1),
                );
                await context.deniedAppend(credential.token);
                if (rotating) {
                    const fresh = await context.credential(installationId!);
                    assertCondition(fresh.token !== credential.token && fresh.cmsUrl === credential.cmsUrl);
                    assertCondition(requireRecord((await context.append(fresh.token)).output).stored === 1);
                }
                const after = await context.snapshot();
                assertSelectionUnchanged(before, after);
                await context.foreign(capability, { ...input, expectedRevision: saved.revision });
                if (rotating) {
                    const replay = await context.call(capability, input);
                    assertCondition(replay.observation.validated && json(await context.snapshot()) === json(after));
                }
                const stale = await context.call(
                    capability,
                    rotating ? { ...input, expectedRevision: Number(saved.revision) - 1 } : input,
                );
                assertCondition(!stale.observation.validated && stale.observation.status === 409);
                assertCondition(json(await context.snapshot()) === json(after));
            },
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
