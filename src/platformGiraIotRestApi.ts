// import { AtLeastOne, DeviceTypeDefinition, EndpointOptions, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
// import { Matterbridge, MatterbridgeEndpoint as MatterbridgeDevice, MatterbridgeDynamicPlatform } from 'matterbridge';
import { Matterbridge, MatterbridgeDynamicPlatform, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { GiraIotRestApiConnector } from './iot-rest-api/index.js';
import { DeviceFactory } from './gira-functions/index.js';

export class MatterbridgeGiraIotRestApi extends MatterbridgeDynamicPlatform {
  private username = '';
  private password = '';
  private deviceIp = '';
  private host = '';
  private hostPort = 8888;
  iotApi: GiraIotRestApiConnector | undefined = undefined;

  // async createMutableDevice(definition: DeviceTypeDefinition | AtLeastOne<DeviceTypeDefinition>, options: EndpointOptions = {}, debug = false): Promise<MatterbridgeDevice> {
  //   let device: MatterbridgeDevice;
  //   if (this.matterbridge.edge === true) device = new MatterbridgeEndpoint(definition, options, debug) as unknown as MatterbridgeDevice;
  //   else device = new MatterbridgeDevice(definition, options, debug);
  //   return device;
  // }

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.0.1')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.0.1". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend.`,
      );
    }

    if (config.username) this.username = config.username as string;
    if (config.password) this.password = config.password as string;
    if (config.deviceIp) this.deviceIp = config.deviceIp as string;
    if (config.host) this.host = config.host as string;
    if (config.hostPort) this.hostPort = config.hostPort as number;

    this.log.info('Initializing platform:', this.config.name);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;

    this.iotApi = new GiraIotRestApiConnector({
      apiUrl: this.deviceIp,
      username: this.username,
      password: this.password,
      host: this.host,
      port: this.hostPort,
    });

    if (this.deviceIp != '') {
      await this.iotApi.connect();

      const config = this.iotApi.getConfiguration();

      if (config?.functions != undefined) {
        for (let index = 0; index < config?.functions.length; index++) {
          const element = config?.functions[index];

          DeviceFactory.create(this, element);
        }
      }
    } else {
      this.log.info("not configured");
    }
  }

   override async onConfigure() {
    await super.onConfigure();
   }

  override async onShutdown(reason?: string) {
    this.log.info('onShutdown called with reason:', reason ?? 'none');
    await this.iotApi?.close();
    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
  }
}
