import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    readHostingConfiguration,
    readControlAdministrator,
} from "../../../src/runtime/instances/system/hosting/configuration";

test("hosting startup requires its canonical Control origin and explicit managed DNS suffixes", () => {
    expect(() => readHostingConfiguration({ ULVIA_EDGE_ROUTING_SECRET: "edge-test-secret".repeat(3) })).toThrow(
        "ULVIA_CONTROL_ORIGIN is required",
    );
    expect(
        readHostingConfiguration({
            ULVIA_EDGE_ROUTING_SECRET: "edge-test-secret".repeat(3),
            ULVIA_CONTROL_ORIGIN: "https://CONTROL.example/",
            ULVIA_TLS_ENTRYPOINTS: '[{"host":"proxy","port":443}]',
            ULVIA_TLS_PUBLIC_ADDRESSES: '["192.0.2.1"]',
            ULVIA_HOSTING_MANAGED_SUFFIXES: '["Sites.Example"]',
        }),
    ).toMatchObject({ origin: "https://control.example", localDevelopment: false, managedSuffixes: ["sites.example"] });
    for (const suffixes of [
        '["*.example"]',
        "[1]",
        "{}",
        "null",
        '["http://example"]',
        JSON.stringify(Array(17).fill("example")),
    ]) {
        expect(() =>
            readHostingConfiguration({
                ULVIA_EDGE_ROUTING_SECRET: "edge-test-secret".repeat(3),
                ULVIA_CONTROL_ORIGIN: "https://control.example",
                ULVIA_HOSTING_MANAGED_SUFFIXES: suffixes,
            }),
        ).toThrow();
    }
    expect(() =>
        readHostingConfiguration({
            ULVIA_EDGE_ROUTING_SECRET: "edge-test-secret".repeat(3),
            ULVIA_CONTROL_ORIGIN: "http://remote.example",
        }),
    ).toThrow();
    expect(() =>
        readHostingConfiguration({
            ULVIA_EDGE_ROUTING_SECRET: "edge-test-secret".repeat(3),
            ULVIA_CONTROL_ORIGIN: "http://control.localhost",
            ULVIA_CONTROL_BOOTSTRAP_FILE: "relative.json",
        }),
    ).toThrow("absolute");
});

test("initial operator credentials are read from one bounded strict JSON file", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-control-bootstrap-"));
    const path = join(root, "credentials.json");
    try {
        expect(await readControlAdministrator(undefined)).toBeUndefined();
        const initial = { email: "operator@example.test", password: "keep-exact-password\n" };
        await writeFile(path, JSON.stringify(initial), { mode: 0o600 });
        expect(await readControlAdministrator(path)).toEqual(initial);
        for (const contents of [
            "{}",
            '{"email":"one","email":"two","password":"x"}',
            '{"email":"one","password":"x","role":"operator"}',
            "[1]",
            "x".repeat(4097),
        ]) {
            await writeFile(path, contents);
            await expect(readControlAdministrator(path)).rejects.toThrow();
        }
        await expect(readControlAdministrator(root)).rejects.toThrow();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
