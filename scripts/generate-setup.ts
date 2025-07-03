#!/usr/bin/env node

// Utility script to generate setup configurations for testing
import { generateSetupString } from '../src/setup.js';

const testConfig = {
  fastlyToken: 'your-fastly-api-token-here',
  devServiceIds: 'dev-service-1,dev-service-2',
  testServiceIds: 'test-service-1,test-service-2',
  prodServiceIds: 'prod-service-1,prod-service-2',
  devServiceNames: 'Dev Frontend,Dev API',
  testServiceNames: 'Test Frontend,Test API',
  prodServiceNames: 'Production Frontend,Production API',
  defaultKeys: 'settings'
};

console.log('Test Configuration for bleurgh CLI Setup');
console.log('========================================');

console.log('\n1. Setup WITHOUT token (default):');
generateSetupString(testConfig);

console.log('\n2. Setup WITH token (--export-token):');
generateSetupString(testConfig, { exportToken: true });

console.log('\n3. Setup with ONLY dev and production service IDs:');
generateSetupString(testConfig, { 
  exportToken: false,
  exportKeys: ['FASTLY_DEV_SERVICE_IDS', 'FASTLY_PROD_SERVICE_IDS'] 
});

console.log('\n4. Setup with token and ONLY default keys:');
generateSetupString(testConfig, { 
  exportToken: true,
  exportKeys: ['FASTLY_DEFAULT_KEYS'] 
});
