import { expect, test } from "bun:test";
import { prepareResourceSource, buildResourceArchive } from "@bernouy/resources/build";
import { sourceFixture, sourceContracts } from "./fixtures";

test("browser state schema references require the exact admitted pin and expand its declared output", async () => {
    const f = await sourceFixture();
    try {
        const build = await sourceContracts();
        const pin = build.contracts[0]!;
        const reference = { contractId: "acme/query", version: "1.0.0", digest: pin.digest, capabilityId: "read" };
        f.definition.states = [{ id: "value", scope: "page", schema: { $capabilityOutput: reference } }];
        await f.write("definition.json", f.definition);
        const source = await prepareResourceSource(f.root, build.implementedContracts);
        expect(source.states[0]!.schema).toEqual(pin.release.capabilities[0]!.output);
        await f.write("definition.json", {
            ...f.definition,
            states: [
                {
                    id: "value",
                    scope: "page",
                    schema: { $capabilityOutput: { ...reference, digest: "sha256:" + "0".repeat(64) } },
                },
            ],
        });
        await expect(prepareResourceSource(f.root, build.implementedContracts)).rejects.toThrow("exact admitted");
    } finally {
        await f.close();
    }
});

test("typed synchronized producers cannot widen a declared browser state", async () => {
    const f = await sourceFixture();
    try {
        const build = await sourceContracts();
        f.definition.states = [
            {
                id: "value",
                scope: "page",
                schema: {
                    type: "object",
                    properties: { value: { type: "string", maxLength: 1 } },
                    required: ["value"],
                },
            },
        ];
        await f.write("definition.json", f.definition);
        await f.write(
            f.folder + "markup.html",
            '<div cms-query="acme/query:read as result" cms-sync="@page:acme--base--value"><div cms-match="result.outcome.kind"><span cms-case="&quot;none&quot;"></span><span cms-case="&quot;success&quot;"></span><span cms-case="&quot;failure&quot;"></span></div></div>',
        );
        const source = await prepareResourceSource(f.root, build.implementedContracts);
        await expect(
            buildResourceArchive([source], { locale: "en", contracts: build.implementedContracts }),
        ).rejects.toThrow("incompatible");
    } finally {
        await f.close();
    }
});

test("unknown state reads, binary state and parameter scope mismatches refuse source preparation or build", async () => {
    const f = await sourceFixture();
    try {
        await f.write(f.folder + "markup.html", '<div cms-query="@page:acme--base--missing as missing"></div>');
        const source = await prepareResourceSource(f.root, []);
        await expect(buildResourceArchive([source], { locale: "en", contracts: [] })).rejects.toThrow("Unknown state");
        await f.write("definition.json", {
            ...f.definition,
            states: [{ id: "value", scope: "page", schema: { type: "binary", maxBytes: 8 } }],
        });
        await expect(prepareResourceSource(f.root, [])).rejects.toThrow("binary");
        await f.write("definition.json", {
            ...f.definition,
            states: [{ id: "value", scope: "param", schema: { type: "boolean" } }],
        });
        await expect(prepareResourceSource(f.root, [])).rejects.toThrow("nonnullable string");
    } finally {
        await f.close();
    }
});
