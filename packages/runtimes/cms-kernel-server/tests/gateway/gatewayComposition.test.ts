import { expect, test } from "bun:test";

test("the Kernel Gateway resolves provider credentials through the encrypted secret boundary", async () => {
    const gateway = await Bun.file(
        new URL("../../src/runtime/gateway/createProductionGateway.ts", import.meta.url),
    ).text();
    expect(gateway).toMatch(/const\s+resolveSecret\s*=\s*createSecretResolver\s*\(\s*secrets\s*\)\s*;/);
    expect(gateway).toMatch(/resolveToken:\s*async\s*\(reference\)/);
});
