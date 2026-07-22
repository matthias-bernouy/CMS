import { describe } from "bun:test";
import { registerCatalogTests } from "./basic-blocs/catalog";
import { registerCheckboxTest, registerChipTest } from "./basic-blocs/choices";
import { registerControlTests } from "./basic-blocs/controls";
import { registerFileInputTest } from "./basic-blocs/file-input";
import { registerLayoutTests } from "./basic-blocs/layout";

describe("basic-blocs 1.0.0", () => {
    registerCatalogTests();
    registerControlTests();
    registerLayoutTests();
    registerChipTest();
    registerFileInputTest();
    registerCheckboxTest();
});
