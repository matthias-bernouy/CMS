import { registerAlertTest } from "./alert";
import { registerBadgeTest } from "./badge";
import { registerInputTest } from "./input";
import { registerPaginationTest } from "./pagination";
import { registerSelectPresentationTest } from "./select-presentation";
import { registerSelectStateTest } from "./select-state";

export function registerControlTests(): void {
    registerAlertTest();
    registerBadgeTest();
    registerInputTest();
    registerPaginationTest();
    registerSelectStateTest();
    registerSelectPresentationTest();
}
