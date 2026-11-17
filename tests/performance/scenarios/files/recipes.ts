import { assertFileResult } from "./assert";
import { fileFixture } from "./fixture";
import { fileInput } from "./input";
import { verifyFileResult } from "./verify";
import { requireRecord } from "../queries/types";
import type { ScenarioClient } from "../../harness/clients/session";
import type { PreparedSample } from "../../harness/execution/samples";

export async function prepareFile(
    client: ScenarioClient,
    capability: string,
    binding: string,
    origin: string,
    cleanup: (credentials: Readonly<{ namespaceId?: unknown; namespaceKey?: unknown }>, name: string) => Promise<void>,
): Promise<PreparedSample> {
    const state = await fileFixture(client, capability);
    const input = fileInput(state, capability);
    let result: unknown;
    let completed = false;
    return {
        async send() {
            const response = await state.call(capability, binding, input, async (output) => {
                result = output;
                await assertFileResult(state, capability, output);
            });
            completed = response.observation.validated;
            return response.observation;
        },
        verify: () => verifyFileResult(state, capability, result, origin),
        async close() {
            if (state.workspace) {
                if (state.file && !(capability === "workspace.files.delete" && completed)) {
                    await state.fixture("workspace.files.delete", { fileId: state.file.fileId });
                }
            } else if (!(capability === "namespace.delete" && completed)) {
                const credentials =
                    capability === "namespace.create" && completed
                        ? {
                              namespaceId: requireRecord(result).namespaceId,
                              namespaceKey: requireRecord(result).namespaceKey,
                          }
                        : state.credentials;
                if (credentials.namespaceId) {
                    await cleanup(credentials, state.name);
                }
            }
        },
    };
}
