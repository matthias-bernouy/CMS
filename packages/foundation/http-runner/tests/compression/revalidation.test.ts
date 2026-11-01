import { expect, test } from "bun:test";
import { compress, ifNoneMatchMatches, sendCompressed } from "@bernouy/http-runner";

test("cached responses recognize weak, listed and wildcard validators without altering their bytes", async () => {
    const entry = compress("page", "text/html");
    const tag = `"${entry.hash}-identity"`;
    for (const value of [`W/${tag}`, `"other", W/${tag}`, "*"]) {
        const request = new Request("https://site.test/", { headers: { "if-none-match": value } });
        const response = sendCompressed(request, entry);
        expect(request.headers.get("if-none-match")).toBe(value);
        expect(response.status).toBe(304);
        expect(response.headers.get("etag")).toBe(tag);
        expect(await response.text()).toBe("");
    }
    const response = sendCompressed(
        new Request("https://site.test/", { headers: { "if-none-match": 'W/"different"' } }),
        entry,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("page");
    expect(ifNoneMatchMatches('"other", W/"has,a,comma"', 'W/"has,a,comma"')).toBe(true);
});
