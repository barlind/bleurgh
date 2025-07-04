import { executePurge, getServiceIds, getDefaultKeys } from '../src/core';

// Mock fetch for end-to-end tests
global.fetch = jest.fn();

describe('End-to-End Integration Tests', () => {
  const mockFetch = global.fetch as jest.Mock;
  const mockLogger = {
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  beforeEach(() => {
    mockFetch.mockReset();
    Object.values(mockLogger).forEach(fn => fn.mockReset());

    // Clear environment variables
    delete process.env.FASTLY_TOKEN;
    delete process.env.FASTLY_DEV_SERVICE_IDS;
    delete process.env.FASTLY_TEST_SERVICE_IDS;
    delete process.env.FASTLY_PROD_SERVICE_IDS;
    delete process.env.FASTLY_DEFAULT_KEYS;
    delete process.env.FASTLY_DEV_DEFAULT_KEYS;
    delete process.env.FASTLY_TEST_DEFAULT_KEYS;
    delete process.env.FASTLY_PROD_DEFAULT_KEYS;
    delete process.env.DEV_SERVICE_IDS;
    delete process.env.SERVICE_IDS_DEV;
    delete process.env.FASTLY_SERVICES_DEV;
  });

  describe('Real-world scenarios', () => {
    test('should handle typical development workflow', async () => {
      // Setup realistic environment
      process.env.FASTLY_TOKEN = 'fastly-token-dev';
      process.env.FASTLY_DEV_SERVICE_IDS = 'dev-frontend,dev-api,dev-cdn';
      process.env.FASTLY_DEFAULT_KEYS = 'global,always,cache';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-dev-123' })
      });

      const result = await executePurge(
        ['feature-user-profile'], 
        { env: 'dev', verbose: true }, 
        mockLogger
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(mockLogger.info).toHaveBeenCalledWith('Target environment: dev');
      expect(mockLogger.info).toHaveBeenCalledWith('Service IDs (from environment variables for dev): dev-frontend, dev-api, dev-cdn');
      expect(mockLogger.info).toHaveBeenCalledWith('User keys: feature-user-profile');
      expect(mockLogger.info).toHaveBeenCalledWith('All keys to purge: global, always, cache, feature-user-profile');
      expect(mockLogger.success).toHaveBeenCalledTimes(3);
    });

    test('should handle production deployment with multiple keys', async () => {
      process.env.FASTLY_TOKEN = 'fastly-token-prod';
      process.env.FASTLY_PROD_SERVICE_IDS = 'prod-web,prod-api';
      process.env.FASTLY_DEFAULT_KEYS = 'global,always';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-prod-456' })
      });

      const result = await executePurge(
        ['release-v2.1.0', 'api-v2', 'frontend-v2'], 
        { env: 'prod' }, 
        mockLogger
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(mockLogger.info).toHaveBeenCalledWith('User keys: release-v2.1.0, api-v2, frontend-v2');
      expect(mockLogger.info).toHaveBeenCalledWith('All keys to purge: global, always, release-v2.1.0, api-v2, frontend-v2');
    });

    test('should handle emergency purge with service override', async () => {
      process.env.FASTLY_TOKEN = 'fastly-token-emergency';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'emergency-purge' })
      });

      const result = await executePurge(
        ['critical-fix', 'urgent-update', 'hotfix-123'], 
        { env: 'prod', services: 'emergency-service-1,emergency-service-2' }, 
        mockLogger
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(mockLogger.info).toHaveBeenCalledWith('Service IDs (from command line --services): emergency-service-1, emergency-service-2');
      expect(mockLogger.info).toHaveBeenCalledWith('User keys: critical-fix, urgent-update, hotfix-123');
    });

    test('should handle partial failures gracefully', async () => {
      process.env.FASTLY_TOKEN = 'fastly-token-mixed';
      process.env.FASTLY_DEV_SERVICE_IDS = 'working-service,failing-service,another-working-service';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok', id: 'success-1' })
        })
        .mockRejectedValueOnce(new Error('Service temporarily unavailable'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok', id: 'success-3' })
        });

      const result = await executePurge(
        ['mixed-scenario'], 
        { env: 'dev' }, 
        mockLogger
      );

      expect(result.success).toBe(false); // Should be false because one service failed
      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({ serviceId: 'working-service', success: true });
      expect(result.results[1]).toEqual({ 
        serviceId: 'failing-service', 
        success: false, 
        error: 'Error: Service failing-service: Service temporarily unavailable' 
      });
      expect(result.results[2]).toEqual({ serviceId: 'another-working-service', success: true });
      
      expect(mockLogger.success).toHaveBeenCalledWith('[working-service] Purged successfully (ID: success-1)');
      expect(mockLogger.error).toHaveBeenCalledWith('[failing-service] Error: Service failing-service: Service temporarily unavailable');
      expect(mockLogger.success).toHaveBeenCalledWith('[another-working-service] Purged successfully (ID: success-3)');
      expect(mockLogger.info).toHaveBeenCalledWith('Purge completed: 2/3 services successful');
    });

    test('should handle dry run for large deployment preview', async () => {
      process.env.FASTLY_TOKEN = 'fastly-token-preview';
      process.env.FASTLY_PROD_SERVICE_IDS = 'prod-web,prod-api,prod-cdn,prod-assets';
      process.env.FASTLY_DEFAULT_KEYS = 'global,always';

      const result = await executePurge(
        ['major-release-v3.0.0', 'ui-overhaul', 'api-redesign', 'cache-restructure'], 
        { env: 'prod', dryRun: true }, 
        mockLogger
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(4);
      expect(mockLogger.warn).toHaveBeenCalledWith('DRY RUN MODE - No actual purging will occur');
      expect(mockLogger.info).toHaveBeenCalledWith('[prod-web] Would purge keys: global, always, major-release-v3.0.0, ui-overhaul, api-redesign, cache-restructure');
      expect(mockLogger.info).toHaveBeenCalledWith('Dry run completed. Would have attempted to purge keys from 4 services.');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should handle numerical cache keys in real-world scenario', async () => {
      // Simulate a content management system using numerical IDs
      process.env.FASTLY_TOKEN = 'fastly-token-cms';
      process.env.FASTLY_DEV_SERVICE_IDS = 'cms-frontend,cms-api';
      process.env.FASTLY_DEFAULT_KEYS = 'global,always';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-numerical' })
      });

      const result = await executePurge(
        ['123456', '789012', '999'], // Numerical content/user IDs
        { env: 'dev' }, 
        mockLogger
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(mockLogger.info).toHaveBeenCalledWith('User keys: 123456, 789012, 999');
      expect(mockLogger.info).toHaveBeenCalledWith('All keys to purge: global, always, 123456, 789012, 999');
      
      // Verify each service was called with the correct keys
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fastly.com/service/cms-frontend/purge',
        expect.objectContaining({
          body: JSON.stringify({
            surrogate_keys: ['global', 'always', '123456', '789012', '999']
          })
        })
      );
    });
  });

  describe('Environment configuration edge cases', () => {
    test('should handle environment variable priority correctly', async () => {
      // Set multiple environment variables to test priority
      process.env.FASTLY_DEV_SERVICE_IDS = 'primary-service';
      process.env.FASTLY_DEVSERVICE_IDS = 'secondary-service';
      process.env.DEV_SERVICE_IDS = 'tertiary-service';
      process.env.SERVICE_IDS_DEV = 'quaternary-service';

      const serviceIds = getServiceIds('dev');
      expect(serviceIds).toEqual(['primary-service']);
    });

    test('should handle complex service ID configurations', async () => {
      process.env.FASTLY_TOKEN = 'complex-token';
      process.env.FASTLY_DEV_SERVICE_IDS = 'svc-1,svc-2,svc-3,svc-4,svc-5';
      process.env.FASTLY_DEFAULT_KEYS = 'global,always,common,shared,universal';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'complex-purge' })
      });

      const result = await executePurge(
        ['user-key', 'session-key', 'feature-key'], 
        { env: 'dev' }, 
        mockLogger
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(5);
      expect(mockLogger.info).toHaveBeenCalledWith('User keys: user-key, session-key, feature-key');
      expect(mockLogger.info).toHaveBeenCalledWith('All keys to purge: global, always, common, shared, universal, user-key, session-key, feature-key');
    });

    test('should handle whitespace and empty values in environment variables', async () => {
      process.env.FASTLY_DEV_SERVICE_IDS = ' service-1 , , service-2 ,   , service-3 ';
      process.env.FASTLY_DEFAULT_KEYS = ' key1 , , key2 ,   , key3 ';

      const serviceIds = getServiceIds('dev');
      const defaultKeys = getDefaultKeys();

      expect(serviceIds).toEqual(['service-1', 'service-2', 'service-3']);
      expect(defaultKeys).toEqual(['key1', 'key2', 'key3']);
    });
  });

  describe('Real API error scenarios', () => {
    test('should handle authentication errors', async () => {
      process.env.FASTLY_TOKEN = 'invalid-token';
      process.env.FASTLY_DEV_SERVICE_IDS = 'test-service';

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API token')
      });

      const result = await executePurge(['test-key'], { env: 'dev' }, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('[test-service] Error: Service test-service: HTTP 401: Unauthorized - Invalid API token');
    });

    test('should handle rate limiting', async () => {
      process.env.FASTLY_TOKEN = 'rate-limited-token';
      process.env.FASTLY_DEV_SERVICE_IDS = 'test-service';

      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve('Rate limit exceeded')
      });

      const result = await executePurge(['test-key'], { env: 'dev' }, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('[test-service] Error: Service test-service: HTTP 429: Too Many Requests - Rate limit exceeded');
    });

    test('should handle service not found', async () => {
      process.env.FASTLY_TOKEN = 'valid-token';
      process.env.FASTLY_DEV_SERVICE_IDS = 'non-existent-service';

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Service not found')
      });

      const result = await executePurge(['test-key'], { env: 'dev' }, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('[non-existent-service] Error: Service non-existent-service: HTTP 404: Not Found - Service not found');
    });

    test('should handle network connectivity issues', async () => {
      process.env.FASTLY_TOKEN = 'valid-token';
      process.env.FASTLY_DEV_SERVICE_IDS = 'test-service';

      mockFetch.mockRejectedValue(new Error('fetch failed'));

      const result = await executePurge(['test-key'], { env: 'dev' }, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('[test-service] Error: Service test-service: fetch failed');
    });
  });

  describe('Performance and concurrency', () => {
    test('should handle concurrent purges across multiple services', async () => {
      process.env.FASTLY_TOKEN = 'concurrent-token';
      process.env.FASTLY_DEV_SERVICE_IDS = 'svc-1,svc-2,svc-3,svc-4';

      // Simulate all services responding successfully
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'concurrent-purge' })
      });

      const result = await executePurge(['concurrent-test'], { env: 'dev' }, mockLogger);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(4);
      expect(mockLogger.info).toHaveBeenCalledWith('Purge completed: 4/4 services successful');
      
      // Verify all services were called concurrently
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});
