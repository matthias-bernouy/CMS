

export interface NewInstanceConfig {

    clientID: string;

    keycloak: {
        issuer: string;
        clientID: string;
        secretID: string;
    },

    CDN: {

        assets: {
            clientID: string;
            secretID: string;
        },

        public: {
            clientID: string;
            secretID: string;
            alias: string;
        }
        
    }

}