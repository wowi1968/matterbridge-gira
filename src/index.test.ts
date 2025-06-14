import { Matterbridge, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { MatterbridgeGiraIotRestApi } from './platformGiraIotRestApi.js';
import initializePlugin from './index';
import { jest } from '@jest/globals';

describe('initializePlugin', () => {
  let mockMatterbridge: Matterbridge;
  let mockLog: AnsiLogger;
  let mockConfig: PlatformConfig;

  beforeAll(() => {
    mockMatterbridge = {
      addBridgedDevice: jest.fn(),
      matterbridgeDirectory: '',
      matterbridgePluginDirectory: 'temp',
      systemInformation: { ipv4Address: undefined },
      matterbridgeVersion: '3.0.4',
      removeAllBridgedDevices: jest.fn(),
    } as unknown as Matterbridge;
    mockLog = { fatal: jest.fn(), error: jest.fn(), warn: jest.fn(), notice: jest.fn(), info: jest.fn(), debug: jest.fn() } as unknown as AnsiLogger;
    mockConfig = {
      'name': 'matterbridge-gira',
      'type': 'DynamicPlatform',
      'unregisterOnShutdown': false,
      'debug': false,
    } as PlatformConfig;
  });

  it('should return an instance of MatterbridgeGiraIotRestApi', () => {
    const result = initializePlugin(mockMatterbridge, mockLog, mockConfig);

    expect(result).toBeInstanceOf(MatterbridgeGiraIotRestApi);
  });
});
