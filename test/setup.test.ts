import { decodeSetupString, encodeSetupString, executeSetup, validateExportCommands } from '../src/setup';

describe('Setup Functionality Tests', () => {
  const mockLogger = {
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  };

  beforeEach(() => {
    // Reset logger mocks
    Object.values(mockLogger).forEach(fn => fn.mockReset());
    
    // Clear ALL FASTLY_* environment variables that might interfere with tests
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('FASTLY_')) {
        delete process.env[key];
      }
    }
  });

  describe('encodeSetupString and decodeSetupString', () => {
    test('should encode and decode configuration correctly', () => {
      const config = {
        'FASTLY_DEV_SERVICE_IDS': 'dev-svc-1,dev-svc-2',
        'FASTLY_TEST_SERVICE_IDS': 'test-svc-1,test-svc-2',
        'FASTLY_PROD_SERVICE_IDS': 'prod-svc-1,prod-svc-2',
        'FASTLY_DEFAULT_KEYS': 'global,always,cache'
      };

      const encoded = encodeSetupString(config);
      const decoded = decodeSetupString(encoded);

      expect(decoded).toEqual(config);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);
    });

    test('should handle minimal configuration', () => {
      const config = {
        'FASTLY_DEV_SERVICE_IDS': 'dev-svc-1'
      };

      const encoded = encodeSetupString(config);
      const decoded = decodeSetupString(encoded);

      expect(decoded).toEqual(config);
    });

    test('should handle minimal configuration', () => {
      const minimalConfig = {
        'FASTLY_DEV_SERVICE_IDS': 'dev-svc-1'
      };

      const encoded = encodeSetupString(minimalConfig);
      
      // Should not throw - minimal config is valid
      expect(() => decodeSetupString(encoded)).not.toThrow();
    });

    test('should throw error for invalid base64', () => {
      expect(() => decodeSetupString('invalid-base64')).toThrow('Invalid setup configuration');
    });

    test('should throw error for invalid JSON', () => {
      const invalidBase64 = Buffer.from('invalid json', 'utf-8').toString('base64');
      expect(() => decodeSetupString(invalidBase64)).toThrow('Invalid setup configuration');
    });

    test('should handle environment-specific default keys', () => {
      const config = {
        'FASTLY_DEV_SERVICE_IDS': 'dev-svc-1,dev-svc-2',
        'FASTLY_TEST_SERVICE_IDS': 'test-svc-1,test-svc-2',
        'FASTLY_PROD_SERVICE_IDS': 'prod-svc-1,prod-svc-2',
        'FASTLY_DEFAULT_KEYS': 'global,always',
        'FASTLY_DEV_DEFAULT_KEYS': 'dev-global,dev-always',
        'FASTLY_TEST_DEFAULT_KEYS': 'test-global,test-always',
        'FASTLY_PROD_DEFAULT_KEYS': 'prod-global,prod-always'
      };

      const encoded = encodeSetupString(config);
      const decoded = decodeSetupString(encoded);

      expect(decoded).toEqual(config);
      expect(decoded['FASTLY_DEFAULT_KEYS']).toBe('global,always');
      expect(decoded['FASTLY_DEV_DEFAULT_KEYS']).toBe('dev-global,dev-always');
      expect(decoded['FASTLY_TEST_DEFAULT_KEYS']).toBe('test-global,test-always');
      expect(decoded['FASTLY_PROD_DEFAULT_KEYS']).toBe('prod-global,prod-always');
    });
  });

  describe('executeSetup', () => {
    test('should show manual setup instructions when allowExecution is false', async () => {
      const config = {
        'FASTLY_DEV_SERVICE_IDS': 'dev-svc-1,dev-svc-2'
      };
      const encoded = encodeSetupString(config);

      await executeSetup(encoded, { allowExecution: false, force: false }, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('🚀 Starting bleurgh CLI setup...');
      expect(mockLogger.info).toHaveBeenCalledWith('📋 Copy and paste the following commands to your terminal:');
    });

    test('should detect existing environment variables and show diff', async () => {
      // Set existing environment variable (non-token)
      process.env.FASTLY_DEV_SERVICE_IDS = 'existing-service';

      const config = {
        'FASTLY_DEV_SERVICE_IDS': 'new-service1,new-service2',
        'FASTLY_TEST_SERVICE_IDS': 'test-service1'
      };
      const encoded = encodeSetupString(config);

      await executeSetup(encoded, { allowExecution: false, force: false }, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith('🔍 Analyzing current environment setup...');
      expect(mockLogger.warn).toHaveBeenCalledWith('🔄 Environment variables that would be changed:');
      expect(mockLogger.info).toHaveBeenCalledWith('💡 Copy the new and changed variables above to your terminal or shell config.');
    });

    test('should proceed with force option when variables exist', async () => {
      // Set existing environment variable
      process.env.FASTLY_TOKEN = 'existing-token';

      const config = {
        'FASTLY_DEV_SERVICE_IDS': 'dev-svc-1,dev-svc-2'
      };
      const encoded = encodeSetupString(config);

      await executeSetup(encoded, { allowExecution: false, force: true }, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('📋 Copy and paste the following commands to your terminal:');
      expect(mockLogger.warn).not.toHaveBeenCalledWith('Environment variables already detected:');
    });

    test('should handle invalid configuration gracefully', async () => {
      const invalidEncoded = 'invalid-base64-string';

      // Mock process.exit to prevent test from actually exiting
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(
        executeSetup(invalidEncoded, { allowExecution: false, force: false }, mockLogger)
      ).rejects.toThrow('process.exit called');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid setup configuration')
      );

      mockExit.mockRestore();
    });

    test('should handle configuration with all optional fields', async () => {
      const config = {
        'FASTLY_DEV_SERVICE_IDS': 'dev-1,dev-2',
        'FASTLY_TEST_SERVICE_IDS': 'test-1,test-2',
        'FASTLY_PROD_SERVICE_IDS': 'prod-1,prod-2',
        'FASTLY_DEFAULT_KEYS': 'custom,keys,here'
      };
      const encoded = encodeSetupString(config);

      await executeSetup(encoded, { allowExecution: false, force: false }, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('🚀 Starting bleurgh CLI setup...');
      expect(mockLogger.info).toHaveBeenCalledWith('📋 Copy and paste the following commands to your terminal:');
    });

    test('should validate export commands during setup (integration)', async () => {
      // This test verifies that export command validation is integrated
      // by using a configuration that should pass validation
      const config = {
        'FASTLY_DEV_SERVICE_IDS': 'dev-service-1'
      };
      const encoded = encodeSetupString(config);

      // This should succeed without any errors logged
      await executeSetup(encoded, { allowExecution: false, force: false }, mockLogger);

      // Check that no validation errors were logged
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringMatching(/Export command validation failed/)
      );
      
      // Verify the setup completed successfully
      expect(mockLogger.info).toHaveBeenCalledWith('🚀 Starting bleurgh CLI setup...');
      expect(mockLogger.info).toHaveBeenCalledWith('📋 Copy and paste the following commands to your terminal:');
    });

    test('should detect dangerous values with enhanced security validation', () => {
      // Test that our enhanced security validation catches various attack vectors
      const dangerousConfig = {
        'FASTLY_DEV_SERVICE_IDS': 'service$(whoami)' // Command substitution
      };

      expect(() => {
        decodeSetupString(encodeSetupString(dangerousConfig));
      }).toThrow(/Security validation failed/);
    });
  });

  describe('validateExportCommands', () => {
    test('should validate correct export commands', () => {
      const validCommands = [
        'export FASTLY_TOKEN="test-token-123"',
        'export FASTLY_DEV_SERVICE_IDS="dev-svc-1,dev-svc-2"',
        'export FASTLY_TEST_SERVICE_IDS="test-svc-1"',
        'export FASTLY_PROD_SERVICE_IDS="prod-svc-1,prod-svc-2"',
        'export FASTLY_DEFAULT_KEYS="global,always"'
      ];

      const result = validateExportCommands(validCommands);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should reject commands with invalid format', () => {
      const invalidCommands = [
        'export FASTLY_TOKEN=test-token-123', // Missing quotes
        'set FASTLY_TOKEN="test-token"', // Wrong command
        'export FASTLY_TOKEN="test" && rm -rf /', // Command injection
        'export INVALID_VAR="value"' // Invalid variable name
      ];

      const result = validateExportCommands(invalidCommands);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject invalid variable names', () => {
      const invalidCommands = [
        'export MALICIOUS_VAR="value"',
        'export PATH="/malicious/path"',
        'export LD_LIBRARY_PATH="/bad/path"'
      ];

      const result = validateExportCommands(invalidCommands);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid environment variable name: \'MALICIOUS_VAR\' must start with \'FASTLY_\' and contain only uppercase letters, numbers, and underscores');
    });

    test('should reject unsafe values', () => {
      const unsafeCommands = [
        'export FASTLY_TOKEN="test$injection"',
        'export FASTLY_TOKEN="test\\"quote"',
        'export FASTLY_TOKEN="test\\backslash"'
      ];

      const result = validateExportCommands(unsafeCommands);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Check that errors contain expected patterns
      const errorMessages = result.errors.join(' ');
      expect(errorMessages).toMatch(/Invalid command format|Unsafe value/);
    });

    test('should handle empty command list', () => {
      const result = validateExportCommands([]);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
