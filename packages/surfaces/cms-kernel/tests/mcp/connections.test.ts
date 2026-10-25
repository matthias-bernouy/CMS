import { expect, test } from "bun:test";
import { cmsMcpFixture } from "./fixture";
import { connected } from "./connection";

test("connection UI paginates beyond 256 revoked rows and revokes an active grant on the last page", async () => {
    const f = await cmsMcpFixture();
    const token = await connected(f);
    const principal = await f.authorization.resolve(token.access_token);
    const record = (await f.store.get(`grant:${principal.connectionId}`))!;
    for (let i = 0; i < 260; i++) {
        await f.store.create({
            ...record,
            id: `grant:${String(i).padStart(43, "0")}`,
            value: { ...(record.value as object), revoked: true },
        });
    }
    const target = "z".repeat(43);
    await f.store.create({ ...record, id: `grant:${target}` });
    let path = "/.cms/connections";
    let response: Response;
    let html = "";
    let pages = 0;
    do {
        response = await f.request(path, { headers: { Cookie: "cms-session=session-token" } });
        expect(response.status).toBe(200);
        html = await response.text();
        pages++;
        if (html.includes(`value="${target}"`)) {
            break;
        }
        const next = /<a href="([^"]+)">Next applications<\/a>/u.exec(html);
        expect(next).not.toBeNull();
        path = next![1]!;
    } while (pages < 10);
    expect(pages).toBe(6);
    const csrf = /name="csrf" value="([^"]+)"/u.exec(html)![1]!;
    const cookie = response!.headers.get("set-cookie")!.split(";")[0]!;
    expect(
        (
            await f.request("/.cms/connections", {
                method: "POST",
                headers: {
                    Origin: "http://127.0.0.1:5100",
                    Cookie: `cms-session=session-token; ${cookie}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ csrf, id: target }),
            })
        ).status,
    ).toBe(303);
    expect((await f.store.get(`grant:${target}`))!.value).toMatchObject({ revoked: true });
    expect((await f.authorization.resolve(token.access_token)).subjectId).toBe("admin");
});
