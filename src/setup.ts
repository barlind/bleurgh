import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Shescape } from 'shescape';

export interface SetupConfig {
  fastlyToken: string;
  devServiceIds?: string;
  testServiceIds?: string;
  prodServiceIds?: string;
  devServiceNames?: string;
  testServiceNames?: string;
  prodServiceNames?: string;
  defaultKeys?: string;
}

export interface SetupOptions {
  allowExecution: boolean;
  force: boolean;
  exportToken?: boolean;
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

const VALID_VAR_NAMES = [
  'FASTLY_TOKEN',
  'FASTLY_DEV_SERVICE_IDS',
  'FASTLY_TEST_SERVICE_IDS',
  'FASTLY_PROD_SERVICE_IDS',
  'FASTLY_DEV_SERVICE_NAMES',
  'FASTLY_TEST_SERVICE_NAMES',
  'FASTLY_PROD_SERVICE_NAMES',
  'FASTLY_DEFAULT_KEYS'
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

// Validate token format
function validateTokenFormat(value: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    errors.push(`Invalid fastlyToken format: should only contain alphanumeric characters, underscores, and hyphens`);
  }
  if (value.length < 16) {
    warnings.push(`fastlyToken seems unusually short (${value.length} characters)`);
  }
  
  return { errors, warnings };
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

// Validate field format based on field type
function validateFieldFormat(fieldName: string, value: string): { errors: string[]; warnings: string[] } {
  if (fieldName === 'fastlyToken') {
    return validateTokenFormat(value);
  } else if (['devServiceIds', 'testServiceIds', 'prodServiceIds'].includes(fieldName)) {
    return { errors: validateServiceIdsFormat(fieldName, value), warnings: [] };
  } else if (['devServiceNames', 'testServiceNames', 'prodServiceNames'].includes(fieldName)) {
    return { errors: validateServiceNamesFormat(fieldName, value), warnings: [] };
  } else if (fieldName === 'defaultKeys') {
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

  const fieldsToValidate = [
    { name: 'fastlyToken', value: config.fastlyToken, required: true },
    { name: 'devServiceIds', value: config.devServiceIds, required: false },
    { name: 'testServiceIds', value: config.testServiceIds, required: false },
    { name: 'prodServiceIds', value: config.prodServiceIds, required: false },
    { name: 'devServiceNames', value: config.devServiceNames, required: false },
    { name: 'testServiceNames', value: config.testServiceNames, required: false },
    { name: 'prodServiceNames', value: config.prodServiceNames, required: false },
    { name: 'defaultKeys', value: config.defaultKeys, required: false }
  ];

  for (const field of fieldsToValidate) {
    if (field.required && !field.value) {
      result.errors.push(`Missing required field: ${field.name}`);
      continue;
    }

    if (!field.value) continue;

    // Length check
    if (field.value.length > 1000) {
      result.errors.push(`Field ${field.name} exceeds maximum length (1000 characters)`);
    }

    // Security checks
    result.errors.push(...checkDangerousPatterns(field.value, field.name));
    result.errors.push(...checkShellInjection(field.value, field.name));
    result.warnings.push(...checkSuspiciousKeywords(field.value, field.name));
    
    // Format validation
    const formatResult = validateFieldFormat(field.name, field.value);
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

    // Validate environment variable name
    if (!VALID_VAR_NAMES.includes(varName)) {
      result.errors.push(`Invalid environment variable name: '${varName}' is not in the allowlist`);
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

// Check if environment variables are already set
function checkExistingSetup(): { hasSetup: boolean; existingVars: string[] } {
  const varsToCheck = [
    'FASTLY_TOKEN',
    'FASTLY_DEV_SERVICE_IDS',
    'FASTLY_TEST_SERVICE_IDS', 
    'FASTLY_PROD_SERVICE_IDS',
    'FASTLY_DEFAULT_KEYS'
  ];
  
  const existingVars = varsToCheck.filter(varName => process.env[varName]);
  return {
    hasSetup: existingVars.length > 0,
    existingVars
  };
}

// Generate shell export commands
// Options:
//   - exportToken: If true, includes FASTLY_TOKEN in export commands
//   - exportKeys: Array of specific environment variable names to export (e.g., ['FASTLY_DEV_SERVICE_IDS'])
//                 If not provided, all available keys will be exported
function generateExportCommands(config: SetupConfig, options?: { exportToken?: boolean; exportKeys?: string[] }): string[] {
  const commands: string[] = [];
  
  // Only export token if explicitly requested
  if (options?.exportToken) {
    commands.push(`export FASTLY_TOKEN="${config.fastlyToken}"`);
  }
  
  // Helper function to check if a key should be exported
  const shouldExportKey = (keyName: string): boolean => {
    if (!options?.exportKeys) return true; // Export all if no filter specified
    return options.exportKeys.includes(keyName);
  };
  
  if (config.devServiceIds && shouldExportKey('FASTLY_DEV_SERVICE_IDS')) {
    commands.push(`export FASTLY_DEV_SERVICE_IDS="${config.devServiceIds}"`);
  }
  
  if (config.testServiceIds && shouldExportKey('FASTLY_TEST_SERVICE_IDS')) {
    commands.push(`export FASTLY_TEST_SERVICE_IDS="${config.testServiceIds}"`);
  }
  
  if (config.prodServiceIds && shouldExportKey('FASTLY_PROD_SERVICE_IDS')) {
    commands.push(`export FASTLY_PROD_SERVICE_IDS="${config.prodServiceIds}"`);
  }
  
  if (config.devServiceNames && shouldExportKey('FASTLY_DEV_SERVICE_NAMES')) {
    commands.push(`export FASTLY_DEV_SERVICE_NAMES="${config.devServiceNames}"`);
  }
  
  if (config.testServiceNames && shouldExportKey('FASTLY_TEST_SERVICE_NAMES')) {
    commands.push(`export FASTLY_TEST_SERVICE_NAMES="${config.testServiceNames}"`);
  }
  
  if (config.prodServiceNames && shouldExportKey('FASTLY_PROD_SERVICE_NAMES')) {
    commands.push(`export FASTLY_PROD_SERVICE_NAMES="${config.prodServiceNames}"`);
  }
  
  if (config.defaultKeys && shouldExportKey('FASTLY_DEFAULT_KEYS')) {
    commands.push(`export FASTLY_DEFAULT_KEYS="${config.defaultKeys}"`);
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
  
  // Check existing setup
  const { hasSetup, existingVars } = checkExistingSetup();
  
  if (hasSetup && !options.force) {
    logger.warn('Environment variables already detected:');
    existingVars.forEach(varName => {
      const value = process.env[varName];
      const maskedValue = varName === 'FASTLY_TOKEN' 
        ? `${value?.substring(0, 8)}...` 
        : value;
      logger.info(`  ${varName}=${maskedValue}`);
    });
    logger.info('');
    logger.info('Use --force to override existing configuration');
    logger.info('Or manually check your shell configuration files');
    return;
  }
  
  // Generate export commands
  const exportCommands = generateExportCommands(config, {
    exportToken: options.exportToken,
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

// Utility function to generate setup string for administrators
export function generateSetupString(
  config: SetupConfig, 
  options?: { exportToken?: boolean; exportKeys?: string[] }
): string {
  const encoded = encodeSetupString(config);
  
  console.log('📦 Bleurgh CLI Setup Configuration');
  console.log('');
  
  // Show what will be exported
  const willExportToken = options?.exportToken || false;
  
  console.log('This setup will export:');
  if (willExportToken) {
    console.log('  ✅ FASTLY_TOKEN (--export-token specified)');
  } else {
    console.log('  ❌ FASTLY_TOKEN (use --export-token to include)');
  }
  
  if (options?.exportKeys) {
    console.log('  📋 Selected keys:');
    options.exportKeys.forEach(key => console.log(`     ✅ ${key}`));
  } else {
    console.log('  📋 All available service and default keys');
  }
  console.log('');
  
  console.log('Share this setup string with your team:');
  console.log('');
  console.log(`bleurgh --setup ${encoded}`);
  console.log('');
  console.log('Or for automatic setup:');
  console.log(`bleurgh --setup ${encoded} --allow-execution`);
  console.log('');
  
  return encoded;
}
