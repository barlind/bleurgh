import { getSetupStatus, hasBasicSetup } from './core.js';
import chalk from 'chalk';

export interface CliHelpOptions {
  showAdvanced?: boolean;
  command?: string;
}

// Generate setup instructions for users who haven't configured their environment
export function generateSetupInstructions(): string {
  const status = getSetupStatus();
  const instructions: string[] = [];

  instructions.push(chalk.yellow('🚀 Welcome to bleurgh! Let\'s get you set up.\n'));

  // Add token setup instructions
  addTokenInstructions(instructions, status);
  
  // Add service IDs setup instructions
  addServiceIdInstructions(instructions, status);
  
  // Add default keys setup instructions
  addDefaultKeysInstructions(instructions, status);

  // Add final instructions
  addFinalInstructions(instructions, status);

  return instructions.join('\n');
}

// Helper function for token setup instructions
function addTokenInstructions(instructions: string[], status: ReturnType<typeof getSetupStatus>): void {
  if (!status.hasToken) {
    instructions.push(chalk.red('❌ Missing Fastly API Token'));
    instructions.push('First, get your Fastly API token from: https://manage.fastly.com/account/personal/tokens');
    instructions.push('Then set it as an environment variable:\n');
    instructions.push(chalk.cyan('export FASTLY_TOKEN="your-fastly-api-token-here"\n'));
  } else {
    instructions.push(chalk.green('✅ Fastly API Token configured'));
  }
}

// Helper function for service IDs setup instructions
function addServiceIdInstructions(instructions: string[], status: ReturnType<typeof getSetupStatus>): void {
  if (!status.hasDevServices) {
    instructions.push(chalk.red('❌ Missing service IDs for default environment (dev)'));
    instructions.push('Set your development service IDs:\n');
    instructions.push(chalk.cyan('export FASTLY_DEV_SERVICE_IDS="service-id-1,service-id-2"\n'));
    
    instructions.push('For additional environments, use these patterns:');
    instructions.push(chalk.dim('  FASTLY_TEST_SERVICE_IDS="test-svc-1,test-svc-2"'));
    instructions.push(chalk.dim('  FASTLY_PROD_SERVICE_IDS="prod-svc-1,prod-svc-2"\n'));
  } else {
    instructions.push(chalk.green('✅ Development service IDs configured'));
    
    // Check for other environments
    if (!status.hasTestServices && !status.hasProdServices) {
      instructions.push(chalk.yellow('💡 Consider setting up other environments:'));
      instructions.push(chalk.dim('  FASTLY_TEST_SERVICE_IDS="test-svc-1,test-svc-2"'));
      instructions.push(chalk.dim('  FASTLY_PROD_SERVICE_IDS="prod-svc-1,prod-svc-2"\n'));
    } else {
      if (status.hasTestServices) {
        instructions.push(chalk.green('✅ Test service IDs configured'));
      }
      if (status.hasProdServices) {
        instructions.push(chalk.green('✅ Production service IDs configured'));
      }
    }
  }
}

// Helper function for default keys setup instructions
function addDefaultKeysInstructions(instructions: string[], status: ReturnType<typeof getSetupStatus>): void {
  const hasAnyDefaultKeys = status.hasDefaultKeys || status.hasDevDefaultKeys || 
                           status.hasTestDefaultKeys || status.hasProdDefaultKeys;
  
  if (!hasAnyDefaultKeys) {
    instructions.push(chalk.yellow('💡 Optional: Set default cache keys that are always purged:'));
    instructions.push(chalk.cyan('export FASTLY_DEFAULT_KEYS="global,always,common"'));
    instructions.push(chalk.cyan('# Or set environment-specific defaults:'));
    instructions.push(chalk.cyan('export FASTLY_DEV_DEFAULT_KEYS="dev-global,dev-always"'));
    instructions.push(chalk.cyan('export FASTLY_TEST_DEFAULT_KEYS="test-global,test-always"'));
    instructions.push(chalk.cyan('export FASTLY_PROD_DEFAULT_KEYS="prod-global,prod-always"\n'));
  } else {
    if (status.hasDefaultKeys) {
      instructions.push(chalk.green('✅ Global default keys configured'));
    }
    if (status.hasDevDefaultKeys) {
      instructions.push(chalk.green('✅ Development default keys configured'));
    }
    if (status.hasTestDefaultKeys) {
      instructions.push(chalk.green('✅ Test default keys configured'));
    }
    if (status.hasProdDefaultKeys) {
      instructions.push(chalk.green('✅ Production default keys configured'));
    }
    instructions.push('');
  }
}

// Helper function for final setup instructions
function addFinalInstructions(instructions: string[], status: ReturnType<typeof getSetupStatus>): void {
  instructions.push(chalk.blue('📝 Add these to your shell configuration file (~/.zshrc, ~/.bashrc, etc.)'));
  instructions.push(chalk.blue('Then reload your shell: source ~/.zshrc\n'));

  if (status.hasToken && status.hasDevServices) {
    instructions.push(chalk.green('✨ You\'re all set! Try: bleurgh user-123'));
    instructions.push(chalk.dim('   Or without global install: npx bleurgh user-123'));
  } else {
    instructions.push(chalk.yellow('Once configured, try: bleurgh user-123'));
    instructions.push(chalk.dim('   Or without global install: npx bleurgh user-123'));
  }
}

// Generate quick start examples for configured users
export function generateQuickStartExamples(): string {
  const examples: string[] = [];

  examples.push(chalk.green('✨ Quick Examples:\n'));
  
  examples.push(chalk.cyan('# Purge cache for user-123 (default: dev environment)'));
  examples.push('bleurgh user-123\n');
  
  examples.push(chalk.cyan('# Purge multiple keys'));
  examples.push('bleurgh user-123 product-456 category-789\n');
  
  examples.push(chalk.cyan('# Purge specific URL (global)'));
  examples.push('bleurgh https://example.com/page\n');
  
  examples.push(chalk.cyan('# Purge ALL cache for services'));
  examples.push('bleurgh --all\n');
  
  examples.push(chalk.cyan('# Purge in production'));
  examples.push('bleurgh user-123 --env prod\n');
  
  examples.push(chalk.cyan('# Test what would be purged (dry run)'));
  examples.push('bleurgh user-123 --dry-run\n');
  
  examples.push(chalk.cyan('# Override service IDs'));
  examples.push('bleurgh user-123 --services "custom-svc-1,custom-svc-2"\n');

  examples.push(chalk.dim('💡 Use --help-advanced for full documentation'));
  examples.push(chalk.dim('💡 Run without installing: npx bleurgh <command>'));

  return examples.join('\n');
}

// Generate the main help text based on setup status
export function generateContextualHelp(options: CliHelpOptions = {}): string {
  const isSetup = hasBasicSetup();
  
  if (options.showAdvanced) {
    return generateAdvancedHelp();
  }

  if (!isSetup) {
    return generateSetupInstructions();
  }

  return generateQuickStartExamples();
}

// Generate comprehensive help documentation
export function generateAdvancedHelp(): string {
  const help: string[] = [];
  
  help.push(chalk.bold.blue('bleurgh - Fastly Cache Purge CLI\n'));
  
  help.push(chalk.yellow('USAGE:'));
  help.push('  bleurgh <keys...> [options]');
  help.push('  bleurgh --all [options]');
  help.push('  npx bleurgh <keys...> [options]  # Run without global installation\n');
  
  help.push(chalk.yellow('ARGUMENTS:'));
  help.push('  keys                 Surrogate keys to purge (space-separated)');
  help.push('                       If first key starts with https://, purges that URL globally\n');
  
  help.push(chalk.yellow('OPTIONS:'));
  help.push('  --all                Purge ALL cache for services (ignores keys and defaults)');
  help.push('  --env <env>          Target environment: dev, test, prod (default: dev)');
  help.push('  --services <ids>     Override service IDs (comma-separated)');
  help.push('  --dry-run            Show what would be purged without actually doing it');
  help.push('  --verbose            Enable verbose logging');
  help.push('  --setup <config>     Configure environment from base64 setup string');
  help.push('  --allow-execution    Allow automatic setup (use with --setup)');
  help.push('  --force              Force override existing configuration');
  help.push('  --help               Show contextual help');
  help.push('  --help-advanced      Show this comprehensive help\n');
  
  help.push(chalk.yellow('EXAMPLES:'));
  help.push('  bleurgh user-123                           # Purge user-123 in dev');
  help.push('  bleurgh user-123 product-456               # Purge multiple keys');
  help.push('  bleurgh https://example.com/page           # Purge specific URL (global)');
  help.push('  bleurgh --all                              # Purge ALL cache');
  help.push('  bleurgh --all --env prod                   # Purge ALL cache in production');
  help.push('  bleurgh user-123 --env prod                # Purge in production');
  help.push('  bleurgh user-123 --dry-run                 # Test without purging');
  help.push('  bleurgh user-123 --services "svc1,svc2"    # Override services');
  help.push('  bleurgh --setup eyJ0b2tlbjp0ZXN0fQ==       # Configure from setup string');
  help.push('  npx bleurgh user-123 --dry-run             # Run without global install\n');
  
  help.push(chalk.yellow('ENVIRONMENT VARIABLES:'));
  help.push('  FASTLY_TOKEN                 Your Fastly API token (required)');
  help.push('  FASTLY_DEV_SERVICE_IDS       Development service IDs (preferred)');
  help.push('  FASTLY_TEST_SERVICE_IDS      Test service IDs (preferred)');
  help.push('  FASTLY_PROD_SERVICE_IDS      Production service IDs (preferred)');
  help.push('  FASTLY_DEFAULT_KEYS          Global default keys always included in purge');
  help.push('  FASTLY_{ENV}_DEFAULT_KEYS    Environment-specific default keys (overrides global)\n');
  
  help.push(chalk.yellow('ENVIRONMENT SETUP:'));
  help.push('The CLI supports multiple naming patterns for service IDs:');
  help.push('  FASTLY_<ENV>_SERVICE_IDS     # Preferred: FASTLY_DEV_SERVICE_IDS');
  help.push('  <ENV>_SERVICE_IDS           # Legacy fallback: DEV_SERVICE_IDS');
  help.push('  SERVICE_IDS_<ENV>           # Legacy fallback: SERVICE_IDS_DEV');
  help.push('');
  help.push('Note: Only FASTLY_* prefixed variables can be used with --setup commands.\n');
  
  help.push(chalk.dim('For more information, visit: https://github.com/barlind/bleurgh'));
  
  return help.join('\n');
}

// Check if we should show setup guidance instead of running purge
export function shouldShowSetupGuidance(args: string[]): boolean {
  // If no arguments provided and not setup, show guidance
  if (args.length === 0 && !hasBasicSetup()) {
    return true;
  }
  
  // If help flags are present
  if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
    return true;
  }
  
  return false;
}

// Generate error messages with helpful context
export function generateContextualError(error: Error): string {
  const errorMsg = error.message;
  const status = getSetupStatus();
  const suggestions: string[] = [];
  
  // Token-related errors
  if (errorMsg.includes('FASTLY_TOKEN')) {
    suggestions.push(chalk.yellow('💡 Set your Fastly API token:'));
    suggestions.push(chalk.cyan('   export FASTLY_TOKEN="your-token-here"'));
  }
  
  // Service ID related errors
  if (errorMsg.includes('No service IDs configured') || errorMsg.includes('SERVICE_IDS')) {
    const envRegex = /environment: (\w+)/;
    const match = envRegex.exec(errorMsg);
    const env = match?.[1] ?? 'dev';
    suggestions.push(chalk.yellow(`💡 Set service IDs for ${env} environment:`));
    suggestions.push(chalk.cyan(`   export FASTLY_${env.toUpperCase()}_SERVICE_IDS="service-1,service-2"`));
  }
  
  // General setup guidance
  if (!status.isComplete) {
    suggestions.push(chalk.yellow('\n🚀 Run bleurgh --help for complete setup instructions'));
  }
  
  const errorOutput = [chalk.red('❌ ' + errorMsg)];
  if (suggestions.length > 0) {
    errorOutput.push('', ...suggestions);
  }
  
  return errorOutput.join('\n');
}
