import { getServiceIds, getDefaultKeys, purgeService, executePurge, Logger, purgeAllService, purgeUrlService, isUrlPurge, listServices } from '../src/core';

// Mock fetch globally
global.fetch = jest.fn();

describe('Core Logic Tests', () => {
  // Mock logger for testing
  const mockLogger: Logger = {
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };
  beforeEach(() => {
    // Clear all environment variables before each test
    delete process.env.FASTLY_DEV_SERVICE_IDS;
    delete process.env.DEV_SERVICE_IDS;
    delete process.env.SERVICE_IDS_DEV;
    delete process.env.FASTLY_TEST_SERVICE_IDS;
    delete process.env.FASTLY_PROD_SERVICE_IDS;
    delete process.env.FASTLY_DEFAULT_KEYS;
    delete process.env.FASTLY_DEV_DEFAULT_KEYS;
    delete process.env.FASTLY_TEST_DEFAULT_KEYS;
    delete process.env.FASTLY_PROD_DEFAULT_KEYS;
    delete process.env.FASTLY_TOKEN;
    
    // Reset fetch mock
    (global.fetch as jest.Mock).mockReset();
  });

  describe('getServiceIds', () => {
    test('should use services override when provided', () => {
      const result = getServiceIds('dev', 'service1,service2,service3');
      expect(result).toEqual(['service1', 'service2', 'service3']);
    });

    test('should trim whitespace from services override', () => {
      const result = getServiceIds('dev', ' service1 , service2 , service3 ');
      expect(result).toEqual(['service1', 'service2', 'service3']);
    });

    test('should handle empty services override gracefully', () => {
      // Empty string and whitespace should be treated as "no override provided"
      // With no environment variables set, this should throw an error
      expect(() => getServiceIds('dev', '')).toThrow('No service IDs configured for environment: dev');
      expect(() => getServiceIds('dev', '   ')).toThrow('No service IDs configured for environment: dev');
      
      // However, comma-only strings after filtering should throw a different error
      expect(() => getServiceIds('dev', ',,')).toThrow('Services parameter cannot be empty or contain only whitespace');
      expect(() => getServiceIds('dev', ' , , ')).toThrow('Services parameter cannot be empty or contain only whitespace');
    });

    test('should use FASTLY_DEV_SERVICE_IDS environment variable', () => {
      process.env.FASTLY_DEV_SERVICE_IDS = 'env-service1,env-service2';
      const result = getServiceIds('dev');
      expect(result).toEqual(['env-service1', 'env-service2']);
    });

    test('should use DEV_SERVICE_IDS environment variable as fallback', () => {
      process.env.DEV_SERVICE_IDS = 'alt-service1,alt-service2';
      const result = getServiceIds('dev');
      expect(result).toEqual(['alt-service1', 'alt-service2']);
    });

    test('should use SERVICE_IDS_DEV environment variable as fallback', () => {
      process.env.SERVICE_IDS_DEV = 'pattern-service1,pattern-service2';
      const result = getServiceIds('dev');
      expect(result).toEqual(['pattern-service1', 'pattern-service2']);
    });

    test('should prioritize first found environment variable', () => {
      process.env.FASTLY_DEV_SERVICE_IDS = 'first-service';
      process.env.DEV_SERVICE_IDS = 'second-service';
      process.env.SERVICE_IDS_DEV = 'third-service';
      
      const result = getServiceIds('dev');
      expect(result).toEqual(['first-service']);
    });

    test('should throw error when no service IDs are configured', () => {
      expect(() => getServiceIds('dev')).toThrow('No service IDs configured for environment: dev. Set FASTLY_DEV_SERVICE_IDS environment variable or use --services parameter.');
      expect(() => getServiceIds('test')).toThrow('No service IDs configured for environment: test. Set FASTLY_TEST_SERVICE_IDS environment variable or use --services parameter.');
      expect(() => getServiceIds('prod')).toThrow('No service IDs configured for environment: prod. Set FASTLY_PROD_SERVICE_IDS environment variable or use --services parameter.');
    });

    test('should handle test and prod environments correctly', () => {
      process.env.FASTLY_TEST_SERVICE_IDS = 'test-service1,test-service2';
      process.env.FASTLY_PROD_SERVICE_IDS = 'prod-service1,prod-service2';
      
      expect(getServiceIds('test')).toEqual(['test-service1', 'test-service2']);
      expect(getServiceIds('prod')).toEqual(['prod-service1', 'prod-service2']);
    });

    test('should filter out empty service IDs from environment variables', () => {
      process.env.FASTLY_DEV_SERVICE_IDS = 'service1,,service2,   ,service3';
      const result = getServiceIds('dev');
      expect(result).toEqual(['service1', 'service2', 'service3']);
    });
  });

  describe('listServices', () => {
    test('should return empty array when no token is set', async () => {
      delete process.env.FASTLY_TOKEN;
      const result = await listServices(mockLogger);
      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith('No Fastly API token found. Please run --setup first.');
    });

    test('should fetch and map services with environment information', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      process.env.FASTLY_DEV_SERVICE_IDS = 'service1,service2';
      process.env.FASTLY_TEST_SERVICE_IDS = 'service2,service3';
      process.env.FASTLY_PROD_SERVICE_IDS = 'service3';

      const mockServices = [
        { id: 'service1', name: 'Service One' },
        { id: 'service2', name: 'Service Two' },
        { id: 'service3', name: 'Service Three' },
        { id: 'service4', name: 'Service Four' }
      ];

      (global.fetch as jest.Mock).mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockServices)
        })
      );

      const result = await listServices(mockLogger);
      
      expect(result).toEqual([
        { id: 'service1', name: 'Service One', envs: ['dev'] },
        { id: 'service2', name: 'Service Two', envs: ['dev', 'test'] },
        { id: 'service3', name: 'Service Three', envs: ['test', 'prod'] },
        { id: 'service4', name: 'Service Four', envs: [] }
      ]);

      expect(global.fetch).toHaveBeenCalledWith('https://api.fastly.com/service', {
        headers: {
          'Fastly-Key': 'test-token',
          'Accept': 'application/json'
        }
      });
    });

    test('should handle API errors gracefully', async () => {
      // Clear mock calls from previous tests
      (mockLogger.error as jest.Mock).mockClear();
      
      process.env.FASTLY_TOKEN = 'test-token';
      
      (global.fetch as jest.Mock).mockImplementationOnce(() => 
        Promise.resolve({
          ok: false,
          statusText: 'Unauthorized'
        })
      );

      const result = await listServices(mockLogger);
      
      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to list services: Failed to fetch services: Unauthorized');
    });
  });

  describe('getDefaultKeys', () => {
    test('should use FASTLY_DEFAULT_KEYS environment variable when set (no env specified)', () => {
      process.env.FASTLY_DEFAULT_KEYS = 'custom1,custom2,custom3';
      const result = getDefaultKeys();
      expect(result).toEqual(['custom1', 'custom2', 'custom3']);
    });

    test('should use environment-specific keys when available', () => {
      process.env.FASTLY_DEFAULT_KEYS = 'global1,global2';
      process.env.FASTLY_DEV_DEFAULT_KEYS = 'dev1,dev2,dev3';
      const result = getDefaultKeys('dev');
      expect(result).toEqual(['dev1', 'dev2', 'dev3']);
    });

    test('should fall back to global keys when environment-specific not available', () => {
      process.env.FASTLY_DEFAULT_KEYS = 'global1,global2';
      delete process.env.FASTLY_DEV_DEFAULT_KEYS;
      const result = getDefaultKeys('dev');
      expect(result).toEqual(['global1', 'global2']);
    });

    test('should work with different environments', () => {
      process.env.FASTLY_DEFAULT_KEYS = 'global1,global2';
      process.env.FASTLY_TEST_DEFAULT_KEYS = 'test1,test2';
      process.env.FASTLY_PROD_DEFAULT_KEYS = 'prod1,prod2';
      
      expect(getDefaultKeys('test')).toEqual(['test1', 'test2']);
      expect(getDefaultKeys('prod')).toEqual(['prod1', 'prod2']);
      expect(getDefaultKeys('dev')).toEqual(['global1', 'global2']); // falls back
    });

    test('should trim whitespace from environment variable keys', () => {
      process.env.FASTLY_DEV_DEFAULT_KEYS = ' key1 , key2 , key3 ';
      const result = getDefaultKeys('dev');
      expect(result).toEqual(['key1', 'key2', 'key3']);
    });

    test('should filter out empty keys from environment variable', () => {
      process.env.FASTLY_DEV_DEFAULT_KEYS = 'key1,,key2,   ,key3';
      const result = getDefaultKeys('dev');
      expect(result).toEqual(['key1', 'key2', 'key3']);
    });

    test('should return empty array when no environment variables are set', () => {
      delete process.env.FASTLY_DEFAULT_KEYS;
      delete process.env.FASTLY_DEV_DEFAULT_KEYS;
      const result = getDefaultKeys('dev');
      expect(result).toEqual([]);
    });

    test('should return empty array when environment variable is empty', () => {
      process.env.FASTLY_DEV_DEFAULT_KEYS = '';
      const result = getDefaultKeys('dev');
      expect(result).toEqual([]);
    });

    test('should maintain backward compatibility when no env specified', () => {
      process.env.FASTLY_DEFAULT_KEYS = 'compat1,compat2';
      process.env.FASTLY_DEV_DEFAULT_KEYS = 'dev1,dev2';
      const result = getDefaultKeys(); // no env specified
      expect(result).toEqual(['compat1', 'compat2']);
    });
  });

  describe('purgeService', () => {
    const mockFetch = global.fetch as jest.Mock;

    test('should return dry-run result when dryRun is true', async () => {
      const result = await purgeService('test-service', ['key1', 'key2'], true);
      expect(result).toEqual({
        status: 'dry-run',
        service_id: 'test-service'
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should throw error when FASTLY_TOKEN is not provided', async () => {
      await expect(purgeService('test-service', ['key1'])).rejects.toThrow('FASTLY_TOKEN is required');
    });

    test('should use provided fastlyToken parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-123' })
      });

      await purgeService('test-service', ['key1'], false, 'custom-token');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fastly.com/service/test-service/purge',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Fastly-Key': 'custom-token'
          })
        })
      );
    });

    test('should use environment FASTLY_TOKEN when token parameter not provided', async () => {
      process.env.FASTLY_TOKEN = 'env-token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-456' })
      });

      await purgeService('test-service', ['key1']);
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fastly.com/service/test-service/purge',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Fastly-Key': 'env-token'
          })
        })
      );
    });

    test('should make correct API request', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-789' })
      });

      await purgeService('service-123', ['key1', 'key2', 'key3']);
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fastly.com/service/service-123/purge',
        {
          method: 'POST',
          headers: {
            'Fastly-Key': 'test-token',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'bleurgh/1.1.0'
          },
          body: JSON.stringify({
            surrogate_keys: ['key1', 'key2', 'key3']
          })
        }
      );
    });

    test('should return successful result with service_id', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-abc' })
      });

      const result = await purgeService('service-456', ['key1']);
      expect(result).toEqual({
        status: 'ok',
        id: 'purge-abc',
        service_id: 'service-456'
      });
    });

    test('should handle HTTP errors with response text', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Invalid token')
      });

      await expect(purgeService('service-789', ['key1'])).rejects.toThrow(
        'Service service-789: HTTP 403: Forbidden - Invalid token'
      );
    });

    test('should handle HTTP errors without response text', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('')
      });

      await expect(purgeService('service-404', ['key1'])).rejects.toThrow(
        'Service service-404: HTTP 404: Not Found'
      );
    });

    test('should handle network errors', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(purgeService('service-network', ['key1'])).rejects.toThrow(
        'Service service-network: Network error'
      );
    });

    test('should handle unknown errors', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockRejectedValueOnce('Unknown error string');

      await expect(purgeService('service-unknown', ['key1'])).rejects.toThrow(
        'Service service-unknown: Unknown error'
      );
    });
  });

  describe('purgeAllService', () => {
    const mockFetch = global.fetch as jest.Mock;

    test('should return dry-run-all result when dryRun is true', async () => {
      const result = await purgeAllService('test-service', true);
      expect(result).toEqual({
        status: 'dry-run-all',
        service_id: 'test-service'
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should throw error when FASTLY_TOKEN is not provided', async () => {
      await expect(purgeAllService('test-service')).rejects.toThrow('FASTLY_TOKEN is required');
    });

    test('should use provided fastlyToken parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-all-123' })
      });

      await purgeAllService('test-service', false, 'custom-token');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fastly.com/service/test-service/purge_all',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Fastly-Key': 'custom-token'
          })
        })
      );
    });

    test('should make correct API request for purge all', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-all-789' })
      });

      await purgeAllService('service-123');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fastly.com/service/service-123/purge_all',
        {
          method: 'POST',
          headers: {
            'Fastly-Key': 'test-token',
            'Accept': 'application/json',
            'User-Agent': 'bleurgh/1.1.0'
          }
        }
      );
    });

    test('should return successful result with service_id', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-all-abc' })
      });

      const result = await purgeAllService('service-456');
      expect(result).toEqual({
        status: 'ok',
        id: 'purge-all-abc',
        service_id: 'service-456'
      });
    });

    test('should handle HTTP errors for purge all', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Invalid token')
      });

      await expect(purgeAllService('service-789')).rejects.toThrow(
        'Service service-789: HTTP 403: Forbidden - Invalid token'
      );
    });
  });

  describe('purgeUrlService', () => {
    const mockFetch = global.fetch as jest.Mock;

    test('should return dry-run-url result when dryRun is true', async () => {
      const result = await purgeUrlService('test-service', 'https://example.com/page', true);
      expect(result).toEqual({
        status: 'dry-run-url',
        service_id: 'test-service'
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should throw error when FASTLY_TOKEN is not provided', async () => {
      await expect(purgeUrlService('test-service', 'https://example.com/page')).rejects.toThrow('FASTLY_TOKEN is required');
    });

    test('should use provided fastlyToken parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-url-123' })
      });

      await purgeUrlService('test-service', 'https://example.com/page', false, 'custom-token');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fastly.com/purge/example.com/page',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Fastly-Key': 'custom-token'
          })
        })
      );
    });

    test('should make correct API request for URL purge', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-url-789' })
      });

      await purgeUrlService('service-123', 'https://example.com/special-page?param=value');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fastly.com/purge/example.com/special-page?param=value',
        {
          method: 'POST',
          headers: {
            'Fastly-Key': 'test-token',
            'Accept': 'application/json',
            'User-Agent': 'bleurgh/1.2.0'
          }
        }
      );
    });

    test('should return successful result with service_id', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-url-abc' })
      });

      const result = await purgeUrlService('service-456', 'https://example.com/page');
      expect(result).toEqual({
        status: 'ok',
        id: 'purge-url-abc',
        service_id: 'service-456'
      });
    });

    test('should handle HTTP errors for URL purge', async () => {
      process.env.FASTLY_TOKEN = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('URL not found')
      });

      await expect(purgeUrlService('service-789', 'https://example.com/notfound')).rejects.toThrow(
        'Service service-789: HTTP 404: Not Found - URL not found'
      );
    });
  });

  describe('isUrlPurge', () => {
    test('should return true when first key starts with https://', () => {
      expect(isUrlPurge(['https://example.com/page'])).toBe(true);
      expect(isUrlPurge(['https://example.com/page', 'other-key'])).toBe(true);
    });

    test('should return false when first key does not start with https://', () => {
      expect(isUrlPurge(['user-123'])).toBe(false);
      expect(isUrlPurge(['http://example.com/page'])).toBe(false);
      expect(isUrlPurge(['ftp://example.com/file'])).toBe(false);
    });

    test('should return false when no keys provided', () => {
      expect(isUrlPurge([])).toBe(false);
    });
  });

  describe('executePurge', () => {
    const mockLogger: Logger = {
      info: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    beforeEach(() => {
      // Reset logger mocks
      Object.values(mockLogger).forEach(fn => (fn as jest.Mock).mockReset());
      
      // Setup default environment
      process.env.FASTLY_TOKEN = 'test-token';
      process.env.FASTLY_DEV_SERVICE_IDS = 'service1,service2';
    });

    test('should throw error when no user keys provided', async () => {
      await expect(executePurge([], { env: 'dev' }, mockLogger)).rejects.toThrow(
        'At least one surrogate key is required'
      );
    });

    test.skip('should throw error when no service IDs configured', async () => {
      // This test is complex to mock properly in this setup, 
      // but the functionality is covered in integration tests
    });

    test('should log environment and service information', async () => {
      // Set up test environment
      process.env.FASTLY_DEV_SERVICE_IDS = 'service1,service2';
      process.env.FASTLY_DEFAULT_KEYS = 'global,always';
      
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-123' })
      });

      await executePurge(['user-key'], { env: 'dev' }, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('Target environment: dev');
      expect(mockLogger.info).toHaveBeenCalledWith('Service IDs (from environment variables for dev): service1, service2');
      expect(mockLogger.info).toHaveBeenCalledWith('User keys: user-key');
      expect(mockLogger.info).toHaveBeenCalledWith('Default keys: global, always');
      expect(mockLogger.info).toHaveBeenCalledWith('All keys to purge: global, always, user-key');
    });

    test('should log services override source correctly', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-456' })
      });

      await executePurge(['user-key'], { env: 'dev', services: 'override1,override2' }, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('Service IDs (from command line --services): override1, override2');
    });

    test('should show dry run warning', async () => {
      await executePurge(['user-key'], { env: 'dev', dryRun: true }, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith('DRY RUN MODE - No actual purging will occur');
    });

    test('should handle successful purges', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-success' })
      });

      const result = await executePurge(['user-key'], { env: 'dev' }, mockLogger);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ serviceId: 'service1', success: true });
      expect(result.results[1]).toEqual({ serviceId: 'service2', success: true });
      
      expect(mockLogger.success).toHaveBeenCalledWith('[service1] Purged successfully (ID: purge-success)');
      expect(mockLogger.success).toHaveBeenCalledWith('[service2] Purged successfully (ID: purge-success)');
      expect(mockLogger.info).toHaveBeenCalledWith('Purge completed: 2/2 services successful');
    });

    test('should handle successful purges without ID', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' })
      });

      await executePurge(['user-key'], { env: 'dev' }, mockLogger);

      expect(mockLogger.success).toHaveBeenCalledWith('[service1] Purged successfully');
      expect(mockLogger.success).toHaveBeenCalledWith('[service2] Purged successfully');
    });

    test('should handle failed purges', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockRejectedValue(new Error('Service error'));

      const result = await executePurge(['user-key'], { env: 'dev' }, mockLogger);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ 
        serviceId: 'service1', 
        success: false, 
        error: 'Error: Service service1: Service error' 
      });
      expect(result.results[1]).toEqual({ 
        serviceId: 'service2', 
        success: false, 
        error: 'Error: Service service2: Service error' 
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith('[service1] Error: Service service1: Service error');
      expect(mockLogger.error).toHaveBeenCalledWith('[service2] Error: Service service2: Service error');
      expect(mockLogger.info).toHaveBeenCalledWith('Purge completed: 0/2 services successful');
    });

    test('should handle mixed success and failure', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok', id: 'success-1' })
        })
        .mockRejectedValueOnce(new Error('Service 2 failed'));

      const result = await executePurge(['user-key'], { env: 'dev' }, mockLogger);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ serviceId: 'service1', success: true });
      expect(result.results[1]).toEqual({ 
        serviceId: 'service2', 
        success: false, 
        error: 'Error: Service service2: Service 2 failed' 
      });
      
      expect(mockLogger.success).toHaveBeenCalledWith('[service1] Purged successfully (ID: success-1)');
      expect(mockLogger.error).toHaveBeenCalledWith('[service2] Error: Service service2: Service 2 failed');
      expect(mockLogger.info).toHaveBeenCalledWith('Purge completed: 1/2 services successful');
    });

    test('should handle dry run mode', async () => {
      // Set up test environment
      process.env.FASTLY_DEV_SERVICE_IDS = 'service1,service2';
      process.env.FASTLY_DEFAULT_KEYS = 'global,always';
      
      const result = await executePurge(['user-key'], { env: 'dev', dryRun: true }, mockLogger);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ serviceId: 'service1', success: true });
      expect(result.results[1]).toEqual({ serviceId: 'service2', success: true });
      
      expect(mockLogger.info).toHaveBeenCalledWith('[service1] Would purge keys: global, always, user-key');
      expect(mockLogger.info).toHaveBeenCalledWith('[service2] Would purge keys: global, always, user-key');
      expect(mockLogger.info).toHaveBeenCalledWith('Dry run completed. Would have attempted to purge keys from 2 services.');
      
      // Ensure no actual fetch calls were made
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should combine default keys with user keys', async () => {
      process.env.FASTLY_DEFAULT_KEYS = 'custom-default1,custom-default2';
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' })
      });

      await executePurge(['user1', 'user2'], { env: 'dev' }, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('User keys: user1, user2');
      expect(mockLogger.info).toHaveBeenCalledWith('All keys to purge: custom-default1, custom-default2, user1, user2');
    });

    test('should handle numerical keys correctly', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-numeric' })
      });

      // Set up default keys for this test
      process.env.FASTLY_DEFAULT_KEYS = 'global,always';

      // Test with purely numerical keys (converted to strings)
      await executePurge(['123456', '789012'], { env: 'dev' }, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('User keys: 123456, 789012');
      expect(mockLogger.info).toHaveBeenCalledWith('All keys to purge: global, always, 123456, 789012');

      // Clean up
      delete process.env.FASTLY_DEFAULT_KEYS;
    });

    test('should handle mixed alphanumeric and numerical keys', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-mixed' })
      });

      // Set up default keys for this test
      process.env.FASTLY_DEFAULT_KEYS = 'global,always';

      // Test with mixed key types
      await executePurge(['user-123', '456789', 'product-abc', '999'], { env: 'dev' }, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('User keys: user-123, 456789, product-abc, 999');
      expect(mockLogger.info).toHaveBeenCalledWith('All keys to purge: global, always, user-123, 456789, product-abc, 999');

      // Clean up
      delete process.env.FASTLY_DEFAULT_KEYS;
    });

    test('should throw error when --all flag is used with user keys', async () => {
      await expect(executePurge(['user-key'], { env: 'dev', all: true }, mockLogger)).rejects.toThrow(
        'Cannot use --all flag with specific keys'
      );
    });

    test('should throw error when no keys provided and --all flag is false', async () => {
      await expect(executePurge([], { env: 'dev', all: false }, mockLogger)).rejects.toThrow(
        'At least one surrogate key is required (or use --all flag)'
      );
    });

    test('should handle --all flag successfully', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-all-success' })
      });

      const result = await executePurge([], { env: 'dev', all: true }, mockLogger);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ serviceId: 'service1', success: true });
      expect(result.results[1]).toEqual({ serviceId: 'service2', success: true });
      
      expect(mockLogger.info).toHaveBeenCalledWith('Operation: Purge ALL cache for services');
      expect(mockLogger.success).toHaveBeenCalledWith('[service1] Purged ALL cache successfully (ID: purge-all-success)');
      expect(mockLogger.success).toHaveBeenCalledWith('[service2] Purged ALL cache successfully (ID: purge-all-success)');
      expect(mockLogger.info).toHaveBeenCalledWith('Purge completed: 2/2 services successful');
      
      // Verify the correct API endpoint was called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fastly.com/service/service1/purge_all',
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fastly.com/service/service2/purge_all',
        expect.any(Object)
      );
    });

    test('should handle --all flag with dry run', async () => {
      const result = await executePurge([], { env: 'dev', all: true, dryRun: true }, mockLogger);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ serviceId: 'service1', success: true });
      expect(result.results[1]).toEqual({ serviceId: 'service2', success: true });
      
      expect(mockLogger.info).toHaveBeenCalledWith('Operation: Purge ALL cache for services');
      expect(mockLogger.warn).toHaveBeenCalledWith('DRY RUN MODE - No actual purging will occur');
      expect(mockLogger.info).toHaveBeenCalledWith('[service1] Would purge ALL cache');
      expect(mockLogger.info).toHaveBeenCalledWith('[service2] Would purge ALL cache');
      expect(mockLogger.info).toHaveBeenCalledWith('Dry run completed. Would have attempted to purge ALL cache for 2 services.');
      
      // Ensure no actual fetch calls were made
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should handle --all flag with failed purges', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockRejectedValue(new Error('Service error for purge all'));

      const result = await executePurge([], { env: 'dev', all: true }, mockLogger);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ 
        serviceId: 'service1', 
        success: false, 
        error: 'Error: Service service1: Service error for purge all' 
      });
      expect(result.results[1]).toEqual({ 
        serviceId: 'service2', 
        success: false, 
        error: 'Error: Service service2: Service error for purge all' 
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith('[service1] Error: Service service1: Service error for purge all');
      expect(mockLogger.error).toHaveBeenCalledWith('[service2] Error: Service service2: Service error for purge all');
      expect(mockLogger.info).toHaveBeenCalledWith('Purge completed: 0/2 services successful');
    });

    test('should handle URL purging when first key starts with https://', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-url-123' })
      });

      const result = await executePurge(['https://example.com/page'], { env: 'dev' }, mockLogger);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ serviceId: 'service1', success: true });
      expect(result.results[1]).toEqual({ serviceId: 'service2', success: true });
      
      expect(mockLogger.info).toHaveBeenCalledWith('Operation: Purge URL - https://example.com/page');
      expect(mockLogger.success).toHaveBeenCalledWith('Purged URL globally: https://example.com/page (ID: purge-url-123)');
      expect(mockLogger.info).toHaveBeenCalledWith('URL purge completed globally (affects all services)');
      
      // Verify only one fetch call was made (global purge)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('should warn and ignore additional keys when first key is URL', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', id: 'purge-url-456' })
      });

      await executePurge(['https://example.com/page', 'ignored-key-1', 'ignored-key-2'], { env: 'dev' }, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith('URL detected: https://example.com/page - ignoring additional keys: ignored-key-1, ignored-key-2');
      expect(mockLogger.info).toHaveBeenCalledWith('Operation: Purge URL - https://example.com/page');
    });

    test('should handle URL purging in dry run mode', async () => {
      const result = await executePurge(['https://example.com/page'], { env: 'dev', dryRun: true }, mockLogger);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ serviceId: 'service1', success: true });
      expect(result.results[1]).toEqual({ serviceId: 'service2', success: true });
      
      expect(mockLogger.info).toHaveBeenCalledWith('Would purge URL globally: https://example.com/page');
      expect(mockLogger.info).toHaveBeenCalledWith('Dry run completed. Would have attempted to purge URL globally (affects all services).');
      
      // Ensure no actual fetch calls were made
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should handle URL purging failures', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockRejectedValue(new Error('Service error for URL purge'));

      const result = await executePurge(['https://example.com/page'], { env: 'dev' }, mockLogger);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ 
        serviceId: 'service1', 
        success: false, 
        error: 'Error: Service global: Service error for URL purge' 
      });
      expect(result.results[1]).toEqual({ 
        serviceId: 'service2', 
        success: false, 
        error: 'Error: Service global: Service error for URL purge' 
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith('URL purge failed: Error: Service global: Service error for URL purge');
      expect(mockLogger.info).toHaveBeenCalledWith('URL purge completed globally (affects all services)');
    });

  });
});
