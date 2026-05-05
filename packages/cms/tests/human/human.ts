import { BunRunner, CompositeAuthentication, InMemoryApiTokenRepository, TokenAuthentication, TokenProvider } from "@bernouy/socle";
import { ControlCms } from "src/control/ControlCms";
import { InMemoryCmsRepository } from "src/socle/default-implementation/CmsRepository/memory";
import { InMemoryAuthentication } from "./InMemoryAuthentication";
import { InMemoryMedia } from "./InMemoryMedia";
import { InMemoryMediaServer } from "./InMemoryMediaServer";
import { HttpMedia } from "./HttpMedia";


export default function humanTest(){


    const runner = new BunRunner();
    
    const auth = new InMemoryAuthentication({
        role: "admin"
    })

    const tokens = new TokenProvider(runner, {
        inner: auth,
        repository: new InMemoryApiTokenRepository(),
        basePath: "/.auth/tokens"
    })

    const compositeAuth = new CompositeAuthentication(runner, {
        children: [
            { auth: tokens },
            { auth: auth, displayName: "base" },
        ]
    })

    runner.group(".media", (r) => {
        const mediaServer = new InMemoryMediaServer(r);
    })

    const controlCms = new ControlCms(
        runner,
        new InMemoryCmsRepository(),
        compositeAuth,
        new HttpMedia("/.media"),
        { tokensUrl: "/.auth/tokens" }
    )

    runner.start();

}


humanTest();