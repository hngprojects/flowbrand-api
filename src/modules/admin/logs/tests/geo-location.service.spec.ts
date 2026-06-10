import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GeoLocationService } from '../services/geo-location.service';

const okResponse = (body: unknown): Response =>
  ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

describe('GeoLocationService', () => {
  let service: GeoLocationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [GeoLocationService],
    }).compile();

    service = module.get<GeoLocationService>(GeoLocationService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('resolve', () => {
    it('formats a successful lookup as "Region, CC"', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(okResponse({ regionName: 'Lagos', countryCode: 'NG' }));

      await expect(service.resolve('102.89.33.21')).resolves.toBe('Lagos, NG');
    });

    it('falls back to the country code alone when the region is absent', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce(okResponse({ regionName: '-', countryCode: 'NG' }));

      await expect(service.resolve('102.89.33.21')).resolves.toBe('NG');
    });

    it('returns null and never calls fetch for a null IP', async () => {
      global.fetch = jest.fn();

      await expect(service.resolve(null)).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns null and never calls fetch for a private IP', async () => {
      global.fetch = jest.fn();

      await expect(service.resolve('192.168.0.10')).resolves.toBeNull();
      await expect(service.resolve('10.0.0.4')).resolves.toBeNull();
      await expect(service.resolve('127.0.0.1')).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns null when the provider returns no country code', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce(okResponse({ regionName: '-', countryCode: '' }));

      await expect(service.resolve('8.8.8.8')).resolves.toBeNull();
    });

    it('returns null and swallows a network error', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('network down'));

      await expect(service.resolve('8.8.8.8')).resolves.toBeNull();
    });

    it('caches a resolved IP and does not call fetch again', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(okResponse({ regionName: 'Abuja', countryCode: 'NG' }));

      await expect(service.resolve('41.58.1.1')).resolves.toBe('Abuja, NG');
      await expect(service.resolve('41.58.1.1')).resolves.toBe('Abuja, NG');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveMany', () => {
    it('deduplicates lookups and aligns results with the input order', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(okResponse({ regionName: 'Lagos', countryCode: 'NG' }));

      const result = await service.resolveMany(['9.9.9.9', null, '9.9.9.9']);

      expect(result).toEqual(['Lagos, NG', null, 'Lagos, NG']);
      // One unique routable IP means exactly one network call.
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
