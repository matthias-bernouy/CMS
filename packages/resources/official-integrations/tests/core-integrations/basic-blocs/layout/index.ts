import { registerButtonTest } from "./button";
import { registerCardTest } from "./card";
import { registerContainerTest } from "./container";
import { registerGridTest } from "./grid";
import { registerNavbarTest } from "./navbar";

export function registerLayoutTests(): void {
    registerGridTest();
    registerButtonTest();
    registerCardTest();
    registerContainerTest();
    registerNavbarTest();
}
