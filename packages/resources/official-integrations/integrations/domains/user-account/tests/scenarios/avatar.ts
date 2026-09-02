import { File } from "node:buffer";
import { expect, test } from "bun:test";
import { createHarness } from "../harness/create";
import { sourceRequest, sourceUpload } from "../harness/requests";
import { okJson } from "../harness/responses";

export function registerAvatarTest(): void {
    test("stores and serves only the avatar referenced by the account row", async () => {
        const harness = await createHarness();
        const upload = await okJson(
            await sourceUpload(
                harness,
                "uploadAccountAvatar",
                new File(["avatar"], "avatar.png", { type: "image/png" }),
            ),
        );
        const fileId = String(upload.avatarFileId);

        const file = await sourceRequest(harness, "getAccountAvatar", { fileId });

        expect(upload).toMatchObject({ exists: true, userId: "user-123", avatarFileId: fileId });
        expect(fileId).toStartWith("avatars/");
        expect(file.status).toBe(200);
        expect(file.headers.get("content-type")).toBe("image/png");
        expect(await file.text()).toBe("avatar");
    });
}
