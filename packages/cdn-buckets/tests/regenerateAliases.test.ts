import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { regenerateAliases } from "src/core/nginx/regenerateAliases";
import type { Alias } from "src/interfaces/entities/Alias";
import type { BucketProxy } from "src/interfaces/entities/BucketProxy";

const certPath = (domain: string) => ({ cert: `/c/${domain}.crt`, key: `/c/${domain}.key` });
const includePath = "/etc/nginx/conf.d/cdn/bucketServing.conf";

const alias = (overrides: Partial<Alias> = {}): Alias => ({
    domain:    "acme.com",
    bucketId:  "b1",
    createdAt: new Date(),
    ...overrides,
});

const proxy = (overrides: Partial<BucketProxy>): BucketProxy => ({
    bucketId:   "b1",
    providerId: "stripe",
    server:     "https://api.stripe.com/v1",
    auth:       { type: "none" },
    createdAt:  new Date(),
    updatedAt:  new Date(),
    ...overrides,
});

describe("regenerateAliases", () => {
    let dir: string;
    beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "regen-aliases-")); });
    afterAll (async () => { await rm(dir, { recursive: true, force: true }); });

    const paths = () => ({
        aliases:        join(dir, "aliases.conf"),
        aliasesServers: join(dir, "aliasesServers.conf"),
    });

    test("alias without proxies — server block stays minimal", async () => {
        const p = paths();
        await regenerateAliases([alias()], new Map(), p.aliases, p.aliasesServers, includePath, certPath);
        const body = await readFile(p.aliasesServers, "utf-8");
        expect(body).toContain("server_name acme.com;");
        expect(body).toContain(`include ${includePath};`);
        expect(body).not.toContain("location /.cms/data/");
    });

    test("alias with proxies — locations are inlined before the include", async () => {
        const p = paths();
        const proxiesByBucket = new Map<string, BucketProxy[]>();
        proxiesByBucket.set("b1", [
            proxy({ providerId: "stripe", auth: { type: "bearer", token: "VERY_SECRET_TOKEN" } }),
        ]);
        await regenerateAliases([alias()], proxiesByBucket, p.aliases, p.aliasesServers, includePath, certPath);
        const body = await readFile(p.aliasesServers, "utf-8");

        const idxLoc     = body.indexOf("location /.cms/data/stripe/");
        const idxInclude = body.indexOf(`include ${includePath};`);
        expect(idxLoc).toBeGreaterThan(-1);
        expect(idxInclude).toBeGreaterThan(idxLoc);
        expect(body).not.toContain("VERY_SECRET_TOKEN");
        expect(body).toContain('proxy_set_header Authorization "Bearer ${SECRET_');
    });

    test("aliases.conf still maps host → bucketId", async () => {
        const p = paths();
        await regenerateAliases([alias({ domain: "x.com", bucketId: "b9" })], new Map(),
            p.aliases, p.aliasesServers, includePath, certPath);
        const body = await readFile(p.aliases, "utf-8");
        expect(body).toContain("x.com b9;");
    });

    test("proxies on a bucket without alias are not rendered (no server block to host them)", async () => {
        const p = paths();
        const proxiesByBucket = new Map<string, BucketProxy[]>();
        proxiesByBucket.set("orphan-bucket", [proxy({ bucketId: "orphan-bucket" })]);
        await regenerateAliases([], proxiesByBucket, p.aliases, p.aliasesServers, includePath, certPath);
        const body = await readFile(p.aliasesServers, "utf-8");
        expect(body).not.toContain("location /.cms/data/");
    });
});
