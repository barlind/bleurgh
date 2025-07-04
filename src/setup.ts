import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Shescape } from 'shescape';

export interface SetupConfig {
  // Direct mapping of environment variable names to their values
  [envVarName: string]: string | undefined;
}

export interface SetupOptions {
  allowExecution: boolean;
  force: boolean;
  exportKeys?: string[]; // Optional list of specific keys to export
}

export interface Logger {
  info: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
}

// Security validation for setup configuration
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Define security patterns and rules
const SECURITY_PATTERNS = {
  // Command injection patterns
  dangerousChars: /[;&|`$(){}[\]<>]/,
  commandSubstitution: /\$\(|`.*`/,
  redirection: />>|<<|>&|<&/,
  pathTraversal: /\.\.\//,
  nullBytes: /\0/
};

// Check for control characters using string method to avoid linting issues
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    // Check for control characters (0-8, 11, 12, 14-31, 127)
    if ((code >= 0 && code <= 8) || code === 11 || code === 12 ||
      (code >= 14 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

const SUSPICIOUS_KEYWORDS = [
  'rm', 'delete', 'del', 'unlink', 'rmdir',
  'curl', 'wget', 'fetch', 'nc', 'netcat',
  'eval', 'exec', 'system', 'shell',
  'chmod', 'chown', 'sudo', 'su',
  'kill', 'killall', 'pkill',
  'crontab', 'at', 'nohup',
  'python', 'perl', 'ruby', 'node', 'bash', 'sh', 'zsh', 'fish',
  'http://', 'https://', 'ftp://', 'ssh://',
  'DROP', 'DELETE', 'TRUNCATE', 'ALTER'
];

// Check for dangerous patterns in a value
function checkDangerousPatterns(value: string, fieldName: string): string[] {
  const errors: string[] = [];

  // Service names are allowed to contain spaces
  const isServiceNameField = fieldName.includes('ServiceNames');

  for (const [patternName, pattern] of Object.entries(SECURITY_PATTERNS)) {
    // Skip dangerous chars check for service names as they can contain spaces
    if (patternName === 'dangerousChars' && isServiceNameField) {
      // For service names, only check for truly dangerous characters, not spaces
      const dangerousNonSpaceChars = /[;&|`$(){}[\]<>]/;
      if (dangerousNonSpaceChars.test(value)) {
        errors.push(`Security violation in ${fieldName}: contains dangerous characters (excluding spaces)`);
      }
    } else if (pattern.test(value)) {
      errors.push(`Security violation in ${fieldName}: contains ${patternName}`);
    }
  }

  // Check for control characters
  if (hasControlCharacters(value)) {
    errors.push(`Security violation in ${fieldName}: contains control characters`);
  }

  return errors;
}

// Enhanced shell injection detection using shescape
function checkShellInjection(value: string, fieldName: string): string[] {
  const errors: string[] = [];

  // Service names are allowed to contain spaces and will be properly escaped
  const isServiceNameField = fieldName.includes('ServiceNames');

  try {
    // Initialize shescape for the current shell
    const shellPath = process.env.SHELL ?? '/bin/bash';
    const shellName = path.basename(shellPath);

    // Map common shell names to shescape-supported names
    const supportedShells: Record<string, string> = {
      'bash': 'bash',
      'zsh': 'bash',  // zsh is bash-compatible for escaping
      'sh': 'bash',   // sh is bash-compatible for escaping
      'cmd': 'cmd',
      'powershell': 'powershell',
      'pwsh': 'powershell'
    };

    const mappedShell = supportedShells[shellName] || 'bash';
    const shescape = new Shescape({ shell: mappedShell });

    // If the value needs escaping, it contains shell metacharacters
    const escaped = shescape.escape(value);
    if (escaped !== value && !isServiceNameField) {
      errors.push(`Security violation in ${fieldName}: contains shell metacharacters that require escaping`);
    }
    // For service names, we only error if the escaped value looks dangerous beyond just spaces
    if (escaped !== value && isServiceNameField) {
      // Check if the difference is just space escaping or something more dangerous
      const spacesEscaped = value.replace(/ /g, '\\ ');
      if (escaped !== spacesEscaped) {
        errors.push(`Security violation in ${fieldName}: contains dangerous shell metacharacters beyond spaces`);
      }
    }
  } catch (shescapeError) {
    // If shescape fails, fall back to basic pattern matching
    // This ensures we don't break if shescape has issues
    console.warn(`Shescape validation failed, falling back to basic validation: ${shescapeError}`);
    if (SECURITY_PATTERNS.dangerousChars.test(value) && !isServiceNameField) {
      errors.push(`Security violation in ${fieldName}: contains potentially dangerous shell characters`);
    }
  }

  return errors;
}

// Check for suspicious keywords in a value
function checkSuspiciousKeywords(value: string, fieldName: string): string[] {
  const warnings: string[] = [];
  const lowerValue = value.toLowerCase();

  for (const keyword of SUSPICIOUS_KEYWORDS) {
    if (lowerValue.includes(keyword.toLowerCase())) {
      warnings.push(`Suspicious content in ${fieldName}: contains '${keyword}'`);
    }
  }

  return warnings;
}

// Validate service IDs format
function validateServiceIdsFormat(fieldName: string, value: string): string[] {
  const errors: string[] = [];
  const serviceIds = value.split(',').map(id => id.trim());

  for (const serviceId of serviceIds) {
    if (!/^[a-zA-Z0-9_-]+$/.test(serviceId)) {
      errors.push(`Invalid service ID format in ${fieldName}: '${serviceId}' should only contain alphanumeric characters, underscores, and hyphens`);
    }
  }

  return errors;
}

// Validate service names format
function validateServiceNamesFormat(fieldName: string, value: string): string[] {
  const errors: string[] = [];
  const serviceNames = value.split(',').map(name => name.trim());

  for (const serviceName of serviceNames) {
    // Service names can contain spaces and more characters than IDs
    if (!/^[a-zA-Z0-9\s_-]+$/.test(serviceName)) {
      errors.push(`Invalid service name format in ${fieldName}: '${serviceName}' should only contain alphanumeric characters, spaces, underscores, and hyphens`);
    }
    // Check for empty names
    if (serviceName.length === 0) {
      errors.push(`Empty service name found in ${fieldName}`);
    }
  }

  return errors;
}

// Validate default keys format
function validateKeysFormat(value: string): string[] {
  const errors: string[] = [];
  const keys = value.split(',').map(key => key.trim());

  for (const key of keys) {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      errors.push(`Invalid default key format: '${key}' should only contain alphanumeric characters, underscores, and hyphens`);
    }
  }

  return errors;
}

// Validate field format based on environment variable name
function validateFieldFormat(envVarName: string, value: string): { errors: string[]; warnings: string[] } {
  if (envVarName.endsWith('_SERVICE_IDS')) {
    return { errors: validateServiceIdsFormat(envVarName, value), warnings: [] };
  } else if (envVarName.endsWith('_SERVICE_NAMES')) {
    return { errors: validateServiceNamesFormat(envVarName, value), warnings: [] };
  } else if (envVarName.endsWith('_DEFAULT_KEYS')) {
    return { errors: validateKeysFormat(value), warnings: [] };
  }

  return { errors: [], warnings: [] };
}

// Validate setup configuration
export function validateSetupConfig(config: SetupConfig): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  // Validate all environment variables in the config
  for (const [envVarName, envVarValue] of Object.entries(config)) {
    if (!envVarValue) continue;

    // Validate environment variable name format
    if (!envVarName.startsWith('FASTLY_') || !/^[A-Z_][A-Z0-9_]*$/.test(envVarName)) {
      result.errors.push(`Invalid environment variable name: '${envVarName}' must start with 'FASTLY_' and contain only uppercase letters, numbers, and underscores`);
      continue;
    }

    // Length check
    if (envVarValue.length > 1000) {
      result.errors.push(`Environment variable ${envVarName} exceeds maximum length (1000 characters)`);
    }

    // Security checks
    result.errors.push(...checkDangerousPatterns(envVarValue, envVarName));
    result.errors.push(...checkShellInjection(envVarValue, envVarName));
    result.warnings.push(...checkSuspiciousKeywords(envVarValue, envVarName));

    // Format validation based on environment variable name
    const formatResult = validateFieldFormat(envVarName, envVarValue);
    result.errors.push(...formatResult.errors);
    result.warnings.push(...formatResult.warnings);
  }

  result.isValid = result.errors.length === 0;
  return result;
}

// Validate generated export commands for additional security
export function validateExportCommands(commands: string[]): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  const exportPattern = /^export\s+([A-Z_][A-Z0-9_]*)\s*=\s*"([^"]*)"$/;

  for (const command of commands) {
    const match = exportPattern.exec(command);

    if (!match) {
      result.errors.push(`Invalid command format: '${command}' does not match safe export pattern`);
      continue;
    }

    const [, varName, varValue] = match;

    // Validate environment variable name - support arbitrary FASTLY_* variables
    if (!varName.startsWith('FASTLY_') || !/^[A-Z_][A-Z0-9_]*$/.test(varName)) {
      result.errors.push(`Invalid environment variable name: '${varName}' must start with 'FASTLY_' and contain only uppercase letters, numbers, and underscores`);
    }

    // Validate that the value doesn't contain unsafe characters
    if (varValue.includes('"') || varValue.includes('\\') || varValue.includes('$')) {
      result.errors.push(`Unsafe value in ${varName}: contains quotes, backslashes, or variable substitution`);
    }

    // Enhanced validation: check if the value contains shell metacharacters (not the entire command)
    try {
      const shellPath = process.env.SHELL ?? '/bin/bash';
      const shellName = path.basename(shellPath);

      const supportedShells: Record<string, string> = {
        'bash': 'bash',
        'zsh': 'bash',
        'sh': 'bash',
        'cmd': 'cmd',
        'powershell': 'powershell',
        'pwsh': 'powershell'
      };

      const mappedShell = supportedShells[shellName] || 'bash';
      const shescape = new Shescape({ shell: mappedShell });

      // Check if the value itself (not the command) would need escaping
      const escapedValue = shescape.escape(varValue);
      if (escapedValue !== varValue) {
        result.warnings.push(`Value for ${varName} contains shell metacharacters: ${varValue}`);
      }
    } catch (shescapeError) {
      console.warn(`Shescape value validation failed: ${shescapeError}`);
    }
  }

  result.isValid = result.errors.length === 0;
  return result;
}

// Decode base64 setup string
export function decodeSetupString(encodedConfig: string): SetupConfig {
  try {
    const decoded = Buffer.from(encodedConfig, 'base64').toString('utf-8');
    const config = JSON.parse(decoded);

    // Perform security validation
    const validation = validateSetupConfig(config);
    if (!validation.isValid) {
      throw new Error(`Security validation failed: ${validation.errors.join(', ')}`);
    }

    // Log warnings if present
    if (validation.warnings.length > 0) {
      console.warn('⚠️  Security warnings:', validation.warnings.join(', '));
    }

    return config as SetupConfig;
  } catch (error) {
    throw new Error(`Invalid setup configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Encode setup configuration to base64
export function encodeSetupString(config: SetupConfig): string {
  const jsonString = JSON.stringify(config, null, 0);
  return Buffer.from(jsonString, 'utf-8').toString('base64');
}

// Get shell configuration file path
function getShellConfigPath(): string {
  const shell = process.env.SHELL ?? '/bin/bash';
  const home = os.homedir();

  if (shell.includes('zsh')) {
    return path.join(home, '.zshrc');
  } else if (shell.includes('bash')) {
    // Check for .bash_profile first (macOS convention), then .bashrc
    const bashProfile = path.join(home, '.bash_profile');
    const bashrc = path.join(home, '.bashrc');

    if (fs.existsSync(bashProfile)) {
      return bashProfile;
    }
    return bashrc;
  } else if (shell.includes('fish')) {
    return path.join(home, '.config', 'fish', 'config.fish');
  }

  // Default to .bashrc
  return path.join(home, '.bashrc');
}

// Check if environment variables are already set and analyze what would change
function analyzeSetupChanges(config: SetupConfig): {
  hasExisting: boolean;
  existingVars: string[];
  newVars: Array<{ key: string; value: string }>;
  changedVars: Array<{ key: string; oldValue: string; newValue: string }>;
  unchangedVars: Array<{ key: string; value: string }>;
} {
  const existingVars = Object.keys(process.env).filter(key => 
    key.startsWith('FASTLY_') && process.env[key] && 
    !key.startsWith('FASTLY_TOKEN') && !key.startsWith('FASTLY_API_') && !key.startsWith('FASTLY_KEY_')
  );
  
  const newVars: Array<{ key: string; value: string }> = [];
  const changedVars: Array<{ key: string; oldValue: string; newValue: string }> = [];
  const unchangedVars: Array<{ key: string; value: string }> = [];

  for (const [key, newValue] of Object.entries(config)) {
    if (!newValue) continue;
    
    const existingValue = process.env[key];
    if (!existingValue) {
      newVars.push({ key, value: newValue });
    } else if (existingValue !== newValue) {
      changedVars.push({ key, oldValue: existingValue, newValue });
    } else {
      unchangedVars.push({ key, value: newValue });
    }
  }

  return {
    hasExisting: existingVars.length > 0,
    existingVars,
    newVars,
    changedVars,
    unchangedVars
  };
}

// Display colored diff of changes
function displaySetupDiff(
  analysis: ReturnType<typeof analyzeSetupChanges>,
  logger: Logger,
  allowExecution: boolean
): void {
  // Try to use chalk for colors, but fallback gracefully in test environments
  let chalk: any = null;
  try {
    // Use require for compatibility with Jest
    chalk = require('chalk');
  } catch {
    // Fallback to no colors if chalk isn't available
    chalk = {
      green: (text: string) => text,
      red: (text: string) => text,
      dim: (text: string) => text
    };
  }
  
  if (analysis.newVars.length > 0) {
    logger.info('📝 New environment variables to be set:');
    analysis.newVars.forEach(({ key, value }) => {
      logger.info(chalk.green(`  + ${key}="${value}"`));
    });
    logger.info('');
  }

  if (analysis.changedVars.length > 0) {
    logger.warn('🔄 Environment variables that would be changed:');
    analysis.changedVars.forEach(({ key, oldValue, newValue }) => {
      logger.info(chalk.red(`  - ${key}="${oldValue}"`));
      logger.info(chalk.green(`  + ${key}="${newValue}"`));
    });
    logger.info('');
  }

  if (analysis.unchangedVars.length > 0) {
    logger.info('✅ Environment variables that would remain unchanged:');
    analysis.unchangedVars.forEach(({ key, value }) => {
      logger.info(chalk.dim(`    ${key}="${value}"`));
    });
    logger.info('');
  }

  // Different messaging based on execution mode
  if (allowExecution) {
    if (analysis.changedVars.length > 0) {
      logger.warn('⚠️  Some environment variables would be overwritten.');
      logger.info('Use --force to proceed with automatic setup, or');
      logger.info('copy the new/changed variables manually to avoid conflicts.');
    } else {
      logger.info('💡 Only new variables would be added. No existing variables would be changed.');
    }
  } else {
    logger.info('💡 Copy the new and changed variables above to your terminal or shell config.');
    logger.info('Skip any variables you want to keep at their current values.');
  }
}

// Generate shell export commands
// Options:
//   - exportKeys: Array of specific environment variable names to export (e.g., ['FASTLY_DEV_SERVICE_IDS'])
//                 If not provided, all available keys will be exported
function generateExportCommands(config: SetupConfig, options?: { exportKeys?: string[] }): string[] {
  const commands: string[] = [];

  // Helper function to check if a key should be exported
  const shouldExportKey = (envVarName: string): boolean => {
    if (!options?.exportKeys) return true; // Export all if no filter specified
    return options.exportKeys.includes(envVarName);
  };

  // Generate export commands for each environment variable in the config
  for (const [envVarName, envVarValue] of Object.entries(config)) {
    if (envVarValue && shouldExportKey(envVarName)) {
      commands.push(`export ${envVarName}="${envVarValue}"`);
    }
  }

  return commands;
}

// Write environment variables to shell config
async function writeToShellConfig(commands: string[], logger: Logger): Promise<void> {
  const configPath = getShellConfigPath();
  const configDir = path.dirname(configPath);

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const marker = '# bleurgh CLI environment variables';
  const content = [
    '',
    marker,
    ...commands,
    `# End ${marker}`,
    ''
  ].join('\n');

  // Check if already exists
  if (fs.existsSync(configPath)) {
    const existing = fs.readFileSync(configPath, 'utf-8');
    if (existing.includes(marker)) {
      logger.warn('Configuration already exists in shell config file');
      return;
    }
  }

  // Append to config file
  fs.appendFileSync(configPath, content);
  logger.success(`Environment variables added to ${configPath}`);
}

// Main setup function
export async function executeSetup(
  encodedConfig: string,
  options: SetupOptions,
  logger: Logger
): Promise<void> {
  logger.info('🚀 Starting bleurgh CLI setup...');

  // Decode configuration
  let config: SetupConfig;
  try {
    config = decodeSetupString(encodedConfig);
  } catch (error) {
    logger.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }

  // Analyze what would change
  const analysis = analyzeSetupChanges(config);

  if (analysis.hasExisting && !options.force && analysis.changedVars.length > 0) {
    logger.warn('🔍 Analyzing current environment setup...');
    logger.info('');
    
    await displaySetupDiff(analysis, logger, options.allowExecution);
    
    if (options.allowExecution) {
      logger.info('');
      logger.info('Use --force to proceed with automatic setup and overwrite conflicts.');
    }
    
    logger.info('');
    return;
  }

  // If there are existing vars but no conflicts, show the diff but proceed
  if (analysis.hasExisting && analysis.changedVars.length === 0) {
    logger.info('🔍 Analyzing current environment setup...');
    logger.info('');
    await displaySetupDiff(analysis, logger, options.allowExecution);
    logger.info('');
  }

  // Generate export commands
  const exportCommands = generateExportCommands(config, {
    exportKeys: options.exportKeys
  });

  // Validate export commands for additional security
  const commandValidation = validateExportCommands(exportCommands);
  if (!commandValidation.isValid) {
    logger.error('Export command validation failed:');
    commandValidation.errors.forEach(error => logger.error(`  ${error}`));
    process.exit(1);
  }

  // Log warnings if present
  if (commandValidation.warnings.length > 0) {
    commandValidation.warnings.forEach(warning => logger.warn(`⚠️  ${warning}`));
  }

  if (!options.allowExecution) {
    // Manual setup mode - show copy-pasteable instructions
    logger.info('📋 Copy and paste the following commands to your terminal:');
    logger.info('');
    exportCommands.forEach(cmd => {
      console.log(`  ${cmd}`);
    });
    logger.info('');
    logger.info('Or add them to your shell configuration file:');
    logger.info(`  ${getShellConfigPath()}`);
    logger.info('');
    logger.info('After setting up, reload your shell or run:');
    logger.info('  source ~/.zshrc  # or source ~/.bashrc');
    logger.info('');
    logger.info('Then test with: bleurgh --help');
  } else {
    // Automatic setup mode
    try {
      await writeToShellConfig(exportCommands, logger);
      logger.success('🎉 Setup complete!');
      logger.info('');
      logger.warn('⚠️  Important: Reload your shell or run:');
      logger.info(`  source ${getShellConfigPath()}`);
      logger.info('');
      logger.info('Then test with: bleurgh --help');
    } catch (error) {
      logger.error(`Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.info('');
      logger.info('You can set up manually by running:');
      exportCommands.forEach(cmd => {
        console.log(`  ${cmd}`);
      });
      process.exit(1);
    }
  }
}

// Enhanced utility function to generate setup string for administrators
// Uses actual environment variable values and supports arbitrary environment key names
export function generateSetupString(
  environmentKeysToExport?: string[]
): string {
  console.log('📦 Bleurgh CLI Setup Configuration');
  console.log('');

  const result = buildConfigFromEnvironment(environmentKeysToExport);
  const encoded = encodeSetupString(result.exportConfig);

  displayExportSummary(result.exportableVars);
  displaySetupInstructions(encoded, result.exportableVars);

  return encoded;
}

// Helper function to build config from environment variables
function buildConfigFromEnvironment(environmentKeysToExport?: string[]) {
  // Determine which environment keys to export
  const defaultFastlyKeys = [
    'FASTLY_DEV_SERVICE_IDS',
    'FASTLY_DEV_SERVICE_NAMES', 
    'FASTLY_TEST_SERVICE_IDS',
    'FASTLY_TEST_SERVICE_NAMES',
    'FASTLY_PROD_SERVICE_IDS',
    'FASTLY_PROD_SERVICE_NAMES',
    'FASTLY_DEFAULT_KEYS',
    'FASTLY_DEV_DEFAULT_KEYS',
    'FASTLY_TEST_DEFAULT_KEYS',
    'FASTLY_PROD_DEFAULT_KEYS'
  ];

  const keysToExport = environmentKeysToExport ?? defaultFastlyKeys;

  // Build config object from actual environment values
  const config: SetupConfig = {};

  // Collect values that will actually be exported
  const exportableVars: Array<{ key: string; value: string }> = [];

  for (const envKey of keysToExport) {
    const envValue = process.env[envKey];
    if (envValue) {
      exportableVars.push({ key: envKey, value: envValue });
      // Store directly using the environment variable name as the key
      config[envKey] = envValue;
    }
  }

  return { exportConfig: config, exportableVars };
}

// Helper function to display export summary
function displayExportSummary(exportableVars: Array<{ key: string; value: string }>) {
  console.log('This setup will export:');
  console.log('  ❌ FASTLY_TOKEN (never included in setup strings for security)');
  console.log('  📋 Environment variables:');
  
  if (exportableVars.length === 0) {
    console.log('     ⚠️  No environment variables found to export');
    console.log('     💡 Set environment variables first, then run this command');
  } else {
    for (const { key, value } of exportableVars) {
      console.log(`     ✅ ${key}="${value}"`);
    }
  }
  console.log('');
}

// Helper function to display setup instructions
function displaySetupInstructions(encoded: string, exportableVars: Array<{ key: string; value: string }>) {
  if (exportableVars.length > 0) {
    displaySuccessInstructions(encoded);
  } else {
    displayNoVariablesInstructions();
  }
}

// Helper function to display instructions when variables are found
function displaySuccessInstructions(encoded: string) {
  console.log('Share this setup string with your team:');
  console.log('');
  console.log(`bleurgh --setup ${encoded}`);
  console.log('');
  console.log('Or for automatic setup:');
  console.log(`bleurgh --setup ${encoded} --allow-execution`);
  console.log('');
  console.log('💡 Note: Recipients will need to set FASTLY_TOKEN separately for security');
  console.log('');
}

// Helper function to display instructions when no variables are found
function displayNoVariablesInstructions() {
  console.log('❌ Cannot generate setup string: no environment variables to export');
  console.log('');
  console.log('First set your environment variables, for example:');
  console.log('  export FASTLY_DEV_SERVICE_IDS="service1,service2"');
  console.log('  export FASTLY_PROD_SERVICE_IDS="prod-service1"');
  console.log('  export FASTLY_DEFAULT_KEYS="all"');
  console.log('');
  console.log('Then run this command again.');
  console.log('');
}
