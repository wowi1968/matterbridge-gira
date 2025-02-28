import { GiraIotRestFunction } from '../iot-rest-api/index.js';
import { MatterbridgeGiraIotRestApi } from '../platformGiraIotRestApi.js';

import { MatterbridgeEndpoint, LevelControlCluster, OnOffCluster, bridgedNode, dimmableLight } from 'matterbridge';
import { Scaler } from './Scaler.js';

export class KnxLight {
  private plugin: MatterbridgeGiraIotRestApi;
  private channel: GiraIotRestFunction;

  constructor(plugin: MatterbridgeGiraIotRestApi, channel: GiraIotRestFunction) {
    this.plugin = plugin;
    this.channel = channel;
  }

  public async init() {
    const dimmer = new MatterbridgeEndpoint([dimmableLight, bridgedNode], { uniqueStorageKey: 'KnxLight_' + this.channel.uid }, this.plugin.config.debug as boolean);
    dimmer.log.logName = 'KnxLight_' + this.channel.uid;

    dimmer
      .createDefaultIdentifyClusterServer()
      .createDefaultGroupsClusterServer()
      // .createDefaultScenesClusterServer()
      .createDefaultBridgedDeviceBasicInformationClusterServer(
        this.channel.displayName,
        'KnxLight_' + this.channel.uid,
        0xfff1,
        'Gira',
        'Gira KNX Light',
        parseInt(this.plugin.version.replace(/\D/g, '')),
        this.plugin.version === '' ? 'Unknown' : this.plugin.version,
        parseInt(this.plugin.matterbridge.matterbridgeVersion.replace(/\D/g, '')),
        this.plugin.matterbridge.matterbridgeVersion,
      )
      .createDefaultOnOffClusterServer()
      .createDefaultLevelControlClusterServer()
      .createDefaultPowerSourceWiredClusterServer();

    await this.plugin.registerDevice(dimmer);

    const toMatterScaler = new Scaler(0, 100, 1, 254, (val) => Math.round(val));
    const toIotScaler = new Scaler(1, 254, 0, 100);

    const datapointOnOff = this.channel.dataPoints.find((x) => x.name == 'OnOff')?.uid ?? '';
    const datapointBrightness = this.channel.dataPoints.find((x) => x.name == 'Brightness')?.uid ?? '';

    const ignoreIotEventUntil = {
      OnOff: 0,
      Brightness: 0,
    };

    dimmer.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      dimmer?.log.info(`Command identify called identifyTime:${identifyTime}`);
    });
    dimmer.addCommandHandler('on', async () => {
      // await dimmer?.setAttribute(OnOffCluster.id, 'onOff', true, dimmer?.log);
      dimmer?.log.info('Command on called');
      ignoreIotEventUntil.OnOff = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      this.plugin.iotApi.setValue(datapointOnOff, 1);
    });
    dimmer.addCommandHandler('off', async () => {
      // await dimmer?.setAttribute(OnOffCluster.id, 'onOff', false, dimmer?.log);
      dimmer?.log.info('Command off called');
      ignoreIotEventUntil.OnOff = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointOnOff, 0);
    });
    dimmer.addCommandHandler('moveToLevel', async ({ request: { level } }) => {
      // await dimmer?.setAttribute(LevelControlCluster.id, 'currentLevel', level, dimmer?.log);
      dimmer?.log.info(`Command moveToLevel called request: ${level}, channel: ${this.channel.dataPoints}`);
      ignoreIotEventUntil.Brightness = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointBrightness, toIotScaler.scale(level));
    });
    dimmer.addCommandHandler('moveToLevelWithOnOff', async ({ request }) => {
      // await dimmer?.setAttribute(LevelControlCluster.id, 'currentLevel', level, dimmer?.log);
      dimmer?.log.info(`Command moveToLevelWithOnOff called request: ${request}, level: ${request.level}, channel: ${this.channel.dataPoints}`);
      ignoreIotEventUntil.Brightness = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointBrightness, toIotScaler.scale(request.level));
    });

    // @ts-expect-error: Object is possibly 'null'.
    this.plugin.iotApi.subscribeEvent(async (ev, evDp, evFunc) => {
      if (evFunc?.uid == this.channel?.uid) {
        switch (evDp?.name) {
          case 'Brightness': {
            const newValue = toMatterScaler.scale(Number(ev.value));
            if (Date.now() - ignoreIotEventUntil.Brightness >= 0) {
              await dimmer.setAttribute(LevelControlCluster.id, 'currentLevel', newValue, dimmer.log);
            } else {
              dimmer.log.info('Ignoring IoT REST API event Brightness', newValue);
            }
            break;
          }
          case 'OnOff': {
            if (Date.now() - ignoreIotEventUntil.OnOff >= 0) {
              if (ev.value == 1) {
                await dimmer.setAttribute(OnOffCluster.id, 'onOff', true, dimmer.log);
              } else {
                await dimmer.setAttribute(OnOffCluster.id, 'onOff', false, dimmer.log);
              }
            } else {
              dimmer.log.info('Ignoring IoT REST API event OnOff', ev.value);
            }
            break;
          }
        }
      }
    });
  }
}
