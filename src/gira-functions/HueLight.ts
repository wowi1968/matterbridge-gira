import { GiraIotRestFunction } from '../iot-rest-api/index.js';
import { MatterbridgeGiraIotRestApi } from '../platformGiraIotRestApi.js';

import { MatterbridgeEndpoint, bridgedNode, extendedColorLight } from 'matterbridge';
import { LevelControlCluster, OnOffCluster, ColorControlCluster } from 'matterbridge/matter/clusters';
import { Scaler } from './Scaler.js';
import { ColorAndBrightness, ColorXy } from './ColorAndBrightness.js';

export class HueLight {
  private plugin: MatterbridgeGiraIotRestApi;
  private channel: GiraIotRestFunction;
  // private hue:number;

  constructor(plugin: MatterbridgeGiraIotRestApi, channel: GiraIotRestFunction) {
    this.plugin = plugin;
    this.channel = channel;
  }

  public async init() {
    const hueLight = new MatterbridgeEndpoint([extendedColorLight, bridgedNode], { uniqueStorageKey: 'HueLight_' + this.channel.uid }, this.plugin.config.debug as boolean);
    hueLight.log.logName = 'HueLight_' + this.channel.uid;

    hueLight
      .createDefaultIdentifyClusterServer()
      .createDefaultGroupsClusterServer()
      // .createDefaultScenesClusterServer()
      .createDefaultBridgedDeviceBasicInformationClusterServer(
        this.channel.displayName,
        'HueLight_' + this.channel.uid,
        0xfff1,
        'Gira',
        'Gira Hue Light',
        parseInt(this.plugin.version.replace(/\D/g, '')),
        this.plugin.version === '' ? 'Unknown' : this.plugin.version,
        parseInt(this.plugin.matterbridge.matterbridgeVersion.replace(/\D/g, '')),
        this.plugin.matterbridge.matterbridgeVersion,
      )
      .createDefaultOnOffClusterServer()
      .createDefaultLevelControlClusterServer()
      .createXyColorControlClusterServer()
      .createDefaultPowerSourceWiredClusterServer();

    await this.plugin.registerDevice(hueLight);

    const toMatterScaler = new Scaler(0, 100, 1, 254, (val) => Math.round(val));
    const toIotScaler = new Scaler(1, 254, 0, 100);

    const datapointOnOff = this.channel.dataPoints.find((x) => x.name == 'OnOff')?.uid ?? '';
    const datapointBrightness = this.channel.dataPoints.find((x) => x.name == 'Brightness')?.uid ?? '';
    // const datapointRGB = this.channel.dataPoints.find((x) => x.name == 'RGB')?.uid ?? '';
    const datapointxyY = this.channel.dataPoints.find((x) => x.name == 'xyY')?.uid ?? '';

    const ignoreIotEventUntil = {
      OnOff: 0,
      Brightness: 0,
    };

    hueLight.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      hueLight?.log.info(`Command identify called identifyTime:${identifyTime}`);
    });
    hueLight.addCommandHandler('on', async () => {
      // await dimmer?.setAttribute(OnOffCluster.id, 'onOff', true, dimmer?.log);
      hueLight?.log.info('Command on called');
      ignoreIotEventUntil.OnOff = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      this.plugin.iotApi.setValue(datapointOnOff, 1);
    });
    hueLight.addCommandHandler('off', async () => {
      // await dimmer?.setAttribute(OnOffCluster.id, 'onOff', false, dimmer?.log);
      hueLight?.log.info('Command off called');
      ignoreIotEventUntil.OnOff = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointOnOff, 0);
    });
    hueLight.addCommandHandler('moveToLevel', async ({ request: { level } }) => {
      // await dimmer?.setAttribute(LevelControlCluster.id, 'currentLevel', level, dimmer?.log);
      hueLight?.log.info(`Command moveToLevel called request: ${level}, channel: ${this.channel.dataPoints}`);
      ignoreIotEventUntil.Brightness = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointBrightness, toIotScaler.scale(level));
    });
    hueLight.addCommandHandler('moveToLevelWithOnOff', async ({ request }) => {
      // await dimmer?.setAttribute(LevelControlCluster.id, 'currentLevel', level, dimmer?.log);
      hueLight?.log.info(`Command moveToLevelWithOnOff called request: ${request}, level: ${request.level}, channel: ${this.channel.dataPoints}`);
      ignoreIotEventUntil.Brightness = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointBrightness, toIotScaler.scale(request.level));
    });

    hueLight?.addCommandHandler('moveToColor', async ({ request: { colorX, colorY } }) => {
      const co = new ColorAndBrightness(new ColorXy(colorX, colorY));
      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointxyY, co.raw().toString());
      hueLight?.log.info(`Command moveToColor called request: X ${colorX / 65536} Y ${colorY / 65536}`);
    });
    hueLight?.addCommandHandler('moveToColorTemperature', async ({ request: { colorTemperatureMireds } }) => {
      // await hueLight?.setAttribute(ColorControl.Cluster.id, 'colorTemperatureMireds', colorTemperatureMireds, hueLight?.log);
      hueLight?.log.info(`Command moveToColorTemperature called request: ${colorTemperatureMireds}`);
    });

    // @ts-expect-error: Object is possibly 'null'.
    this.plugin.iotApi.subscribeEvent(async (ev, evDp, evFunc) => {
      if (evFunc?.uid == this.channel?.uid) {
        switch (evDp?.name) {
          case 'Brightness': {
            const newValue = toMatterScaler.scale(Number(ev.value));
            if (Date.now() - ignoreIotEventUntil.Brightness >= 0) {
              await hueLight.setAttribute(LevelControlCluster.id, 'currentLevel', newValue, hueLight.log);
            } else {
              hueLight.log.info('Ignoring IoT REST API event Brightness', newValue);
            }
            break;
          }
          case 'OnOff': {
            if (Date.now() - ignoreIotEventUntil.OnOff >= 0) {
              if (ev.value == 1) {
                await hueLight.setAttribute(OnOffCluster.id, 'onOff', true, hueLight.log);
              } else {
                await hueLight.setAttribute(OnOffCluster.id, 'onOff', false, hueLight.log);
              }
            } else {
              hueLight.log.info('Ignoring IoT REST API event OnOff', ev.value);
            }
            break;
          }
          case 'RGB': {
            hueLight.log.info('RGB Value:' + ev.value);
            break;
          }
          case 'xyY': {
            hueLight.log.info('xyY Value:' + ev.value);
            const co = new ColorAndBrightness(BigInt(ev.value));
            // @ts-expect-error: Object is possibly 'null'.
            await hueLight.setAttribute(ColorControlCluster.id, 'currentX', co.m_color.m_x, hueLight.log);
            // @ts-expect-error: Object is possibly 'null'.
            await hueLight.setAttribute(ColorControlCluster.id, 'currentX', co.m_color.m_y, hueLight.log);
            break;
          }
        }
      }
    });
  }
}
