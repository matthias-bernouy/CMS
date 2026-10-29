import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as ts from "@typescript/typescript6";
import { requestBodyFindings } from "../../repository/requestBody";

test("body guard rejects built-in Request reads and aliases, but accepts responses, bounded wrappers and shadowed names", async () => {
    const root = await mkdtemp(join(tmpdir(), "request-body-rule-"));
    const file = join(root, "fixture.ts");
    try {
        await writeFile(
            file,
            `
            async function forbidden(request: Request) {
                await request.json(); const alias = request; await alias.text();
                await request["formData"](); await new Request("https://example.invalid").arrayBuffer();
            }
            async function accepted(request: Request, response: Response) {
                await response.json(); await readBoundedRequestBody(request);
                const user = { json: () => "legitimate domain method" }; user.json();
                function shadow(request: { json(): string }) { request.json(); }
            }
            declare function readBoundedRequestBody(request: Request): Promise<Uint8Array>;
        `,
        );
        const program = ts.createProgram([file], {
            noEmit: true,
            target: ts.ScriptTarget.ESNext,
            lib: ["lib.dom.d.ts", "lib.esnext.d.ts"],
        });
        const findings = requestBodyFindings(program, [file]);
        expect(findings).toHaveLength(4);
        for (const method of ["json", "text", "formData", "arrayBuffer"]) {
            expect(findings.some((line) => line.includes(`Request.${method}`))).toBe(true);
        }
        expect(findings.every((line) => line.includes("readBoundedRequestBody"))).toBe(true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
