import { registerButtonTest } from "./button";
import { registerCardTest } from "./card";
import { registerGridTest } from "./grid";

export function registerLayoutTests(): void {
    registerGridTest();
    registerButtonTest();
    registerCardTest();
}
