export type Env = 'dev' | 'test' | 'prod';

export interface PurgeResult {
    status: string;
    id?: string;
    service_id: string;
}

export interface FastlyService {
    id: string;
    name: string;
    envs: string[];
}

export interface PurgeOptions {
    env: Env;
    services?: string;
    verbose?: boolean;
    dryRun?: boolean;
    all?: boolean;
    url?: boolean;
    list?: boolean;
}

export interface Logger {
    info: (message: string) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warn: (message: string) => void;
    debug: (message: string, verbose?: boolean) => void;
}

// Check if user has completed basic setup
export const hasBasicSetup = (): boolean => {
    return !!(process.env.FASTLY_TOKEN && getServiceIds('dev', undefined, false).length > 0);
};

// Get setup status details for user guidance
export const listServices = async (logger: Logger): Promise<FastlyService[]> => {
    if (!process.env.FASTLY_TOKEN) {
        logger.error('No Fastly API token found. Please run --setup first.');
        return [];
    }
    
    try {
        const response = await fetch('https://api.fastly.com/service', {
            headers: {
                'Fastly-Key': process.env.FASTLY_TOKEN,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch services: ${response.statusText}`);
        }
        
        const services = await response.json();
        
        // Map each service to include which environments it's used in
        return services.map((service: any) => {
            const envs: string[] = [];
            
            // Check each environment's service IDs
            const devIds = getServiceIds('dev', undefined, false);
            const testIds = getServiceIds('test', undefined, false);
            const prodIds = getServiceIds('prod', undefined, false);
            
            if (devIds.includes(service.id)) envs.push('dev');
            if (testIds.includes(service.id)) envs.push('test');
            if (prodIds.includes(service.id)) envs.push('prod');
            
            return {
                id: service.id,
                name: service.name,
                envs
            };
        });
    } catch (error) {
        logger.error(`Failed to list services: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
};

export const getSetupStatus = () => {
    const hasToken = !!process.env.FASTLY_TOKEN;
    const hasDevServices = getServiceIds('dev', undefined, false).length > 0;
    const hasTestServices = getServiceIds('test', undefined, false).length > 0;
    const hasProdServices = getServiceIds('prod', undefined, false).length > 0;
    const hasDefaultKeys = !!process.env.FASTLY_DEFAULT_KEYS;
    const hasDevDefaultKeys = !!process.env.FASTLY_DEV_DEFAULT_KEYS;
    const hasTestDefaultKeys = !!process.env.FASTLY_TEST_DEFAULT_KEYS;
    const hasProdDefaultKeys = !!process.env.FASTLY_PROD_DEFAULT_KEYS;
    
    return {
        hasToken,
        hasDevServices,
        hasTestServices,
        hasProdServices,
        hasDefaultKeys,
        hasDevDefaultKeys,
        hasTestDefaultKeys,
        hasProdDefaultKeys,
        isComplete: hasToken && hasDevServices
    };
};

// Service configuration with dynamic environment variable support
export const getServiceIds = (env: Env, servicesOverride?: string, throwOnEmpty = true): string[] => {
    // If services are explicitly provided via --services flag, use those
    if (servicesOverride?.trim()) {
        const services = servicesOverride.split(',').map((id: string) => id.trim()).filter(Boolean);
        if (services.length === 0) {
            throw new Error('Services parameter cannot be empty or contain only whitespace');
        }
        return services;
    }

    // Try multiple environment variable patterns for flexibility
    // Prioritize FASTLY_ prefixed variables (required by setup system)
    const envPatterns = [
        `FASTLY_${env.toUpperCase()}_SERVICE_IDS`,  // FASTLY_DEV_SERVICE_IDS (preferred)
        `${env.toUpperCase()}_SERVICE_IDS`,         // DEV_SERVICE_IDS (legacy fallback)
        `SERVICE_IDS_${env.toUpperCase()}`,         // SERVICE_IDS_DEV (legacy fallback)
    ];

    for (const pattern of envPatterns) {
        const serviceIds = process.env[pattern];
        if (serviceIds) {
            const services = serviceIds.split(',').map((id: string) => id.trim()).filter(Boolean);
            if (services.length > 0) {
                return services;
            }
        }
    }

    // No hardcoded fallback values - return empty array
    if (throwOnEmpty) {
        const suggestedVar = `FASTLY_${env.toUpperCase()}_SERVICE_IDS`;
        throw new Error(`No service IDs configured for environment: ${env}. Set ${suggestedVar} environment variable or use --services parameter.`);
    }
    
    return [];
};

// Get default keys with environment variable support
// First checks for environment-specific keys (FASTLY_{ENV}_DEFAULT_KEYS), 
// then falls back to global keys (FASTLY_DEFAULT_KEYS)
export const getDefaultKeys = (env?: Env): string[] => {
    // If environment is specified, check for environment-specific default keys first
    if (env) {
        const envSpecificKeys = process.env[`FASTLY_${env.toUpperCase()}_DEFAULT_KEYS`];
        if (envSpecificKeys) {
            return envSpecificKeys.split(',').map((key: string) => key.trim()).filter(Boolean);
        }
    }
    
    // Fall back to global default keys
    const defaultKeysEnv = process.env.FASTLY_DEFAULT_KEYS;
    if (defaultKeysEnv) {
        return defaultKeysEnv.split(',').map((key: string) => key.trim()).filter(Boolean);
    }
    
    // No hardcoded fallback - return empty array if not configured
    return [];
};

// Get service names for display purposes (optional)
export const getServiceNames = (env: string): string[] => {
    // Try multiple environment variable patterns for service names
    // Prioritize FASTLY_ prefixed variables (consistent with setup system)
    const envPatterns = [
        `FASTLY_${env.toUpperCase()}_SERVICE_NAMES`,  // FASTLY_DEV_SERVICE_NAMES (preferred)
        `${env.toUpperCase()}_SERVICE_NAMES`,         // DEV_SERVICE_NAMES (legacy fallback)
        `SERVICE_NAMES_${env.toUpperCase()}`,         // SERVICE_NAMES_DEV (legacy fallback)
    ];

    for (const pattern of envPatterns) {
        const serviceNames = process.env[pattern];
        if (serviceNames) {
            const names = serviceNames.split(',').map((name: string) => name.trim()).filter(Boolean);
            if (names.length > 0) {
                return names;
            }
        }
    }

    return [];
};

// Get display name for a service (service name if available, otherwise service ID)
export const getServiceDisplayName = (serviceId: string, serviceNames: string[], serviceIds: string[]): string => {
    const index = serviceIds.indexOf(serviceId);
    if (index !== -1 && index < serviceNames.length && serviceNames[index]) {
        return `${serviceNames[index]} (${serviceId})`;
    }
    return serviceId;
};

// Main purge function for surrogate keys
export async function purgeService(
    serviceId: string,
    keys: string[],
    dryRun = false,
    fastlyToken?: string
): Promise<PurgeResult> {
    const url = `https://api.fastly.com/service/${serviceId}/purge`;

    if (dryRun) {
        return {
            status: 'dry-run',
            service_id: serviceId
        };
    }

    const token = fastlyToken ?? process.env.FASTLY_TOKEN;
    if (!token) {
        throw new Error('FASTLY_TOKEN is required');
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Fastly-Key': token,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'bleurgh/1.1.0'
            },
            body: JSON.stringify({
                surrogate_keys: keys
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorSuffix = errorText ? ` - ${errorText}` : '';
            throw new Error(`HTTP ${response.status}: ${response.statusText}${errorSuffix}`);
        }

        const result = await response.json() as PurgeResult;
        return {
            ...result,
            service_id: serviceId
        };
    } catch (error) {
        throw new Error(`Service ${serviceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Purge all cache for a service
export async function purgeAllService(
    serviceId: string,
    dryRun = false,
    fastlyToken?: string
): Promise<PurgeResult> {
    const url = `https://api.fastly.com/service/${serviceId}/purge_all`;

    if (dryRun) {
        return {
            status: 'dry-run-all',
            service_id: serviceId
        };
    }

    const token = fastlyToken ?? process.env.FASTLY_TOKEN;
    if (!token) {
        throw new Error('FASTLY_TOKEN is required');
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Fastly-Key': token,
                'Accept': 'application/json',
                'User-Agent': 'bleurgh/1.1.0'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorSuffix = errorText ? ` - ${errorText}` : '';
            throw new Error(`HTTP ${response.status}: ${response.statusText}${errorSuffix}`);
        }

        const result = await response.json() as PurgeResult;
        return {
            ...result,
            service_id: serviceId
        };
    } catch (error) {
        throw new Error(`Service ${serviceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Purge URL for a service
export async function purgeUrlService(
    serviceId: string,
    url: string,
    dryRun = false,
    fastlyToken?: string
): Promise<PurgeResult> {
    const purgeUrl = `https://api.fastly.com/purge/${url.replace("https://", "")}`;

    if (dryRun) {
        return {
            status: 'dry-run-url',
            service_id: serviceId
        };
    }

    const token = fastlyToken ?? process.env.FASTLY_TOKEN;
    if (!token) {
        throw new Error('FASTLY_TOKEN is required');
    }

    try {
        const response = await fetch(purgeUrl, {
            method: 'POST',
            headers: {
                'Fastly-Key': token,
                'Accept': 'application/json',
                'User-Agent': 'bleurgh/1.2.0'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorSuffix = errorText ? ` - ${errorText}` : '';
            throw new Error(`HTTP ${response.status}: ${response.statusText}${errorSuffix}`);
        }

        const result = await response.json() as PurgeResult;
        return {
            ...result,
            service_id: serviceId
        };
    } catch (error) {
        throw new Error(`Service ${serviceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Helper function to detect if the first key is a URL
export function isUrlPurge(userKeys: string[]): boolean {
    return userKeys.length > 0 && userKeys[0].startsWith('https://');
}

// Main purge orchestration function
export async function executePurge(
    userKeys: string[],
    options: PurgeOptions,
    logger: Logger
): Promise<{ success: boolean; results: Array<{ serviceId: string; success: boolean; error?: string }> }> {
    // Detect URL purge mode
    const isUrl = isUrlPurge(userKeys);
    
    // Validate input parameters
    if (options.all && userKeys.length > 0) {
        throw new Error('Cannot use --all flag with specific keys');
    }
    
    if (isUrl && userKeys.length > 1) {
        logger.warn(`URL detected: ${userKeys[0]} - ignoring additional keys: ${userKeys.slice(1).join(', ')}`);
        userKeys = [userKeys[0]]; // Only use the first URL
    }
    
    if (!options.all && !isUrl && userKeys.length === 0) {
        throw new Error('At least one surrogate key is required (or use --all flag)');
    }

    // Update options to reflect URL mode
    const updatedOptions = { ...options, url: isUrl };

    // Get service configuration
    const serviceIds = getServiceIds(updatedOptions.env, updatedOptions.services);
    const serviceSource = updatedOptions.services ? 'command line --services' : `environment variables for ${updatedOptions.env}`;
    const serviceNames = updatedOptions.services ? [] : getServiceNames(updatedOptions.env);

    // Log operation details
    logOperationDetails(logger, updatedOptions, serviceIds, serviceSource, serviceNames, userKeys);

    // Execute purge operations
    const results = await executePurgeOperations(serviceIds, userKeys, updatedOptions);

    // Process and log results
    return processResults(results, serviceIds, updatedOptions, logger, userKeys);
}

// Helper function to log operation details
function logOperationDetails(
    logger: Logger,
    options: PurgeOptions,
    serviceIds: string[],
    serviceSource: string,
    serviceNames: string[],
    userKeys: string[]
): void {
    logger.info(`Target environment: ${options.env}`);
    logger.info(`Service IDs (from ${serviceSource}): ${serviceIds.join(', ')}`);
    
    if (serviceNames.length > 0) {
        const displayNames = serviceIds.map(id => getServiceDisplayName(id, serviceNames, serviceIds));
        logger.info(`Service names: ${displayNames.join(', ')}`);
    }

    if (options.all) {
        logger.info(`Operation: Purge ALL cache for services`);
    } else if (options.url) {
        logger.info(`Operation: Purge URL - ${userKeys[0]}`);
    } else {
        const defaultKeys = getDefaultKeys(options.env);
        const allKeys = defaultKeys.length > 0 ? [...defaultKeys, ...userKeys] : userKeys;
        
        logger.info(`User keys: ${userKeys.join(', ')}`);
        if (defaultKeys.length > 0) {
            logger.info(`Default keys: ${defaultKeys.join(', ')}`);
        }
        logger.info(`All keys to purge: ${allKeys.join(', ')}`);
    }
    
    if (options.dryRun) {
        logger.warn('DRY RUN MODE - No actual purging will occur');
    }
}

// Helper function to execute purge operations
async function executePurgeOperations(
    serviceIds: string[],
    userKeys: string[],
    options: PurgeOptions
): Promise<PromiseSettledResult<PurgeResult>[]> {
    if (options.all) {
        return Promise.allSettled(
            serviceIds.map(serviceId => purgeAllService(serviceId, options.dryRun))
        );
    } else if (options.url) {
        const url = userKeys[0];
        // URL purging is global, only make one call regardless of services
        const result = await Promise.allSettled([
            purgeUrlService('global', url, options.dryRun)
        ]);
        return result;
    } else {
        const defaultKeys = getDefaultKeys(options.env);
        const allKeys = defaultKeys.length > 0 ? [...defaultKeys, ...userKeys] : userKeys;
        
        return Promise.allSettled(
            serviceIds.map(serviceId => purgeService(serviceId, allKeys, options.dryRun))
        );
    }
}

// Helper function to process results
function processResults(
    results: PromiseSettledResult<PurgeResult>[],
    serviceIds: string[],
    options: PurgeOptions,
    logger: Logger,
    userKeys: string[]
): { success: boolean; results: Array<{ serviceId: string; success: boolean; error?: string }> } {
    let hasErrors = false;
    let successCount = 0;
    const detailedResults: Array<{ serviceId: string; success: boolean; error?: string }> = [];

    if (options.url) {
        // For URL purging, we only make one global call but report it as successful for all services
        const result = results[0];
        if (result.status === 'fulfilled') {
            logSuccessResult(logger, 'global', result.value, options, userKeys);
            successCount = serviceIds.length; // Count as success for all services
            serviceIds.forEach(serviceId => {
                detailedResults.push({ serviceId, success: true });
            });
        } else {
            logger.error(`URL purge failed: ${result.reason}`);
            hasErrors = true;
            serviceIds.forEach(serviceId => {
                detailedResults.push({ serviceId, success: false, error: String(result.reason) });
            });
        }
    } else {
        // For non-URL purging, process each service result individually
        results.forEach((result, index) => {
            const serviceId = serviceIds[index];

            if (result.status === 'fulfilled') {
                logSuccessResult(logger, serviceId, result.value, options, userKeys);
                successCount++;
                detailedResults.push({ serviceId, success: true });
            } else {
                logger.error(`[${serviceId}] ${result.reason}`);
                hasErrors = true;
                detailedResults.push({ serviceId, success: false, error: String(result.reason) });
            }
        });
    }

    // Log summary
    logSummary(logger, options, serviceIds.length, successCount);

    return {
        success: !hasErrors,
        results: detailedResults
    };
}

// Helper function to log successful results
function logSuccessResult(
    logger: Logger,
    serviceId: string,
    result: PurgeResult,
    options: PurgeOptions,
    userKeys?: string[]
): void {
    const idSuffix = result.id ? ` (ID: ${result.id})` : '';
    
    if (options.dryRun) {
        logDryRunResult(logger, serviceId, result, options, userKeys, options.env);
    } else {
        logActualResult(logger, serviceId, result, options, userKeys, idSuffix);
    }
}

// Helper function to log dry run results
function logDryRunResult(
    logger: Logger,
    serviceId: string,
    result: PurgeResult,
    options: PurgeOptions,
    userKeys?: string[],
    env?: Env
): void {
    if (result.status === 'dry-run-all' || options.all) {
        logger.info(`[${serviceId}] Would purge ALL cache`);
    } else if (result.status === 'dry-run-url' || options.url) {
        const url = userKeys && userKeys.length > 0 ? userKeys[0] : '';
        if (serviceId === 'global') {
            logger.info(`Would purge URL globally: ${url}`);
        } else {
            logger.info(`[${serviceId}] Would purge URL: ${url}`);
        }
    } else {
        // We need to reconstruct the keys for dry run logging
        const defaultKeys = getDefaultKeys(env);
        const allKeys = defaultKeys.length > 0 ? [...defaultKeys, ...(userKeys || [])] : userKeys || [];
        logger.info(`[${serviceId}] Would purge keys: ${allKeys.join(', ')}`);
    }
}

// Helper function to log actual purge results
function logActualResult(
    logger: Logger,
    serviceId: string,
    result: PurgeResult,
    options: PurgeOptions,
    userKeys?: string[],
    idSuffix?: string
): void {
    if (options.all) {
        logger.success(`[${serviceId}] Purged ALL cache successfully${idSuffix}`);
    } else if (options.url) {
        const url = userKeys && userKeys.length > 0 ? userKeys[0] : '';
        if (serviceId === 'global') {
            logger.success(`Purged URL globally: ${url}${idSuffix}`);
        } else {
            logger.success(`[${serviceId}] Purged URL successfully: ${url}${idSuffix}`);
        }
    } else {
        logger.success(`[${serviceId}] Purged successfully${idSuffix}`);
    }
}

// Helper function to log summary
function logSummary(
    logger: Logger,
    options: PurgeOptions,
    totalServices: number,
    successCount: number
): void {
    if (options.dryRun) {
        let operation: string;
        if (options.all) {
            operation = 'purge ALL cache for';
        } else if (options.url) {
            operation = 'purge URL globally (affects all services)';
        } else {
            operation = 'purge keys from';
        }
        
        if (options.url) {
            logger.info(`Dry run completed. Would have attempted to ${operation}.`);
        } else {
            logger.info(`Dry run completed. Would have attempted to ${operation} ${totalServices} services.`);
        }
    } else if (options.url) {
        logger.info(`URL purge completed globally (affects all services)`);
    } else {
        logger.info(`Purge completed: ${successCount}/${totalServices} services successful`);
    }
}
