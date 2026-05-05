import { describe, test, expect } from "bun:test";
import DeliveryCms from "src/delivery/DeliveryCms";
import { testRunner, testMedia, testRepository } from "./helpers";

describe("DeliveryCms — basePath derivation", () => {
    test("root runner (basePath '/') exposes an empty basePath", () => {
        const delivery = new DeliveryCms({
            runner:     testRunner("/"),
            media:      testMedia(),
            repository: testRepository(),
        });
        expect(delivery.basePath).toBe("");
    });

    test("scoped runner passes its basePath through verbatim", () => {
        const delivery = new DeliveryCms({
            runner:     testRunner("/tenant-1"),
            media:      testMedia(),
            repository: testRepository(),
        });
        expect(delivery.basePath).toBe("/tenant-1");
    });

    test("scoped runner with nested basePath is returned verbatim", () => {
        const delivery = new DeliveryCms({
            runner:     testRunner("/eu/tenant-1"),
            media:      testMedia(),
            repository: testRepository(),
        });
        expect(delivery.basePath).toBe("/eu/tenant-1");
    });
});

describe("DeliveryCms — cmsPathPrefix", () => {
    test("root runner yields /.cms (the /.cms segment is always present)", () => {
        const delivery = new DeliveryCms({
            runner:     testRunner("/"),
            media:      testMedia(),
            repository: testRepository(),
        });
        expect(delivery.cmsPathPrefix).toBe("/.cms");
    });

    test("scoped runner prepends the tenant basePath", () => {
        const delivery = new DeliveryCms({
            runner:     testRunner("/tenant-1"),
            media:      testMedia(),
            repository: testRepository(),
        });
        expect(delivery.cmsPathPrefix).toBe("/tenant-1/.cms");
    });
});

describe("DeliveryCms — accessors", () => {
    test("exposes the injected runner, media and repository", () => {
        const runner     = testRunner("/");
        const media      = testMedia();
        const repository = testRepository();
        const delivery = new DeliveryCms({ runner, media, repository });

        expect(delivery.runner).toBe(runner);
        expect(delivery.media).toBe(media);
        expect(delivery.repository).toBe(repository);
    });

    test("creates its own DeliveryCache when none is provided", () => {
        const delivery = new DeliveryCms({
            runner:     testRunner("/"),
            media:      testMedia(),
            repository: testRepository(),
        });
        expect(delivery.cache).toBeDefined();
        expect(typeof delivery.cache.get).toBe("function");
    });
});
