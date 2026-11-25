import { expect, test } from "bun:test";
import { prepareImagePublication, remoteImageIdentity } from "../../../../../infra/images/registry";
import { nativeRegistryFixture } from "./fixture";

const native = process.env.ULVIA_RUN_IMAGE_PUBLICATION === "1" ? test : test.skip;
native(
    "real Docker publication confirms its inspected identity and retries without another push",
    async () => {
        const fixture = await nativeRegistryFixture();
        try {
            const { image, transport } = fixture;
            expect(await remoteImageIdentity(image, transport.fetch)).toBeNull();
            const publication = await prepareImagePublication([image], transport);
            await expect(publication.verify()).rejects.toThrow("not published");
            await publication.publish();
            expect(fixture.pushes()).toBe(1);
            expect(await remoteImageIdentity(image, transport.fetch)).toBe(image.id);
            await (await prepareImagePublication([image], transport)).publish();
            await publication.verify();
            expect(fixture.pushes()).toBe(1);
            const changed = { ...image, id: `sha256:${"0".repeat(64)}` };
            await expect(prepareImagePublication([changed], transport)).rejects.toThrow("different content");
            expect(fixture.pushes()).toBe(1);
            console.log(`Verified real Docker image identity: ${image.id}`);
        } finally {
            await fixture.close();
        }
    },
    120_000,
);
