import type { ResourceInitializationOptions } from "@bernouy/resources/initialization";
import type { ResourcePreparationTask } from "./protocol";

type Submit = <Value>(task: ResourcePreparationTask, signal?: AbortSignal) => Promise<Value>;
/** Technical preparation only; authorization, intents, receipts and live persistence remain outside the worker. */
export function resourcePreparationFor(submit: Submit): Pick<ResourceInitializationOptions, "verify" | "preview"> {
    return {
        verify: (bytes, digest, signal) => submit({ kind: "resource-archive", bytes, digest }, signal),
        preview: (archive, execution, system, signal) =>
            submit(
                {
                    kind: "resource-preview",
                    bytes: archive?.bytes ?? null,
                    digest: archive?.digest ?? null,
                    execution,
                    system,
                },
                signal,
            ),
    };
}
