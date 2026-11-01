import { defaultsMessages } from "./defaults";
import { servicesMessages } from "./services";
import { contextsMessages } from "./contexts";
import { fieldsMessages } from "./fields";
import { markupMessages } from "./markup";
import { configurationMessages } from "./configuration";

export const ERROR_MESSAGES = {
    ...defaultsMessages,
    ...servicesMessages,
    ...contextsMessages,
    ...fieldsMessages,
    ...markupMessages,
    ...configurationMessages,
};
export type ErrorMessageKey = keyof typeof ERROR_MESSAGES;
