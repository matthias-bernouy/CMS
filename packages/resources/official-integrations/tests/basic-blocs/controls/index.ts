import { registerInputTest } from "./input";
import { registerPaginationTest } from "./pagination";
import { registerSelectPresentationTest } from "./select-presentation";
import { registerSelectStateTest } from "./select-state";

export function registerControlTests(): void {
    registerInputTest();
    registerPaginationTest();
    registerSelectStateTest();
    registerSelectPresentationTest();
}
