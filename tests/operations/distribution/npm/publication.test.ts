import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { prepareNpmPublication } from "../../../../infra/distribution/npm";
import { npmFixture } from "./fixture";

test.each(["1.2.3", "1.2.3-beta.1"])(
    "runtime %s is exact-installable without advancing either release channel",
    async (version) => {
        const f = await npmFixture(version);
        try {
            const publication = await prepareNpmPublication(f.archive, version, f.transport);
            await expect(publication.verify()).rejects.toThrow("not confirmed after 20 minutes");
            await publication.publish();
            await publication.verify();
            expect(f.calls[0]).toContain(`runtime-${version}`);
            expect(f.tags.latest).toBe("1.0.0");
            expect(f.tags.next).toBe("1.1.0-beta.1");
            expect(f.stored()).toBe(true);
            await publication.publish();
            expect(f.calls).toHaveLength(1);
            await publication.promote();
            const tag = version.includes("-") ? "next" : "latest";
            expect(f.tags[tag]).toBe(version);
            expect(f.calls[1]).toContain("--@cyaxis:registry=https://registry.npmjs.org/");
            await publication.promote();
            expect(f.calls).toHaveLength(2);
        } finally {
            await f.close();
        }
    },
);

test("lost publish and tag responses reconcile against registry state", async () => {
    const f = await npmFixture();
    try {
        f.setUncertain();
        const publication = await prepareNpmPublication(f.archive, f.version, f.transport);
        await publication.publish();
        await publication.promote();
        expect(f.tags.latest).toBe(f.version);
    } finally {
        await f.close();
    }
});

test("an older resumed publication cannot move a release tag backwards", async () => {
    const f = await npmFixture();
    try {
        f.setStored();
        f.tags.latest = "2.0.0";
        const publication = await prepareNpmPublication(f.archive, f.version, f.transport);
        await expect(publication.promote()).rejects.toThrow("backwards");
        expect(f.calls).toHaveLength(0);
    } finally {
        await f.close();
    }
});

test.each(["different", "unavailable", "foreign", "oversized", "null"])(
    "npm %s metadata refuses before publication",
    async (mode) => {
        const f = await npmFixture();
        let cancelled = false;
        try {
            const transport = {
                ...f.transport,
                fetch: async () =>
                    mode === "oversized"
                        ? new Response(
                              new ReadableStream({
                                  start(controller) {
                                      controller.enqueue(new Uint8Array(1_048_577));
                                  },
                                  cancel() {
                                      cancelled = true;
                                  },
                              }),
                          )
                        : mode === "null"
                          ? Response.json(null)
                          : mode === "unavailable"
                            ? new Response(null, { status: 503 })
                            : Response.json({
                                  name: mode === "foreign" ? "@foreign/cli" : "@cyaxis/ulvia",
                                  version: f.version,
                                  dist: { integrity: mode === "different" ? "sha512-other" : f.integrity },
                              }),
            };
            await expect(prepareNpmPublication(f.archive, f.version, transport)).rejects.toThrow();
            expect(f.calls).toHaveLength(0);
            if (mode === "oversized") {
                expect(cancelled).toBe(true);
            }
        } finally {
            await f.close();
        }
    },
);

test("changed archive after preflight is refused before upload", async () => {
    const f = await npmFixture();
    try {
        const publication = await prepareNpmPublication(f.archive, f.version, f.transport);
        await writeFile(f.archive, "changed");
        await expect(publication.publish()).rejects.toThrow("archive changed");
        expect(f.calls).toHaveLength(0);
    } finally {
        await f.close();
    }
});

test("unconfirmed npm publication leaves both release channels unchanged", async () => {
    const f = await npmFixture();
    try {
        const publication = await prepareNpmPublication(f.archive, f.version, {
            ...f.transport,
            run: async () => {
                throw new Error("network unavailable");
            },
        });
        await expect(publication.publish()).rejects.toThrow("not confirmed");
        expect(f.tags.latest).toBe("1.0.0");
        expect(f.tags.next).toBe("1.1.0-beta.1");
    } finally {
        await f.close();
    }
});

test("a rejected npm promotion preserves the previous channel and remains retryable", async () => {
    const f = await npmFixture();
    try {
        f.setStored();
        const publication = await prepareNpmPublication(f.archive, f.version, {
            ...f.transport,
            run: async () => {
                throw new Error("npm authentication refused");
            },
        });
        await expect(publication.promote()).rejects.toThrow("not confirmed");
        expect(f.tags.latest).toBe("1.0.0");
        const retry = await prepareNpmPublication(f.archive, f.version, f.transport);
        await retry.promote();
        expect(f.tags.latest).toBe(f.version);
    } finally {
        await f.close();
    }
});
