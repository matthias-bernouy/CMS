import { describe } from "bun:test";
import { registerUserAccountSourceTests } from "./user-account/scenarios";

describe("user-account 1.0.0 source", () => {
    registerUserAccountSourceTests();
});
