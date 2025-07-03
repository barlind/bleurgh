export type Env = 'dev' | 'test' | 'prod';

export interface PurgeResult {
    status: string;
    id?: string;
    service_id: string;
}

export interface PurgeOptions {
    env: Env;
    services?: string;
    verbose?: boolean;
    dryRun?: boolean;
    all?: boolean;
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
export const getSetupStatus = () => {
    const hasToken = !!process.env.FASTLY_TOKEN;
    const hasDevServices = getServiceIds('dev', undefined, false).length > 0;
    const hasDefaultKeys = !!process.env.FASTLY_DEFAULT_KEYS;
    
    return {
        hasToken,
        hasDevServices,
        hasDefaultKeys,
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
    const envPatterns = [
        `FASTLY_${env.toUpperCase()}_SERVICE_IDS`,  // FASTLY_DEV_SERVICE_IDS
        `FASTLY_${env.toUpperCase()}SERVICE_IDS`,   // FASTLY_DEVSERVICE_IDS
        `${env.toUpperCase()}_SERVICE_IDS`,         // DEV_SERVICE_IDS
        `SERVICE_IDS_${env.toUpperCase()}`,         // SERVICE_IDS_DEV
        `FASTLY_SERVICES_${env.toUpperCase()}`,     // FASTLY_SERVICES_DEV
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
export const getDefaultKeys = (): string[] => {
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
    const envPatterns = [
        `FASTLY_${env.toUpperCase()}_SERVICE_NAMES`,  // FASTLY_DEV_SERVICE_NAMES
        `FASTLY_${env.toUpperCase()}SERVICE_NAMES`,   // FASTLY_DEVSERVICE_NAMES
        `${env.toUpperCase()}_SERVICE_NAMES`,         // DEV_SERVICE_NAMES
        `SERVICE_NAMES_${env.toUpperCase()}`,         // SERVICE_NAMES_DEV
        `FASTLY_SERVICES_${env.toUpperCase()}_NAMES`, // FASTLY_SERVICES_DEV_NAMES
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

// Main purge orchestration function
export async function executePurge(
    userKeys: string[],
    options: PurgeOptions,
    logger: Logger
): Promise<{ success: boolean; results: Array<{ serviceId: string; success: boolean; error?: string }> }> {
    // Validate input parameters
    if (options.all && userKeys.length > 0) {
        throw new Error('Cannot use --all flag with specific keys');
    }
    
    if (!options.all && userKeys.length === 0) {
        throw new Error('At least one surrogate key is required (or use --all flag)');
    }

    // Get service configuration
    const serviceIds = getServiceIds(options.env, options.services);
    const serviceSource = options.services ? 'command line --services' : `environment variables for ${options.env}`;
    const serviceNames = options.services ? [] : getServiceNames(options.env);

    // Log operation details
    logOperationDetails(logger, options, serviceIds, serviceSource, serviceNames, userKeys);

    // Execute purge operations
    const results = await executePurgeOperations(serviceIds, userKeys, options);

    // Process and log results
    return processResults(results, serviceIds, options, logger, userKeys);
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
    } else {
        const defaultKeys = getDefaultKeys();
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
    } else {
        const defaultKeys = getDefaultKeys();
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
        if (options.all) {
            logger.info(`[${serviceId}] Would purge ALL cache`);
        } else {
            // We need to reconstruct the keys for dry run logging
            const defaultKeys = getDefaultKeys();
            const allKeys = defaultKeys.length > 0 ? [...defaultKeys, ...(userKeys || [])] : userKeys || [];
            logger.info(`[${serviceId}] Would purge keys: ${allKeys.join(', ')}`);
        }
    } else if (options.all) {
        logger.success(`[${serviceId}] Purged ALL cache successfully${idSuffix}`);
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
        const operation = options.all ? 'purge ALL cache for' : 'purge keys from';
        logger.info(`Dry run completed. Would have attempted to ${operation} ${totalServices} services.`);
    } else {
        logger.info(`Purge completed: ${successCount}/${totalServices} services successful`);
    }
}
