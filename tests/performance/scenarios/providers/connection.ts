import { assertCondition, requireRecord } from "../queries/types";
import { assertPreview, assertSelectionUnchanged, assertProviderStateUnchanged } from "./oracles";
import { json } from "./context";
import type { ProviderContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";

export async function prepareConnection(
    context: ProviderContext,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    try {
        const previous = await context.find();
        const input = context.previewInput(previous);
        const previewing = capability === "preview-provider-connection";
        const review = previewing
            ? undefined
            : assertPreview(
                  await context.checked("preview-provider-connection", input),
                  context.peer,
                  Boolean(previous),
              );
        const before = await context.snapshot();
        let output: Readonly<Record<string, unknown>> | undefined;
        return {
            async send() {
                return (
                    await context.call(
                        capability,
                        previewing ? input : { ticket: review!.ticket },
                        (value) => {
                            output = previewing
                                ? assertPreview(value, context.peer, Boolean(previous))
                                : requireRecord(value);
                            if (!previewing) {
                                assertCondition(
                                    output.providerId === context.peer.report.providerId && output.observed === true,
                                );
                                assertCondition(output.operation === (previous ? "reconnect" : "connect"));
                                assertCondition(
                                    typeof output.installationId === "string" &&
                                        (!previous || output.installationId === previous.id),
                                );
                            }
                        },
                        binding,
                    )
                ).observation;
            },
            async verify() {
                if (previewing) {
                    assertProviderStateUnchanged(before, await context.snapshot());
                    await context.foreign("approve-provider-connection", { ticket: output!.ticket });
                    assertProviderStateUnchanged(before, await context.snapshot());
                } else {
                    const saved = await context.find();
                    assertCondition(saved && saved.id === output!.installationId && saved.status === "enabled");
                    // Approval and pairing each write a mutation revision and a separate observation revision.
                    assertCondition(
                        saved.revision === (previous ? Number(previous.revision) + 4 : 4),
                        "provider-approval-durable-revision",
                    );
                    assertCondition(
                        saved.endpoint === context.peer.endpoint &&
                            saved.manifestVersion === context.peer.manifest.version,
                    );
                    const after = await context.snapshot();
                    assertSelectionUnchanged(before, after);
                    const replay = await context.checked(capability, { ticket: review!.ticket });
                    assertCondition(json(replay) === json(output), "provider-approval-replay-changed-result");
                    assertProviderStateUnchanged(after, await context.snapshot());
                    await context.foreign(capability, { ticket: review!.ticket });
                    assertProviderStateUnchanged(after, await context.snapshot());
                }
            },
            close: context.close,
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}
