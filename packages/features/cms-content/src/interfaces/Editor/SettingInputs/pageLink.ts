import type { SettingMetadata } from "./base";

export type PageLinkSetting = SettingMetadata<"page-link", string> & {
    allowPage?: boolean;
    allowExternal?: boolean;
    allowMedia?: boolean;
};
