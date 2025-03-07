import { Matterbridge, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { MatterbridgeGiraIotRestApi } from './platformGiraIotRestApi.js';

/**
 * This is the standard interface for Matterbridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 * @param {Matterbridge} matterbridge - The Matterbridge instance.
 * @param {AnsiLogger} log - The logger instance.
 * @param {PlatformConfig} config - The platform configuration.
 * @returns {ExampleMatterbridgeDynamicPlatform} The initialized platform.
 */
export default function initializePlugin(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig): MatterbridgeGiraIotRestApi {
  return new MatterbridgeGiraIotRestApi(matterbridge, log, config);
}
