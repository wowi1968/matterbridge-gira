import { GiraIotRestFunction } from '../iot-rest-api/index.js';
import { MatterbridgeGiraIotRestApi } from '../platformGiraIotRestApi.js';
import { KnxLight, Switch, Covering, HueLight } from './index.js';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DeviceFactory {
  static create(plugin: MatterbridgeGiraIotRestApi, element: GiraIotRestFunction) {
    switch (element.functionType) {
      case 'de.gira.schema.functions.KNX.Light': {
        const knxLightDevice = new KnxLight(plugin, element);
        knxLightDevice.init();
        break;
      }
      case 'de.gira.schema.functions.Switch': {
        const switchDevice = new Switch(plugin, element);
        switchDevice.init();
        break;
      }
      case 'de.gira.schema.functions.Covering': {
        const coveringDevice = new Covering(plugin, element);
        coveringDevice.init();
        break;
      }
      case 'de.gira.schema.functions.Hue.Light': {
        const hueLightDevice = new HueLight(plugin, element);
        hueLightDevice.init();
        break;
      }
    }
  }
}
