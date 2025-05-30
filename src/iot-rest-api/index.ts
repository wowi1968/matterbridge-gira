import { Hono } from 'hono';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { serve } from '@hono/node-server';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
export type GiraIotRestApiOptions = {
  apiUrl: string;
  username: string;
  password: string;
  host?: string;
  port?: number;
};

export type GiraIotRestConfig = {
  functions: GiraIotRestFunction[];
};

export type GiraIotRestChannelType =
  | 'de.gira.schema.channels.KNX.Dimmer'
  | 'de.gira.schema.channels.Switch'
  | 'de.gira.schema.channels.BlindWithPos'
  | 'de.gira.schema.channels.Hue.Light';
export type GiraIotRestFunctionType =
  | 'de.gira.schema.functions.KNX.Light'
  | 'de.gira.schema.functions.Switch'
  | 'de.gira.schema.functions.Covering'
  | 'de.gira.schema.functions.Hue.Light';

export type GiraIotRestDataPoint = {
  name: string;
  canRead: boolean;
  canEvent: boolean;
  canWrite: boolean;
  uid: string;
};

export type GiraIotRestFunction = {
  displayName: string;
  uid: string;
  dataPoints: GiraIotRestDataPoint[];
  channelType: GiraIotRestChannelType;
  functionType: GiraIotRestFunctionType;
};

export type GiraIotRestEvent = {
  uid: string;
  value: number | boolean | string;
};

export type GiraIotRestEventListener = (ev: GiraIotRestEvent, dataPoint: GiraIotRestDataPoint | undefined, func: GiraIotRestFunction | undefined) => Promise<void>;

export class GiraIotRestApiConnector {
  private options: GiraIotRestApiOptions;
  private listeners: GiraIotRestEventListener[] = [];
  private apiUrl: string;

  private clientToken: string | undefined = undefined;
  private projectUid: string | undefined = undefined;
  private config: GiraIotRestConfig | undefined = undefined;
  private server: any;

  constructor(options: GiraIotRestApiOptions) {
    this.options = {
      ...options,
    };

    let url = this.options.apiUrl;
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    this.apiUrl = url;
  }

  subscribeEvent(listener: GiraIotRestEventListener) {
    this.listeners.push(listener);
    return () => {
      const ind = this.listeners.indexOf(listener);
      if (ind >= 0) {
        this.listeners.splice(ind, 1);
      }
    };
  }

  async connect() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const options = {
      key: readFileSync(`${__dirname}/server.key`),
      cert: readFileSync(`${__dirname}/server.cert`),
    };

    const app = new Hono();

    app.post('/iot-cb', async (c) => {
      const data = await c.req.json();
      console.log('Received an iot callback', data);

      const events: GiraIotRestEvent[] = data.events;
      this.notifySubscribers(events);
      return c.json({});
    });

    app.get('/iot-set', async (c) => {
      const { uid, value } = c.req.query();
      console.log('Setting value', uid, value);
      const resp = await fetch(this.apiUrl + `/api/v2/values?token=${this.clientToken}`, {
        method: 'PUT',
        body: JSON.stringify({
          values: [
            {
              uid: uid,
              value: value,
            },
          ],
        }),
      });
      console.log('Set Response', resp.status, await resp.text());
      return c.status(200);
    });

    this.server = serve(
      {
        port: this.options.port ?? 8888,
        hostname: '0.0.0.0',
        fetch: app.fetch,
        createServer: createServer,
        serverOptions: options,
      },
      (info) => {
        console.log(`Listening on http://localhost`); // Listening on http://localhost:3000
      },
    );

    const authToken = 'Basic ' + btoa(this.options.username + ':' + this.options.password);

    const clientId = 'gira.matterbridge';
    const tokenRaw = await fetch(this.apiUrl + `/api/v2/clients`, {
      method: 'POST',
      headers: {
        'Authorization': authToken,
      },
      body: JSON.stringify({
        client: clientId,
      }),
    });
    const tokenResp = (await tokenRaw.json()) as { token: string };
    this.clientToken = tokenResp.token;

    console.log('Token response for Auth', tokenRaw.status, tokenResp.token);

    const uidRaw = await fetch(this.apiUrl + `/api/v2/uiconfig/uid?token=${tokenResp.token}`, {
      method: 'GET',
    });
    const uid = await uidRaw.json();

    const configRaw = await fetch(this.apiUrl + `/api/v2/uiconfig?expand=dataPointFlags,parameters,locations,trades&token=${tokenResp.token}`, {
      method: 'GET',
    });
    const config = <GiraIotRestConfig>await configRaw.json();

    const registerCallbackRaw = await fetch(this.apiUrl + `/api/v2/clients/${tokenResp.token}/callbacks`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(tokenResp.token),
      },
      body: JSON.stringify({
        serviceCallback: `https://${this.options.host}:${this.options.port}/iot-cb`,
        valueCallback: `https://${this.options.host}:${this.options.port}/iot-cb`,
        testCallbacks: true,
      }),
    });

    console.log('Register Callback result', registerCallbackRaw.status);
    if (registerCallbackRaw.status != 200) {
      throw new Error(`Failed to register Callback for IoT Rest API: ${registerCallbackRaw.status}, ${registerCallbackRaw.statusText}`);
    }

    this.config = config;

    this.syncInitialState();
  }

  private notifySubscribers(events: GiraIotRestEvent[]) {
    events?.forEach((ev) => {
      const evMapped = this.config?.functions.find((x) => x.dataPoints.find((y) => y.uid == ev.uid) != undefined);
      this.listeners.forEach((listener) => {
        listener(
          ev,
          evMapped?.dataPoints.find((x) => x.uid == ev.uid),
          evMapped,
        );
      });
      // console.log('Mapped event', ev.uid, evMapped);
    });
  }

  private async syncInitialState() {
    if (this.config != undefined) {
      for (let index = 0; index < this.config.functions.length; index++) {
        const element = this.config.functions[index];
        for (let indexFunc = 0; indexFunc < element.dataPoints.length; indexFunc++) {
          const elementDp = element.dataPoints[indexFunc];
          const valueRaw = await fetch(this.apiUrl + `/api/v2/values/${elementDp.uid}?token=${this.clientToken}`, {
            method: 'GET',
          });
          const value = <
            {
              values: GiraIotRestEvent[];
            }
          >await valueRaw.json();
          console.log('Syncing initial State', value.values?.[0]?.uid, value.values?.[0]?.value);
          this.notifySubscribers(value.values);
        }
      }
    }
  }

  close() {
    this.server?.close();
  }

  getConfiguration() {
    return this.config;
  }

  async setValue(uid: string, value: number | string | boolean) {
    const resp = await fetch(this.apiUrl + `/api/v2/values?token=${this.clientToken}`, {
      method: 'PUT',
      body: JSON.stringify({
        values: [
          {
            uid: uid,
            value: value,
          },
        ],
      }),
    });

    return resp.ok;
  }
}
