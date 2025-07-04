# Bleurgh

A powerful command-line tool for purging Fastly cache by surrogate keys across multiple environments and services.

## Features

- 🚀 **Multi-environment support**: dev, test, prod
- 🔧 **Dynamic service discovery**: Multiple environment variable patterns supported
- �️ **Friendly service names**: Optional display names for better logging and team clarity
- �🎯 **Direct service override**: Use `--services` to specify service IDs directly
- 📝 **Multiple key support**: Purge multiple cache keys in a single command
- 🔄 **Batch purging**: Purge multiple services simultaneously
- � **Complete purge**: Use `--all` flag to purge entire cache for services
- �🧪 **Dry run mode**: Preview operations without making changes
- 📝 **Verbose logging**: Detailed operation feedback
- ⚡ **Fast execution**: Concurrent API calls with proper error handling
- 🛡️ **Error resilience**: Continues operation even if some services fail

## Quick Start

### First-Time Setup

1. **Install the CLI**:
   ```bash
   npm install -g bleurgh
   ```

2. **Get your Fastly API token** from [here](https://manage.fastly.com/account/personal/tokens)

3. **Set up environment variables**:
   ```bash
   export FASTLY_TOKEN="your-fastly-api-token"
   export FASTLY_DEV_SERVICE_IDS="dev-service-1,dev-service-2"
   ```

4. **Test it works**:
   ```bash
   bleurgh user-123 --dry-run
   ```

### Team Setup (Administrators)

Generate setup strings for your team using the built-in generator:

```bash
# First, set your environment variables (examples below)
export FASTLY_DEV_SERVICE_IDS="dev-svc-1,dev-svc-2"
export FASTLY_TEST_SERVICE_IDS="test-svc-1,test-svc-2" 
export FASTLY_PROD_SERVICE_IDS="prod-svc-1,prod-svc-2"
export FASTLY_DEFAULT_KEYS="global,always"

# Optionally add friendly names for your ids
export FASTLY_DEV_SERVICE_NAMES="www-dev,backend-dev"
export FASTLY_TEST_SERVICE_NAMES="www-test,backend-test" 
export FASTLY_PROD_SERVICE_NAMES="www,backend"

# Generate setup string from your current environment
node -e "
const { generateSetupString } = require('./dist/setup.js');

// Generate setup with all currently set FASTLY_* environment variables
generateSetupString();

// Or specify which environment variables to export
// generateSetupString(['FASTLY_DEV_SERVICE_IDS', 'FASTLY_TEST_SERVICE_IDS']);

// Or include custom environment variable names (any keys)
// generateSetupString(['FASTLY_STAGE_SERVICE_IDS', 'FASTLY_QA_SERVICE_IDS']);
"

**Security Note**: The `generateSetupString()` function **never** includes `FASTLY_TOKEN` in setup strings for security. Recipients must set their own tokens separately.

Share the generated base64 string with your team:
```bash
# Team members run this:
bleurgh --setup <base64-string>

# Team members also need to set their own token:
export FASTLY_TOKEN="their-individual-token"

# Or for automatic setup:
bleurgh --setup <base64-string> --allow-execution
```

## Installation Options

### Global Installation (Recommended)

```bash
npm install -g bleurgh
```

### NPX Usage (No Installation Required)

```bash
npx bleurgh <key> [options]
```

### Local Development

```bash
git clone <your-repo-url>
cd bleurgh
npm install
npm run build
```

### Running Locally

After building the project, you can run it locally in several ways:

```bash
# Option 1: Run the compiled JavaScript directly
./dist/index.js user-123 --env dev

# Option 2: Use npm run dev (with ts-node, no build required)
npm run dev user-123 --env dev

# Option 3: Use node directly
node dist/index.js user-123 --env dev

# Option 4: Create a symlink for global-like usage (optional)
npm link
bleurgh user-123 --env dev
```

**Note**: Make sure you have the required environment variables set up before running locally:

```bash
export FASTLY_TOKEN="your-fastly-api-token"
export FASTLY_DEV_SERVICE_IDS="dev-service-1,dev-service-2"
#optional friendly name for ids
export FASTLY_DEV_SERVICE_NAMES="www, backend"
```

## Basic Usage

```bash
# Purge cache for user-123 in dev environment (default)
bleurgh user-123

# Purge multiple keys at once
bleurgh user-123 product-456 article-789

# Purge specific URL (global across all services)
bleurgh https://example.com/page

# Purge ALL cache for services (ignores keys and defaults)
bleurgh --all

# Purge cache in production environment
bleurgh product-456 --env prod

# Dry run to see what would be purged
bleurgh user-123 --dry-run

# Override service IDs directly
bleurgh user-123 --services svc-1,svc-2,svc-3
```

## Configuration

### Required
- `FASTLY_TOKEN`: Your Fastly API token ([Get one here](https://manage.fastly.com/account/personal/tokens))

### Optional
- `FASTLY_DEV_SERVICE_IDS`: Development service IDs (comma-separated)
- `FASTLY_TEST_SERVICE_IDS`: Test service IDs  
- `FASTLY_PROD_SERVICE_IDS`: Production service IDs
- `FASTLY_DEV_SERVICE_NAMES`: Development service friendly names (comma-separated, optional)
- `FASTLY_TEST_SERVICE_NAMES`: Test service friendly names (comma-separated, optional)  
- `FASTLY_PROD_SERVICE_NAMES`: Production service friendly names (comma-separated, optional)
- `FASTLY_DEFAULT_KEYS`: Default cache keys (comma-separated, optional)

**Alternative patterns supported**: `DEV_SERVICE_IDS`, `SERVICE_IDS_DEV`, `FASTLY_SERVICES_DEV`
**Service names patterns**: `DEV_SERVICE_NAMES`, `SERVICE_NAMES_DEV`, `FASTLY_SERVICES_DEV_NAMES`

```bash
# Example setup
export FASTLY_TOKEN="your-fastly-api-token"
export FASTLY_DEV_SERVICE_IDS="dev-service-1,dev-service-2"
export FASTLY_DEV_SERVICE_NAMES="Dev Frontend,Dev API"
export FASTLY_DEFAULT_KEYS="global,always"
```

## Advanced Usage

```bash
# Dry run with multiple keys
bleurgh user-123 product-456 article-789 --dry-run

# Purge ALL cache for services
bleurgh --all --env prod

# Verbose output for debugging
bleurgh user-123 --verbose

# Combine options
bleurgh key1 key2 key3 --env prod --dry-run --verbose

# Emergency complete cache purge
bleurgh --all --services emergency-svc --verbose
```

### Command Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--all` | | Purge ALL cache for services (ignores keys and defaults) | `false` |
| `--env` | `-e` | Target environment (dev\|test\|prod) | `dev` |
| `--services` | `-s` | Comma-separated service IDs (overrides environment) | |
| `--verbose` | `-v` | Enable verbose logging | `false` |
| `--dry-run` | `-d` | Preview operation without purging | `false` |
| `--help` | `-h` | Show help information | |
| `--version` | | Show version number | |

---

## Detailed Documentation

<details>
<summary><strong>🔧 Configuration Details</strong></summary>

### Environment Variable Patterns

Bleurgh supports multiple environment variable patterns for maximum flexibility:

**Primary patterns:**
- `FASTLY_{ENV}_SERVICE_IDS`: Standard pattern (e.g., `FASTLY_DEV_SERVICE_IDS`)
- `{ENV}_SERVICE_IDS`: Simplified pattern (e.g., `DEV_SERVICE_IDS`)
- `SERVICE_IDS_{ENV}`: Reverse pattern (e.g., `SERVICE_IDS_DEV`)
- `FASTLY_SERVICES_{ENV}`: Alternative pattern (e.g., `FASTLY_SERVICES_DEV`)

**Service names patterns (optional):**
- `FASTLY_{ENV}_SERVICE_NAMES`: Standard pattern (e.g., `FASTLY_DEV_SERVICE_NAMES`)
- `{ENV}_SERVICE_NAMES`: Simplified pattern (e.g., `DEV_SERVICE_NAMES`)
- `SERVICE_NAMES_{ENV}`: Reverse pattern (e.g., `SERVICE_NAMES_DEV`)
- `FASTLY_SERVICES_{ENV}_NAMES`: Alternative pattern (e.g., `FASTLY_SERVICES_DEV_NAMES`)

### Service Names (Optional)

Bleurgh supports friendly service names that are displayed in logs alongside service IDs. This makes it easier to identify which services are being purged, especially in team environments.

```bash
# Service IDs are required for API calls
export FASTLY_DEV_SERVICE_IDS="svc-abc123,svc-def456,svc-ghi789"

# Service names are optional and used for display only
export FASTLY_DEV_SERVICE_NAMES="Frontend Service,API Service,Worker Service"
```

**Important notes about service names:**
- Service names are purely cosmetic and used only for logging
- They should match the order of service IDs (1st name = 1st ID, etc.)
- If names and IDs don't match up perfectly, the tool gracefully handles mismatches
- Missing names will fall back to showing just the service ID
- Extra names beyond the number of IDs are ignored
- The app will never crash due to name/ID mismatches

### Complete Configuration Example

```bash
export FASTLY_TOKEN="your-fastly-api-token"

# Choose any of these patterns that works best for you:
export FASTLY_DEV_SERVICE_IDS="dev-service-1,dev-service-2"
export TEST_SERVICE_IDS="test-service-1,test-service-2"  
export SERVICE_IDS_PROD="prod-service-1,prod-service-2"

# Optional - Service names for friendly display
export FASTLY_DEV_SERVICE_NAMES="Dev Frontend,Dev API"
export TEST_SERVICE_NAMES="Test Frontend,Test API"
export SERVICE_NAMES_PROD="Prod Frontend,Prod API"

# Optional - Default keys
export FASTLY_DEFAULT_KEYS="global,always,common"
```

</details>

<details>
<summary><strong>⚙️ How It Works</strong></summary>

1. **Key Assembly**: Combines default keys (if configured via `FASTLY_DEFAULT_KEYS`) with your specified key(s)
2. **Service Discovery**: Uses flexible environment variable patterns or `--services` override
3. **Concurrent Purging**: Makes parallel API calls to all services
4. **Result Reporting**: Shows success/failure status for each service

### Service ID Resolution Priority

1. **Direct override**: `--services` parameter (highest priority)
2. **Environment variables**: Multiple patterns supported
3. **No fallback**: If no service IDs are configured, the tool will show setup instructions

### Purge Keys

The tool automatically includes default keys (if configured via `FASTLY_DEFAULT_KEYS`) plus your specified key(s):

- With defaults: `bleurgh user-123` → `["global", "always", "user-123"]`
- Without defaults: `bleurgh user-123` → `["user-123"]`
- Multiple keys: `bleurgh key1 key2 key3` → `["global", "always", "key1", "key2", "key3"]`

### URL Purging

When the first argument starts with `https://`, bleurgh automatically switches to URL purge mode:

- **Global purging**: URLs are purged globally across Fastly's network (not per-service)
- **Single API call**: Only one purge request is made regardless of configured services
- **Extra keys ignored**: Additional arguments after the URL are ignored with a warning
- **Environment independent**: URL purges work the same across all environments

Examples:
```bash
# Purge a specific page globally
bleurgh https://example.com/page

# URL with query parameters (automatically encoded)
bleurgh "https://example.com/api/data?id=123&type=json"

# Multiple arguments - extra keys are ignored with warning
bleurgh https://example.com/page extra-key another-key
# ⚠️ Warning: URL detected: https://example.com/page - ignoring additional keys: extra-key, another-key
```

</details>

<details>
<summary><strong>📚 Examples & Use Cases</strong></summary>

### Development Workflow

```bash
# Preview changes in dev
bleurgh feature-xyz --dry-run --verbose

# Actually purge dev cache
bleurgh feature-xyz

# Purge multiple related features at once
bleurgh feature-xyz feature-abc component-123 --env dev

# Purge numerical content IDs (e.g., from CMS)
bleurgh 123456 789012 999 --dry-run

# Deploy to test and purge
bleurgh feature-xyz --env test

# Production deployment with specific services
bleurgh feature-xyz --services prod-svc-1,prod-svc-2

# Emergency complete cache clear
bleurgh --all --services emergency-svc --verbose

# Emergency purge with specific keys
bleurgh critical-fix urgent-update hotfix-123 --services emergency-svc --verbose

# Complete cache refresh for maintenance
bleurgh --all --env prod --dry-run

# Mixed keys - user IDs, content IDs, and feature flags
bleurgh user-123 456789 feature-new-ui product-abc --env prod

# Release purge - clear multiple cache keys for a release
bleurgh release-v2.1.0 api-v2 frontend-v2 --env prod --verbose
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Purge Fastly Cache
  run: |
    npx bleurgh ${{ github.sha }} --env prod
  env:
    FASTLY_TOKEN: ${{ secrets.FASTLY_TOKEN }}
    FASTLY_PROD_SERVICE_IDS: ${{ secrets.FASTLY_PROD_SERVICE_IDS }}

# Alternative with direct service specification
- name: Purge Specific Services
  run: |
    npx bleurgh ${{ github.sha }} --services ${{ secrets.PROD_SERVICES }}
  env:
    FASTLY_TOKEN: ${{ secrets.FASTLY_TOKEN }}

# Purge multiple keys for a release
- name: Purge Release Cache
  run: |
    npx bleurgh release-${{ github.ref_name }} api-cache frontend-cache --env prod
  env:
    FASTLY_TOKEN: ${{ secrets.FASTLY_TOKEN }}
    FASTLY_PROD_SERVICE_IDS: ${{ secrets.FASTLY_PROD_SERVICE_IDS }}

# Complete cache flush for major deployments
- name: Complete Cache Flush
  run: |
    npx bleurgh --all --env prod
  env:
    FASTLY_TOKEN: ${{ secrets.FASTLY_TOKEN }}
    FASTLY_PROD_SERVICE_IDS: ${{ secrets.FASTLY_PROD_SERVICE_IDS }}
```

### Docker Usage

```dockerfile
FROM node:18-alpine
RUN npm install -g bleurgh
ENTRYPOINT ["bleurgh"]
```

```bash
docker run --rm \
  -e FASTLY_TOKEN="your-token" \
  -e PROD_SERVICE_IDS="service1,service2" \
  your-image user-123 --env prod

# Or with direct service specification
docker run --rm \
  -e FASTLY_TOKEN="your-token" \
  your-image user-123 --services service1,service2

# Complete cache purge
docker run --rm \
  -e FASTLY_TOKEN="your-token" \
  -e PROD_SERVICE_IDS="service1,service2" \
  your-image --all --env prod
```

</details>

## Error Handling

The tool provides detailed error messages and exit codes:

- **Exit Code 0**: All operations successful
- **Exit Code 1**: One or more operations failed

Example error scenarios:
- Missing `FASTLY_TOKEN`
- Invalid service IDs
- Network connectivity issues
- Insufficient API permissions

---

## Development & Contributing

### Development Setup

```bash
git clone <repo-url>
cd bleurgh
npm install
npm run build
npm test
```

### Available Scripts

```bash
npm run build      # Compile TypeScript
npm run dev        # Run with ts-node
npm test           # Run comprehensive test suite
npm run test:watch # Run tests in watch mode  
npm run test:coverage # Run tests with coverage report
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## Technical Reference

<details>
<summary><strong>🧪 Testing</strong></summary>

Bleurgh includes a comprehensive test suite with excellent coverage:

- **Core Logic Tests** (`test/core.test.ts`): Unit tests for all core functions
- **End-to-End Tests** (`test/e2e.test.ts`): Integration tests for real-world scenarios
- **CLI Tests** (`test/cli.test.ts`): CLI integration tests (currently skipped in automated runs)

**Test Coverage:**
- 98.7% Statement Coverage
- 96.42% Branch Coverage  
- 100% Function Coverage
- 98.61% Line Coverage

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode during development
npm run test:watch
```

The test suite includes:
- **Core Logic Tests** (`test/core.test.ts`): Unit tests for service ID resolution, key handling, and error scenarios
- **End-to-End Integration Tests** (`test/e2e.test.ts`): Real-world workflow testing and edge cases
- All business logic is thoroughly tested; CLI layer is a thin wrapper around tested core functions

</details>

<details>
<summary><strong>🏗️ Project Structure</strong></summary>

```
├── src/
│   ├── index.ts      # Main CLI implementation
│   ├── core.ts       # Core business logic
│   ├── cli-help.ts   # Contextual help system
│   └── setup.ts      # Setup and configuration
├── test/             # Test suites
├── scripts/          # Utility scripts
├── dist/             # Compiled JavaScript (auto-generated)
├── package.json      # Package configuration
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

</details>

<details>
<summary><strong>🔗 API Reference</strong></summary>

### Fastly Purge API

This tool uses the [Fastly Purge API](https://docs.fastly.com/en/guides/purging#purge-by-surrogate-key):

```
POST https://api.fastly.com/service/{service_id}/purge
```

For the `--all` flag, it uses the purge all endpoint:

```
POST https://api.fastly.com/service/{service_id}/purge_all
```

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `FASTLY_TOKEN` | ✅ | Fastly API token | `abc123...` |
| `FASTLY_DEV_SERVICE_IDS` | ❌ | Dev service IDs (primary pattern) | `svc1,svc2` |
| `DEV_SERVICE_IDS` | ❌ | Dev service IDs (alternative pattern) | `svc1,svc2` |
| `SERVICE_IDS_DEV` | ❌ | Dev service IDs (reverse pattern) | `svc1,svc2` |
| `FASTLY_SERVICES_DEV` | ❌ | Dev service IDs (alternative pattern) | `svc1,svc2` |
| `FASTLY_DEV_SERVICE_NAMES` | ❌ | Dev service friendly names (optional) | `Frontend,API` |
| `DEV_SERVICE_NAMES` | ❌ | Dev service names (alternative pattern) | `Frontend,API` |
| `SERVICE_NAMES_DEV` | ❌ | Dev service names (reverse pattern) | `Frontend,API` |
| `FASTLY_SERVICES_DEV_NAMES` | ❌ | Dev service names (alternative pattern) | `Frontend,API` |
| `FASTLY_DEFAULT_KEYS` | ❌ | Default purge keys (comma-separated) | `global,always` |

*Note: Similar patterns work for TEST and PROD environments*

</details>

<details>
<summary><strong>🔒 Security</strong></summary>

The bleurgh CLI includes robust security validation to prevent command injection and protect your environment:

### Setup Security Features

- **Input Validation**: All configuration values are validated for dangerous patterns, shell metacharacters, and suspicious keywords
- **Shell Injection Protection**: Uses the `shescape` library to detect values that could be exploited in shell environments
- **Command Structure Validation**: Export commands are validated to ensure they follow safe patterns
- **Environment Variable Allowlist**: Only approved Fastly-related environment variables can be set
- **Base64 Configuration**: Setup strings are base64-encoded to prevent accidental exposure in logs

### Security Patterns Detected

The CLI automatically detects and prevents:
- Command injection attempts (`; rm -rf /`, `$(whoami)`, etc.)
- Shell metacharacters that could be exploited
- Path traversal attempts (`../`)
- Control characters and null bytes
- Suspicious keywords (curl, wget, eval, etc.)
- Invalid environment variable names

### Best Practices

- Always verify setup configuration strings from trusted sources
- Use the `--dry-run` flag to preview operations before execution
- Regularly rotate your Fastly API tokens
- Keep your CLI updated to get the latest security improvements

</details>

---

## Support & Community

- 🐛 [Report Issues](https://github.com/barlind/bleurgh/issues)
- 📖 [Documentation](https://github.com/barlind/bleurgh)
- 💬 [Discussions](https://github.com/barlind/bleurgh/discussions)

## License

MIT

## Changelog

### v1.3.0
- **NEW**: URL purge support - automatically detects URLs starting with `https://` and purges them globally
- **IMPROVED**: URL purging is now global across Fastly's network, not per-service, for better efficiency
- **IMPROVED**: Enhanced logging for URL purges to clarify global scope
- **IMPROVED**: Better validation and warnings when URL is mixed with other keys (ignores extra keys)
- **TECHNICAL**: Optimized URL purge operations to make only one API call regardless of configured services
- **TECHNICAL**: Added comprehensive test coverage for URL purge functionality
- **UPDATED**: CLI help and documentation to clarify URL purge behavior

### v1.2.0
- **NEW**: Complete cache purge with `--all` flag - purges entire cache for services without requiring specific keys
- **NEW**: Enhanced CLI validation - prevents using `--all` with specific keys for safety
- **NEW**: Updated help documentation to include complete cache purge examples
- **IMPROVED**: Better error messages for invalid flag combinations
- **IMPROVED**: Enhanced logging to differentiate between key-specific and complete purges
- **TECHNICAL**: Added comprehensive test coverage for new `--all` functionality
- **TECHNICAL**: Refactored core purge logic for better maintainability and reduced complexity

### v1.1.0
- **NEW**: Multiple keys support - purge multiple cache keys in a single command
- **NEW**: Friendly service names support via `*_SERVICE_NAMES` environment variables for better logging
- **NEW**: Team setup feature with base64-encoded configuration and selective export options
- **NEW**: Contextual help system - shows setup instructions or quick start based on configuration
- **NEW**: Comprehensive test suite with 98%+ coverage (Jest-based unit and integration tests)
- **NEW**: Automated testing in CI/CD pipeline
- **FIXED**: Support for numerical cache keys (e.g., `123456`, `0`, `-123`, `3.14`)
- Enhanced CLI with flexible positional arguments and setup options
- Improved error handling and logging with colorized output
- Updated examples and documentation
- Improved logging to show user keys separately from all keys
- Core logic extracted to separate modules for better testability
- Removed all hardcoded fallback values for better user experience
- Service names feature gracefully handles mismatches between IDs and names without crashing

### v1.0.0
- Initial release
- Multi-environment support
- Dynamic service discovery with multiple environment variable patterns
- Direct service override with --services parameter
- Configurable service IDs
- Dry run mode
- Verbose logging
- Concurrent purging
