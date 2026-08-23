import { registerContentSectionTests } from "./contentSections";
import { registerFaqTests } from "./faq";
import { registerHeroTest } from "./hero";
import { registerSiteFooterTest } from "./siteFooter";

export function registerSectionTests(): void {
    registerContentSectionTests();
    registerFaqTests();
    registerHeroTest();
    registerSiteFooterTest();
}
