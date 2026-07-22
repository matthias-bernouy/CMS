import type { HarnessOptions, HarnessState } from "../state.ts";

export type RouterContext = {
    options: HarnessOptions;
    state: HarnessState;
    request: Request;
    url: URL;
    method: string;
    requestBody: string;
};
