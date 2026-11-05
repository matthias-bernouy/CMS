import { expect } from "bun:test";
import { invoke, refusal } from "./client";
import type { Connection } from "./client";

export async function discoveryJourney(connection: Connection) {
    const { call } = connection;
    const questions = [
        ["Comment éviter d'écraser les changements d'un autre auteur ?", "ulvia/cms.content", "pages/revisions.md"],
        ["¿Cómo subir un archivo local?", "ulvia/cms.files", "site-files.md"],
        ["如何在发布前检查页面？", "ulvia/cms.content", "pages/verify.md"],
    ];
    for (const [query, contractId, path] of questions) {
        const search = await call("ulvia/cms.installations", "documentation.search", { query, contractId, limit: 3 });
        expect(search.mode).toBe("hybrid");
        expect(search.results.some((item: { reference: { path: string } }) => item.reference.path === path)).toBe(true);
        expect(
            search.results.every(
                (item: { reference: { contractId: string } }) => item.reference.contractId === contractId,
            ),
        ).toBe(true);
    }
    const empty = await call("ulvia/cms.installations", "documentation.search", {
        query: "publication",
        contractId: "ulvia/unknown.contract",
    });
    expect(empty.results).toEqual([]);
    const linked = connection.tools.find((entry) => entry._meta["io.ulvia/capability"] === "pages.create")!;
    const links = linked._meta["io.ulvia/docs"] as {
        reference: { contractId: string; releaseDigest: string; path: string };
    }[];
    const reference = links[0]!.reference;
    const doc = await call("ulvia/cms.installations", "documentation.get", { reference });
    expect(doc.content.startsWith("# ")).toBe(true);
    expect(
        (await call("ulvia/cms.installations", "documentation.get", { reference, offset: doc.content.length })).content,
    ).toBe("");
    refusal(
        await invoke(connection, "ulvia/cms.installations", "documentation.get", {
            reference,
            offset: doc.content.length + 1,
        }),
        "INVALID_INPUT",
    );
    for (const path of ["../secrets.md", "%2e%2e/secrets.md", "/etc/passwd"]) {
        refusal(
            await invoke(connection, "ulvia/cms.installations", "documentation.get", {
                reference: { ...reference, path },
            }),
            "INVALID_INPUT",
        );
    }
    refusal(
        await invoke(connection, "ulvia/cms.installations", "documentation.get", {
            reference: { ...reference, path: "missing.md" },
        }),
        "NOT_FOUND",
    );
    const resources = await connection.rpc("resources/list");
    expect(resources.resources).toHaveLength(4);
    for (const resource of resources.resources) {
        const read = await connection.rpc("resources/read", { uri: resource.uri });
        expect(read.contents[0].text.length).toBeGreaterThan(0);
    }
}
