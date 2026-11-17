import { randomUUID } from "node:crypto";
import { requireRecord } from "../queries/types";
import type { ScenarioClient } from "../../harness/clients/session";
import { ClientFailure } from "../../harness/clients/failure";

export const SECRET_CAPABILITIES = [
    "namespace.create",
    "namespace.get",
    "namespace.delete",
    "namespace.keys.create",
    "namespace.keys.rotate",
    "namespace.keys.revoke",
    "secrets.create",
    "secrets.get-metadata",
    "secrets.get-metadata-by-name",
    "secrets.list",
    "secrets.resolve",
    "secrets.rotate",
    "secrets.delete",
] as const;

export function secretCalls(client: ScenarioClient) {
    const call = (capability: string, input: Readonly<Record<string, unknown>>, assert?: (output: unknown) => void) =>
        client("ulvia/cms.secrets", capability, "http", input, assert);
    const fixture = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(capability, input);
        if (!result.observation.validated) {
            throw new ClientFailure(`fixture-${capability}-${result.observation.failure ?? "invalid-result"}`);
        }
        return result.output;
    };
    return { call, fixture };
}

export async function secretFixture(client: ScenarioClient, capability: string) {
    const calls = secretCalls(client);
    const name = `performance-${randomUUID()}`;
    const value = `fixture-value-${randomUUID()}`;
    const rotated = `rotated-fixture-${randomUUID()}`;
    const namespace =
        capability === "namespace.create" ? null : requireRecord(await calls.fixture("namespace.create", { name }));
    const credentials = namespace ? { namespaceId: namespace.namespaceId, namespaceKey: namespace.namespaceKey } : {};
    const key = ["namespace.keys.rotate", "namespace.keys.revoke"].includes(capability)
        ? requireRecord(
              await calls.fixture("namespace.keys.create", {
                  ...credentials,
                  permissions: ["namespace.manage", "secrets.metadata.read", "secrets.resolve"],
              }),
          )
        : null;
    const secret =
        capability.startsWith("secrets.") && capability !== "secrets.create"
            ? requireRecord(await calls.fixture("secrets.create", { ...credentials, name, value }))
            : null;
    const input =
        capability === "namespace.create"
            ? { name }
            : {
                  ...credentials,
                  ...(capability === "namespace.keys.create"
                      ? { permissions: ["namespace.manage", "secrets.metadata.read", "secrets.resolve"] }
                      : {}),
                  ...(key ? { keyId: key.keyId } : {}),
                  ...(capability === "secrets.create" ? { name, value } : {}),
                  ...(capability === "secrets.get-metadata-by-name" ? { name } : {}),
                  ...(secret && capability !== "secrets.get-metadata-by-name" && capability !== "secrets.list"
                      ? { secretId: secret.secretId }
                      : {}),
                  ...(["secrets.rotate", "secrets.delete"].includes(capability)
                      ? { expectedVersion: secret!.version }
                      : {}),
                  ...(capability === "secrets.rotate" ? { value: rotated } : {}),
                  ...(capability === "secrets.list" ? { limit: 25 } : {}),
              };
    return { ...calls, name, value, rotated, namespace, credentials, key, secret, input };
}
