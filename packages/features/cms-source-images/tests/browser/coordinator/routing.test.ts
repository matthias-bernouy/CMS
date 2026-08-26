import { test } from "bun:test";
import { runIsolatedTestFixture } from "../runIsolatedTestFixture";

test("runs bound image routing in an isolated DOM process", () => {
    runIsolatedTestFixture(new URL("./routing.fixture.ts", import.meta.url));
});
