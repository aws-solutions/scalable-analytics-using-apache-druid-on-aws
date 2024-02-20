const log = require('SyntheticsLogger');
const synthetics = require('Synthetics');

synthetics.setLogLevel(0);

exports.handler = async () => {
    log.debug(`Starting canary run`);

    try {
        const hostname = new URL(process.env.DRUID_ENDPOINT).hostname;

        const requestOptions = {
            hostname,
            method: 'GET',
            port: 443,
            protocol: 'https:',
        };

        const callback = async function (res) {
            log.debug(`Received response status ${res.statusCode}`);

            return new Promise((resolve, reject) => {
                if (res.statusCode === 403) {
                    // getting forbidden means the authentication (if configured) works, which also means the cluster is up and running
                    resolve('OK');
                }

                if (res.statusCode < 200 || res.statusCode > 399) {
                    reject(`${res.statusCode}  ${res.statusMessage}`);
                }

                resolve('OK');
            });
        };

        const stepConfig = {
            includeRequestHeaders: true,
            includeResponseHeaders: true,
            includeRequestBody: true,
            includeResponseBody: true,
        };

        await synthetics.executeHttpStep(
            'Verifying Druid console',
            requestOptions,
            callback,
            stepConfig
        );
    } catch (e) {
        log.error(`Canary run ended with a failure ${JSON.stringify(e)}`);
        throw e;
    }
};
