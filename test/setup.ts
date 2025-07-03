// Test setup
process.env.NODE_ENV = 'test';

// Mock console methods to avoid noise in tests
const originalConsole = global.console;

beforeEach(() => {
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  };
});

afterEach(() => {
  global.console = originalConsole;
});
