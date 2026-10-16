import {
    BlocBehavior,
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    mountBlocBehavior,
} from "cms-content/browser/component/BlocBehavior";
import { registerBloc } from "cms-content/browser/component/BlocRuntime";

type CmsRuntimeWindow = Window & { cmsRuntime?: Record<string, unknown> };
const runtime = ((window as CmsRuntimeWindow).cmsRuntime ??= {});

Object.assign(runtime, { BlocBehavior, CMS_BLOC_FORM_CONTROL_READY_EVENT, mountBlocBehavior, registerBloc });
