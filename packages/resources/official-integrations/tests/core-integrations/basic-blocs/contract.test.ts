import { describe } from "bun:test";
import { registerCatalogTests } from "./catalog";
import { registerCheckboxTest, registerChipTest } from "./choices";
import { registerControlTests } from "./controls";
import { registerFileInputTest } from "./file-input";
import { registerLayoutTests } from "./layout";
import { registerTableTests } from "./table";

describe("basic-blocs 1.0.0", () => {
    registerCatalogTests();
    registerControlTests();
    registerLayoutTests();
    registerChipTest();
    registerFileInputTest();
    registerCheckboxTest();
    registerTableTests();
});
