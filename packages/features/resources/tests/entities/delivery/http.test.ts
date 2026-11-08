import { expect, test } from "bun:test";
import { MemoryResourceMetadataStore } from "../../../src/exports/memory";
import { ResourceAssets } from "../../../src/exports/storage";
import { serveResourceAsset } from "../../../src/exports/delivery";
import { fixture } from "./fixtures";

test("ordinary immutable assets stream with exact conditions, ranges and safe cross-origin font/image headers", async () => {
    const f = await fixture();
    const response = await f.read();
    expect(await response.text()).toBe("payload");
    expect(response.headers.get("etag")).toBe(`"${f.asset.digest}"`);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe("attachment");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(f.metadata.reads).toBe(1);
    expect(f.blobs.heads).toBe(1);
    expect(f.blobs.reads).toHaveLength(1);
    const partial = await f.read({ headers: { range: "bytes=1-3" } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 1-3/7");
    expect(partial.headers.get("content-length")).toBe("3");
    expect(await partial.text()).toBe("ayl");
    expect(f.blobs.reads[1]).toEqual({ range: { start: 1, end: 3 } });
    expect(await (await f.read({ headers: { range: "bytes=-2" } })).text()).toBe("ad");
    const ignored = await f.read({ headers: { range: "bytes=1-3", "if-range": '"foreign"' } });
    expect(ignored.status).toBe(200);
    expect(await ignored.text()).toBe("payload");
    const unversioned = await f.read({}, f.url.split("?")[0]!);
    expect(unversioned.headers.get("cache-control")).toBe("public, no-cache");
    await unversioned.body?.cancel();
});
test("HEAD, revalidation, refused ranges and invalid identities never open an asset body", async () => {
    const f = await fixture();
    const head = await f.read({ method: "HEAD", headers: { range: "bytes=1-3" } });
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get("content-length")).toBe("7");
    const cached = await f.read({ headers: { "if-none-match": `W/"${f.asset.digest}"` } });
    expect(cached.status).toBe(304);
    expect(cached.headers.has("content-length")).toBe(false);
    const range = await f.read({ headers: { range: "bytes=7-8" } });
    expect(range.status).toBe(416);
    expect(range.headers.get("content-range")).toBe("bytes */7");
    for (const path of [
        f.url + "&v=" + "a".repeat(64),
        f.url.replace("acme%2Fbase", "acme%2fbase"),
        f.url.replace(/v=.+/u, "v=" + "0".repeat(64)),
        "/_content/resources/acme%2Fbase/..%2Fsecret",
        "/_content/resources/acme%2Fbase/missing.txt",
    ]) {
        expect((await f.read({}, path)).status).toBe(404);
    }
    expect((await f.read({ method: "POST" })).status).toBe(405);
    expect(f.blobs.heads).toBe(0);
    expect(f.blobs.reads).toHaveLength(0);
    const other = new ResourceAssets(new MemoryResourceMetadataStore("instance-b:default"), f.blobs);
    expect((await serveResourceAsset(new Request("https://site.test" + f.url), other)).status).toBe(404);
});
test("inline SVG reads require its verified profile, not merely an image content type", async () => {
    const f = await fixture('<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>', true);
    const request = new Request("https://site.test" + f.url);
    const valid = await serveResourceAsset(request, f.assets, { inlineSvg: true });
    expect(valid.status).toBe(200);
    expect(valid.headers.get("content-disposition")).toBe("inline");
    await valid.body?.cancel();
    const other = await fixture('<svg viewBox="0 0 24 24"/>', true, false);
    expect(
        (await serveResourceAsset(new Request("https://site.test" + other.url), other.assets, { inlineSvg: true }))
            .status,
    ).toBe(404);
    expect(other.blobs.reads).toHaveLength(0);
});
