const log = require('SyntheticsLogger');
const synthetics = require('Synthetics');

synthetics.setLogLevel(0);

exports.handler = async () => {
  log.debug(`Starting canary run`);

  try {
    const druidUrl = new URL(process.env.DRUID_ENDPOINT);
    const tempPort = druidUrl.protocol === 'https:' ? 443 : 80;

    const requestOptions = {
      hostname: druidUrl.hostname,
      method: 'GET',
      port: druidUrl.port ? druidUrl.port : tempPort,
      protocol: druidUrl.protocol,
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
