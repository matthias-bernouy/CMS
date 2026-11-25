import { expect, test } from "bun:test";
import { prepareNpmPublication } from "../../../../infra/distribution/npm";
import { NPM_CONFIRMATION_WINDOW } from "../../../../infra/distribution/npm/confirmation";
import { npmFixture } from "./fixture";

test.each([false, true])("a processing version appears after five minutes, lost write reply: %s", async (lostReply) => {
    const f = await npmFixture();
    try {
        if (lostReply) {
            f.setUncertain();
        }
        const transport = {
            ...f.transport,
            fetch: async (url: string, options: RequestInit) =>
                f.stored() && f.elapsed() < 300_000
                    ? new Response(null, { status: 404 })
                    : f.transport.fetch(url, options),
        };
        const publication = await prepareNpmPublication(f.archive, f.version, transport);
        await publication.publish();
        await publication.verify();
        await publication.publish();
        expect(f.elapsed()).toBeGreaterThanOrEqual(300_000);
        expect(Math.max(...f.waits)).toBe(30_000);
        expect(f.calls).toHaveLength(1);
        expect(f.messages[0]).toContain("waiting for registry confirmation");
        expect(f.tags.latest).toBe("1.0.0");
        expect(f.tags.next).toBe("1.1.0-beta.1");
    } finally {
        await f.close();
    }
});

test("twenty minutes of missing metadata stop read-only confirmation; a later retry skips upload", async () => {
    const f = await npmFixture();
    let visible = false;
    let reads = 0;
    try {
        const transport = {
            ...f.transport,
            fetch: async (url: string, options: RequestInit) => {
                reads++;
                return visible ? f.transport.fetch(url, options) : new Response(null, { status: 404 });
            },
        };
        const publication = await prepareNpmPublication(f.archive, f.version, transport);
        await expect(publication.publish()).rejects.toThrow("not confirmed after 20 minutes");
        expect(f.elapsed()).toBe(NPM_CONFIRMATION_WINDOW);
        expect(reads).toBeLessThan(50);
        expect(f.calls).toHaveLength(1);
        expect(f.tags.latest).toBe("1.0.0");
        visible = true;
        await (await prepareNpmPublication(f.archive, f.version, transport)).publish();
        expect(f.calls).toHaveLength(1);
    } finally {
        await f.close();
    }
});

test.each([429, 500, 502, 503, 504, "network"])(
    "temporary %s reads after upload recover without another write",
    async (failure) => {
        const f = await npmFixture();
        let failures = 2;
        try {
            const publication = await prepareNpmPublication(f.archive, f.version, {
                ...f.transport,
                fetch: async (url, options) => {
                    if (f.stored() && failures-- > 0) {
                        if (failure === "network") {
                            throw new TypeError("Connection reset");
                        }
                        return new Response("temporary failure", { status: failure });
                    }
                    return f.transport.fetch(url, options);
                },
            });
            await publication.publish();
            expect(f.calls).toHaveLength(1);
            expect(f.waits).toEqual([1000, 2000]);
        } finally {
            await f.close();
        }
    },
);

test.each([401, 403, "integrity", "malformed"])("a post-upload %s refusal fails immediately", async (failure) => {
    const f = await npmFixture();
    try {
        const publication = await prepareNpmPublication(f.archive, f.version, {
            ...f.transport,
            fetch: async (url, options) => {
                if (!f.stored()) {
                    return f.transport.fetch(url, options);
                }
                return typeof failure === "number"
                    ? new Response(null, { status: failure })
                    : failure === "malformed"
                      ? new Response("{invalid json")
                      : Response.json({
                            name: "@cyaxis/ulvia",
                            version: f.version,
                            dist: { integrity: "sha512-other" },
                        });
            },
        });
        await expect(publication.publish()).rejects.toThrow();
        expect(f.calls).toHaveLength(1);
        expect(f.waits).toEqual([]);
        expect(f.tags.latest).toBe("1.0.0");
    } finally {
        await f.close();
    }
});

test.each(["1.2.3", "1.2.3-beta.1"])(
    "a newer concurrent release stops %s channel confirmation without rewriting the tag",
    async (version) => {
        const f = await npmFixture(version);
        const tag = version.includes("-") ? "next" : "latest";
        try {
            f.setStored();
            const publication = await prepareNpmPublication(f.archive, version, {
                ...f.transport,
                run: async (args) => {
                    await f.transport.run(args);
                    f.tags[tag] = "9.0.0";
                },
            });
            await expect(publication.promote()).rejects.toThrow("Refusing to move");
            expect(f.calls).toHaveLength(1);
            expect(f.waits).toEqual([]);
            expect(f.tags[tag]).toBe("9.0.0");
        } finally {
            await f.close();
        }
    },
);
