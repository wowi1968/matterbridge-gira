import { GiraIotRestFunction } from '../iot-rest-api/index.js';
import { MatterbridgeGiraIotRestApi } from '../platformGiraIotRestApi.js';

import { MatterbridgeEndpoint, bridgedNode, onOffLight } from 'matterbridge';
import { OnOffCluster } from 'matterbridge/matter/clusters';

export class Switch {
  private plugin: MatterbridgeGiraIotRestApi;
  private channel: GiraIotRestFunction;

  constructor(plugin: MatterbridgeGiraIotRestApi, channel: GiraIotRestFunction) {
    this.plugin = plugin;
    this.channel = channel;
  }

  public async init() {
    const switchDevice = new MatterbridgeEndpoint([onOffLight, bridgedNode], { uniqueStorageKey: 'Switch_' + this.channel.uid }, this.plugin.config.debug as boolean);
    switchDevice.log.logName = 'Switch_' + this.channel.uid;

    switchDevice
      .createDefaultIdentifyClusterServer()
      .createDefaultGroupsClusterServer()
      // .createDefaultScenesClusterServer()
      .createDefaultBridgedDeviceBasicInformationClusterServer(
        this.channel.displayName,
        'Switch_' + this.channel.uid,
        0xfff1,
        'Gira',
        'Gira KNX Switch',
        parseInt(this.plugin.version.replace(/\D/g, '')),
        this.plugin.version === '' ? 'Unknown' : this.plugin.version,
        parseInt(this.plugin.matterbridge.matterbridgeVersion.replace(/\D/g, '')),
        this.plugin.matterbridge.matterbridgeVersion,
      )
      .createDefaultOnOffClusterServer()
      .createDefaultPowerSourceWiredClusterServer();

    await this.plugin.registerDevice(switchDevice);

    const datapointOnOff = this.channel.dataPoints.find((x) => x.name == 'OnOff')?.uid ?? '';

    const ignoreIotEventUntil = {
      OnOff: 0,
    };

    switchDevice.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      switchDevice?.log.info(`Command identify called identifyTime:${identifyTime}`);
    });
    switchDevice.addCommandHandler('on', async () => {
      // await dimmer?.setAttribute(OnOffCluster.id, 'onOff', true, dimmer?.log);
      switchDevice?.log.info('Command on called');
      ignoreIotEventUntil.OnOff = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      this.plugin.iotApi.setValue(datapointOnOff, 1);
    });
    switchDevice.addCommandHandler('off', async () => {
      // await dimmer?.setAttribute(OnOffCluster.id, 'onOff', false, dimmer?.log);
      switchDevice?.log.info('Command off called');
      ignoreIotEventUntil.OnOff = Date.now() + 1000;
      // @ts-expect-error: Object is possibly 'null'.
      await this.plugin.iotApi.setValue(datapointOnOff, 0);
    });

    // @ts-expect-error: Object is possibly 'null'.
    this.plugin.iotApi.subscribeEvent(async (ev, evDp, evFunc) => {
      if (evFunc?.uid == this.channel?.uid) {
        switch (evDp?.name) {
          case 'OnOff': {
            if (Date.now() - ignoreIotEventUntil.OnOff >= 0) {
              if (ev.value == 1) {
                await switchDevice.setAttribute(OnOffCluster.id, 'onOff', true, switchDevice.log);
              } else {
                await switchDevice.setAttribute(OnOffCluster.id, 'onOff', false, switchDevice.log);
              }
            } else {
              switchDevice.log.info('Ignoring IoT REST API event OnOff', ev.value);
            }
            break;
          }
        }
      }
    });
  }
}
