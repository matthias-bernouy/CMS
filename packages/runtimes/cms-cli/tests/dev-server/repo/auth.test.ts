import { describe, expect, test } from "bun:test";
import { createDevAuth, DEV_ADMIN_SUBJECT, DEV_PASSWORD } from "../../../src/dev-server/runtime/auth";

describe("development authentication", () => {
    test("keeps the seeded administrator identity stable across runtimes", async () => {
        const first = await createDevAuth();
        const second = await createDevAuth();

        expect(first.devAdmin.sub).toBe(DEV_ADMIN_SUBJECT);
        expect(second.devAdmin.sub).toBe(DEV_ADMIN_SUBJECT);
        expect(await first.credentials.verify("dev@example.com", DEV_PASSWORD)).toMatchObject({
            sub: "dev-admin",
        });
    });
});
