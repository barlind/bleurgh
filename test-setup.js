import { generateSetupString } from './dist/setup.js';

// Test configuration
const config = {
  fastlyToken: 'test-token-123',
  devServiceIds: 'dev-svc-1,dev-svc-2',
  testServiceIds: 'test-svc-1,test-svc-2', 
  prodServiceIds: 'prod-svc-1,prod-svc-2',
  devServiceNames: 'Dev Frontend,Dev API',
  defaultKeys: 'global,always'
};

console.log('=== Test 1: Basic setup (no token export) ===');
generateSetupString(config);

console.log('\n=== Test 2: With token export ===');
generateSetupString(config, { exportToken: true });

console.log('\n=== Test 3: Selective export (only dev) ===');
generateSetupString(config, { 
  exportToken: false,
  exportKeys: ['FASTLY_DEV_SERVICE_IDS', 'FASTLY_DEV_SERVICE_NAMES'] 
});
