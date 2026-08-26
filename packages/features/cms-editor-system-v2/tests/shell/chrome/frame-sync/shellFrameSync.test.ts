import { test } from "bun:test";
import { runIsolatedTestFixture } from "../../support/runIsolatedTestFixture";

test("runs Shell frame synchronization in an isolated DOM process", () => {
    runIsolatedTestFixture(new URL("./shellFrameSync.fixture.ts", import.meta.url));
});
