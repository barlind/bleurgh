# Quick Help for Bleurgh CLI

## TL;DR - Just Want to Run It?

1. **Install**: `npm install -g bleurgh` (or use `npx bleurgh` to run without installing)
2. **Get Fastly token**: https://manage.fastly.com/account/personal/tokens
3. **Set token**: `export FASTLY_TOKEN="your-token-here"`
4. **Set services**: `export FASTLY_DEV_SERVICE_IDS="service1,service2"`
5. **Test**: `bleurgh test-key --dry-run` (or `npx bleurgh test-key --dry-run`)
6. **Use**: `bleurgh actual-key` (or `npx bleurgh actual-key`)

## Need Service IDs?

Find them in your Fastly dashboard or ask your admin for a setup string.

## Common Issues

- **Authentication error**: Check your `FASTLY_TOKEN`
- **No services found**: Set `FASTLY_*_SERVICE_IDS` environment variables
- **Command not found**: Try `npm install -g bleurgh` again or use `npx bleurgh` instead

## More Help

- Full documentation: [`README.md`](./README.md)
- AI assistant guide: [`.ai-instructions.md`](./.ai-instructions.md)
- Issues: [GitHub Issues](https://github.com/barlind/bleurgh/issues)
