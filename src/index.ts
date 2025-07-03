#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import { executePurge, Logger, Env as CoreEnv } from './core.js';
import { executeSetup } from './setup.js';
import { 
  generateContextualHelp, 
  shouldShowSetupGuidance,
  generateContextualError
} from './cli-help.js';

type Env = CoreEnv;

interface CliArgs {
  _: string[];
  env: Env;
  services?: string;
  verbose?: boolean;
  'dry-run'?: boolean;
  setup?: string;
  'allow-execution'?: boolean;
  force?: boolean;
  help?: boolean;
  'help-advanced'?: boolean;
  all?: boolean;
}

// Enhanced logging with colorized output
const log: Logger = {
  info: (message: string) => console.log(`ℹ️  ${message}`),
  success: (message: string) => console.log(`✅ ${message}`),
  error: (message: string) => console.error(`❌ ${message}`),
  warn: (message: string) => console.warn(`⚠️  ${message}`),
  debug: (message: string, verbose?: boolean) => {
    if (verbose) console.log(`🐛 ${message}`);
  }
};

// Parse command line arguments - simplified to avoid automatic help
const argv = yargs(hideBin(process.argv))
  .scriptName('bleurgh')
  .usage('$0 <key> [key2] [key3...] [options]')
  .option('env', {
    alias: 'e',
    type: 'string',
    choices: ['dev', 'test', 'prod'] as const,
    default: 'dev' as const,
    describe: 'Target environment'
  })
  .option('services', {
    alias: 's',
    type: 'string',
    describe: 'Override service IDs (comma-separated)'
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    default: false,
    describe: 'Enable verbose logging'
  })
  .option('dry-run', {
    alias: 'd',
    type: 'boolean',
    default: false,
    describe: 'Show what would be purged without doing it'
  })
  .option('setup', {
    type: 'string',
    describe: 'Base64-encoded setup configuration'
  })
  .option('allow-execution', {
    type: 'boolean',
    default: false,
    describe: 'Allow automatic setup execution'
  })
  .option('force', {
    type: 'boolean',
    default: false,
    describe: 'Force override existing configuration'
  })
  .option('help-advanced', {
    type: 'boolean',
    default: false,
    describe: 'Show comprehensive help documentation'
  })
  .option('all', {
    type: 'boolean',
    default: false,
    describe: 'Purge all cache for the service (ignores keys and defaults)'
  })
  .help(false) // Disable automatic help to use our contextual help
  .version()
  .parseSync() as unknown as CliArgs;

// Main execution
async function main() {
  try {
    // Check for help flags first
    if (argv.help || argv['help-advanced'] || shouldShowSetupGuidance(process.argv)) {
      console.log(generateContextualHelp({ 
        showAdvanced: argv['help-advanced'] 
      }));
      process.exit(0);
    }

    // Check if this is a setup operation
    if (argv.setup) {
      await executeSetup(argv.setup, {
        allowExecution: argv['allow-execution'] ?? false,
        force: argv.force ?? false
      }, log);
      return;
    }

    // Regular purge operation - validate user keys or --all flag
    const userKeys = argv._.map(key => String(key)).filter(key => key.length > 0);
    
    // Check if --all flag is used
    if (argv.all) {
      if (userKeys.length > 0) {
        log.error('Cannot use --all flag with specific keys. Use either --all or provide specific keys.');
        process.exit(1);
      }
    } else if (userKeys.length === 0) {
      console.log(generateContextualHelp());
      process.exit(1);
    }
    
    const options = {
      env: argv.env,
      services: argv.services,
      verbose: argv.verbose,
      dryRun: argv['dry-run'],
      all: argv.all
    };

    const result = await executePurge(userKeys, options, log);
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error(generateContextualError(error as Error));
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason: any) => {
  log.error(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  log.info('Operation cancelled by user');
  process.exit(0);
});

// Run the main function
main().catch((error) => {
  log.error(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exit(1);
});
