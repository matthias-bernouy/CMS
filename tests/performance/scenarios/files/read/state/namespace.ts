import { randomUUID } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import { uploadRaster } from "./upload";
import type { StoredRaster } from "./upload";
import type { FileCalls } from "../../client";

export function namespaceReadState(
    calls: FileCalls,
    origin: string,
    derived: boolean,
    cleanup: (credentials: Readonly<Record<string, unknown>>, name: string) => Promise<void>,
) {
    const owned: { credentials: Readonly<Record<string, unknown>>; name: string }[] = [];
    let credentials: Readonly<Record<string, unknown>>;
    let foreign: Readonly<Record<string, unknown>>;
    let child: Readonly<Record<string, unknown>>;
    let metadata: unknown;
    let current: StoredRaster;
    const generations: StoredRaster[] = [];
    const files: StoredRaster[] = [];
    const create = async () => {
        const name = `performance-${randomUUID()}.png`;
        const output = requireRecord(await calls.fixture("namespace.create", { name, defaultVisibility: "public" }));
        const keys = { namespaceId: output.namespaceId, namespaceKey: output.namespaceKey };
        owned.push({ credentials: keys, name });
        return keys;
    };
    const replace = async (index: number) => {
        const previous = current;
        current = await uploadRaster(
            calls,
            credentials,
            `performance-generation-${index}.png`,
            derived ? 300 + index : 64 + index,
            derived,
            previous?.reference.fileId,
        );
        assertCondition(
            !generations.some((entry) => entry.reference.generation === current.reference.generation),
            "file-history-did-not-create-distinct-generation",
        );
        generations.push(current);
        if (previous) {
            files.splice(files.indexOf(previous), 1);
        }
        files.unshift(current);
    };
    return {
        calls,
        origin,
        get credentials() {
            return credentials;
        },
        get foreign() {
            return foreign;
        },
        get current() {
            return current;
        },
        get files() {
            return files;
        },
        get generations() {
            return generations;
        },
        get metadata() {
            return metadata;
        },
        get childInput() {
            return { namespaceId: credentials.namespaceId, namespaceKey: child.namespaceKey };
        },
        async initialize(profile: string, capability: string) {
            credentials = await create();
            foreign = await create();
            metadata = await calls.fixture("namespace.get", credentials);
            if (capability === "namespace.get") {
                child = requireRecord(
                    await calls.fixture("namespace.keys.create", {
                        ...credentials,
                        permissions: ["files.read", "namespace.manage"],
                    }),
                );
                return;
            }
            if (profile === "large") {
                for (let index = 0; index < 63; index++) {
                    files.unshift(
                        await uploadRaster(calls, credentials, `performance-background-${index}.png`, 64, false),
                    );
                }
            }
            for (let index = 0; index < (profile === "history" ? 33 : 1); index++) {
                await replace(index);
            }
        },
        replace,
        async rotate() {
            const old = { namespaceId: credentials.namespaceId, namespaceKey: child.namespaceKey };
            child = requireRecord(await calls.fixture("namespace.keys.rotate", { ...credentials, keyId: child.keyId }));
            const denied = await calls.call("namespace.get", "http", old);
            assertCondition(
                !denied.observation.validated && denied.observation.status === 403,
                "file-rotated-key-still-authorized",
            );
        },
        async snapshot() {
            const rows: unknown[] = [];
            for (let offset = 0; offset <= files.length; offset += 16) {
                rows.push(await calls.fixture("files.list", { ...credentials, offset, limit: 16 }));
            }
            return canonicalizeIJson({ namespace: await calls.fixture("namespace.get", credentials), rows });
        },
        assertNamespace(value: unknown) {
            assertCondition(
                canonicalizeIJson(value) === canonicalizeIJson(metadata),
                "file-namespace-changed-after-key-rotation",
            );
        },
        async close() {
            const settled = await Promise.allSettled(owned.map((entry) => cleanup(entry.credentials, entry.name)));
            assertCondition(
                settled.every((row) => row.status === "fulfilled"),
                "file-reader-namespace-cleanup",
            );
        },
    };
}

export type NamespaceReadState = ReturnType<typeof namespaceReadState>;
