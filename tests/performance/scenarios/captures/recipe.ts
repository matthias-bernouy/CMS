import { createHash } from "node:crypto";
import { scenarioClient } from "../../harness/clients/session";
import { assertCondition, requireRecord } from "../queries/types";
import { captureState } from "./state";
import type { CapabilityInventory, Obligation } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";
import type { PreparedSample } from "../../harness/execution/samples";

export async function prepareCaptureSample(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    contract: string,
    capability: string,
    obligation: Obligation,
): Promise<PreparedSample> {
    const client = scenarioClient(inventory, environment.main);
    const state = await captureState(client, inventory, capability, obligation.variant);
    let image: Readonly<Record<string, unknown>> | undefined;
    const prepareImage = async () => {
        image = await state.content("pages.capture", state.input);
    };
    try {
        if (capability === "captures.image") {
            await prepareImage();
            if (obligation.variant === "invalidation") {
                // A bounded FIFO cache must evict an old artifact; the measured read uses the fresh identity.
                const old = image;
                for (let index = 0; index < 17; index++) {
                    await prepareImage();
                }
                assertCondition(image!.captureId !== old!.captureId);
            }
        }
        let metadata: Readonly<Record<string, unknown>> | undefined;
        return {
            beforeMeasure: capability === "captures.image" && obligation.variant === "cold" ? prepareImage : undefined,
            async send() {
                const result = await client(
                    contract,
                    capability,
                    obligation.binding,
                    capability === "captures.image" ? { captureId: image!.captureId } : state.input,
                    (value) => {
                        if (capability === "captures.image") {
                            assertCondition(value instanceof Uint8Array && value.byteLength === image!.byteLength);
                            assertCondition(
                                `sha256:${createHash("sha256").update(value).digest("hex")}` === image!.digest,
                            );
                        } else {
                            metadata = requireRecord(value);
                            assertCondition(
                                typeof metadata.captureId === "string" &&
                                    Number(metadata.width) > 0 &&
                                    Number(metadata.height) > 0 &&
                                    Array.isArray(metadata.diagnostics),
                            );
                        }
                    },
                );
                return result.observation;
            },
            async verify() {
                if (metadata) {
                    const bytes = await client(
                        "ulvia/cms.content",
                        "captures.image",
                        obligation.binding,
                        { captureId: metadata.captureId },
                        (value) => {
                            assertCondition(
                                value instanceof Uint8Array &&
                                    `sha256:${createHash("sha256").update(value).digest("hex")}` === metadata!.digest,
                            );
                        },
                    );
                    assertCondition(bytes.observation.validated, "capture-image-postcondition");
                }
            },
            close: state.close,
        };
    } catch (error) {
        await state.close();
        throw error;
    }
}
