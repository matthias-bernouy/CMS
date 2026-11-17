import { ClientFailure } from "../../harness/clients/failure";
import type { ScenarioClient } from "../../harness/clients/session";

export const FILE_CAPABILITIES = [
    "files.delete",
    "files.get",
    "files.list",
    "files.make-private",
    "files.publish",
    "files.read",
    "files.sign",
    "files.update",
    "namespace.create",
    "namespace.delete",
    "namespace.get",
    "namespace.keys.create",
    "namespace.keys.revoke",
    "namespace.keys.rotate",
    "representations.list",
    "representations.read",
    "representations.sign",
    "upload.create",
    "upload.write",
    "upload.complete",
    "workspace.get",
    "workspace.files.delete",
    "workspace.files.set-visibility",
    "workspace.files.sign",
    "workspace.files.update",
    "workspace.upload.create",
    "workspace.upload.complete",
] as const;

export function fileCalls(client: ScenarioClient) {
    const call = (
        capability: string,
        binding: string,
        input: Readonly<Record<string, unknown>>,
        assert?: (output: unknown) => void | Promise<void>,
    ) => client("ulvia/cms.files", capability, binding, input, assert);
    const fixture = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(capability, "http", input);
        if (!result.observation.validated) {
            throw new ClientFailure(`fixture-${capability}-${result.observation.failure ?? "invalid-result"}`);
        }
        return result.output;
    };
    return { call, fixture };
}

export type FileCalls = ReturnType<typeof fileCalls>;
