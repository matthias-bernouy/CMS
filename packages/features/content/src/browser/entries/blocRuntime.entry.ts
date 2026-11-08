import { createBlocScope, observeBlocAttributes } from "content/browser/component/Bloc";
import {
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    connectBlocFormControl,
    requestBlocFormControl,
} from "content/browser/component/BlocFormControl";
import { registerBloc } from "content/browser/component/BlocRuntime";
import { getCmsBrowserRuntime } from "content/browser/runtimeGlobal";
import { CMS_BROWSER_RUNTIME_ABI } from "content/browser/runtimeAbi";

const runtime = getCmsBrowserRuntime(window);

Object.assign(runtime, {
    CMS_BROWSER_RUNTIME_ABI,
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    connectBlocFormControl,
    requestBlocFormControl,
    createBlocScope,
    observeBlocAttributes,
    registerBloc,
});
