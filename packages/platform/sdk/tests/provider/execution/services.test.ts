import { defineFeature } from "@bernouy/ulvia-sdk";
import { expect, test } from "bun:test";
import { contractString, capabilitiesFor, implementFeature, z } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../../examples/provider";
import { unitProvider } from "../support/runtime";

interface NotesServices {
    notes: { read(): string };
}
interface ChildServices {
    settings: { enabled(): boolean };
}
interface FileServices {
    files: { count(): number };
}
interface HostServices extends NotesServices, ChildServices, FileServices {}
const meta = { name: "Services", publisherId: "example", version: "1.0.0" };
const behavior = { effect: "query", execution: "sync", sensitive: false } as const;
const binding = (path: string) =>
    [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path,
            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
        },
    ] as const;

test("inherited execution uses compatible child services while other features receive their own ports", async () => {
    let executions = 0;
    let selections = 0;
    const parent = capabilitiesFor<NotesServices>();
    const read = parent({
        id: "notes.read",
        access: "public",
        behavior,
        bindings: binding("/notes"),
        input: z.strictObject({}),
        output: contractString({ maxLength: 128 }),
        errors: {},
        execute: ({ services }) => {
            executions++;
            expect("files" in services).toBe(false);
            return services.notes.read();
        },
    });
    const parentContract = defineFeature({ ...meta, contractId: "example/notes-services", capabilities: [read] });
    const child = capabilitiesFor<ChildServices>();
    const enabled = child({
        id: "enabled",
        access: "public",
        behavior,
        bindings: binding("/enabled"),
        input: z.strictObject({}),
        output: z.boolean(),
        errors: {},
        execute: ({ services }) => services.settings.enabled(),
    });
    const childContract = defineFeature({
        ...meta,
        contractId: "example/child-services",
        extends: parentContract,
        capabilities: [enabled],
    });
    const files = capabilitiesFor<FileServices>();
    const count = files({
        id: "files.count",
        access: "public",
        behavior,
        bindings: binding("/files"),
        input: z.strictObject({}),
        output: z.number(),
        errors: {},
        execute: ({ services }) => {
            executions++;
            expect(Object.keys(services)).toEqual(["files"]);
            return services.files.count();
        },
    });
    const fileContract = defineFeature({ ...meta, contractId: "example/file-services", capabilities: [count] });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [
            implementFeature(childContract, {
                services: (host: HostServices) => {
                    selections++;
                    return { notes: host.notes, settings: host.settings };
                },
            }),
            implementFeature(fileContract, {
                services: (host: HostServices) => {
                    selections++;
                    return { files: host.files };
                },
            }),
        ],
    });
    expect(selections).toBe(0);
    expect(executions).toBe(0);
    const runtime = unitProvider(build, {
        notes: { read: () => "Inherited" },
        settings: { enabled: () => true },
        files: { count: () => 7 },
    });
    expect(selections).toBe(3);
    expect(await (await runtime.call(parentContract.contractId, read.id, "/notes")).json()).toBe("Inherited");
    expect(await (await runtime.call(childContract.contractId, enabled.id, "/enabled")).json()).toBe(true);
    expect(await (await runtime.call(fileContract.contractId, count.id, "/files")).json()).toBe(7);
    expect(selections).toBe(3);
    expect(executions).toBe(2);
});
