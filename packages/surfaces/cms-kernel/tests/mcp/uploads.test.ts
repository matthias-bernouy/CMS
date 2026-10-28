import { expect, test } from "bun:test";
import { cmsMcpFixture } from "./fixture";
import { connected } from "./connection";

test("MCP binary bridge requires live authorization and never forwards the MCP bearer as a Provider credential", async () => {
    const f = await cmsMcpFixture();
    const path = "/.cms/mcp/uploads/upload-123";
    expect((await f.request(path, { method: "PUT", body: "file" })).status).toBe(401);
    const token = await connected(f);
    const headers = { Authorization: `Bearer ${token.access_token}`, "Upload-Token": "file-upload-token" };
    expect(
        (
            await f.request(path, {
                method: "PUT",
                headers: { ...headers, Origin: "https://other.example" },
                body: "file",
            })
        ).status,
    ).toBe(403);
    expect(
        (await f.request(path, { method: "PUT", headers: { ...headers, "Content-Length": "-1" }, body: "file" }))
            .status,
    ).toBe(400);
    expect(f.invocations.some((call) => call.capabilityId === "upload.write")).toBe(false);
    expect((await f.request(path, { method: "PUT", headers, body: "file" })).status).toBe(204);
    const invocation = f.invocations.findLast((call) => call.capabilityId === "upload.write")!;
    expect(invocation.actor).toEqual({ kind: "administrator", subjectId: "admin", authorizationRevision: 3 });
    expect(invocation.input).toEqual({ uploadId: "upload-123", uploadToken: "file-upload-token" });
    expect(JSON.stringify(invocation)).not.toContain(token.access_token);
    expect(await new Response(invocation.binaryBody!.stream).text()).toBe("file");
    f.demote();
    expect((await f.request(path, { method: "PUT", headers, body: "file" })).status).toBe(401);
    expect(f.invocations.filter((call) => call.capabilityId === "upload.write")).toHaveLength(1);
});
