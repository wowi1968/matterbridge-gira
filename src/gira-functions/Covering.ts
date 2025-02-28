import { GiraIotRestFunction } from '../iot-rest-api/index.js';
import { MatterbridgeGiraIotRestApi } from '../platformGiraIotRestApi.js';

import { MatterbridgeEndpoint, bridgedNode, WindowCovering, coverDevice, powerSource } from 'matterbridge';
import { Scaler } from './Scaler.js';

export class Covering {
  private plugin: MatterbridgeGiraIotRestApi;
  private channel: GiraIotRestFunction;

  constructor(plugin: MatterbridgeGiraIotRestApi, channel: GiraIotRestFunction) {
    this.plugin = plugin;
    this.channel = channel;
  }

  public async init() {
    const covering = new MatterbridgeEndpoint([coverDevice, bridgedNode, powerSource], { uniqueStorageKey: 'Covering_' + this.channel.uid }, this.plugin.config.debug as boolean);
    covering.log.logName = 'Covering_' + this.channel.uid;

    covering
      .createDefaultIdentifyClusterServer()
      .createDefaultGroupsClusterServer()
      // .createDefaultScenesClusterServer()
      .createDefaultBridgedDeviceBasicInformationClusterServer(
        this.channel.displayName,
        'Covering_' + this.channel.uid,
        0xfff1,
        'Gira',
        'Gira Covering',
        parseInt(this.plugin.version.replace(/\D/g, '')),
        this.plugin.version === '' ? 'Unknown' : this.plugin.version,
        parseInt(this.plugin.matterbridge.matterbridgeVersion.replace(/\D/g, '')),
        this.plugin.matterbridge.matterbridgeVersion,
      )
      .createDefaultWindowCoveringClusterServer()
      .createDefaultPowerSourceWiredClusterServer();

    await this.plugin.registerDevice(covering);

    const toMatterScaler = new Scaler(0, 100, 0, 10000, (val) => Math.round(val));
    const toIotScaler = new Scaler(0, 10000, 0, 100, (val) => Math.round(val));

    // const datapointUpDown = this.channel.dataPoints.find((x) => x.name == 'Up-Down')?.uid ?? '';
    const datapointPosition = this.channel.dataPoints.find((x) => x.name == 'Position')?.uid ?? '';

    const ignoreIotEventUntil = {
      OnOff: 0,
      Brightness: 0,
    };

    covering.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      covering?.log.info(`Command identify called identifyTime:${identifyTime}`);
    });
    covering.addCommandHandler('stopMotion', async () => {
      covering?.log.info('Command stopMotion called');
      ignoreIotEventUntil.OnOff = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      this.plugin.iotApi.setValue(datapointOnOff, 1);
    });
    covering.addCommandHandler('downOrClose', async () => {
      covering?.log.info('Command downOrClose called');
      ignoreIotEventUntil.OnOff = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointPosition, 100);
    });
    covering.addCommandHandler('upOrOpen', async () => {
      covering?.log.info('Command downOrClose called');
      ignoreIotEventUntil.OnOff = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointPosition, 0);
    });
    covering.addCommandHandler('goToLiftPercentage', async ({ request: { liftPercent100thsValue } }) => {
      covering?.log.info(`Command goToLiftPercentage called request: ${liftPercent100thsValue}, channel: ${this.channel.dataPoints}`);
      ignoreIotEventUntil.Brightness = Date.now() + 1000;
      const newValue = toIotScaler.scale(Number(liftPercent100thsValue));

      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointPosition, newValue);
    });

    // @ts-expect-error: Object is possibly 'null'.
    this.plugin.iotApi.subscribeEvent(async (ev, evDp, evFunc) => {
      if (evFunc?.uid == this.channel?.uid) {
        switch (evDp?.name) {
          case 'Movement': {
            // const newValue = toMatterScaler.scale(Number(ev.value));
            // if (Date.now() - ignoreIotEventUntil.Brightness >= 0) {
            //   await covering.setAttribute(LevelControlCluster.id, 'currentLevel', newValue, covering.log);
            // } else {
            //   covering.log.info('Ignoring IoT REST API event Brightness', newValue);
            // }
            break;
          }
          case 'Position': {
            if (Date.now() - ignoreIotEventUntil.OnOff >= 0) {
              const newValue = toMatterScaler.scale(Number(ev.value));
              await covering.setAttribute(WindowCovering.Cluster.id, 'currentPositionLiftPercent100ths', newValue, covering.log);
            } else {
              covering.log.info('Ignoring IoT REST API event Position', ev.value);
            }
            break;
          }
          case 'Slat-Position': {
            break;
          }
        }
      }
    });
  }
}
