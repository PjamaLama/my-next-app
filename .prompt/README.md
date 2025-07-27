# Prompt Management

This directory contains the source prompt files for the Genkit AI flows.

## Directory Structure

- `.prompt/` - Source directory for editing prompts (source of truth)
- `prompts/` - Genkit prompt directory (where Genkit loads prompts from)

## Workflow

1. **Edit prompts** in the `.prompt/` directory
2. **Copy updated prompts** to the `prompts/` directory for Genkit to use
3. **Genkit automatically reloads** prompts from the `prompts/` directory

## Available Prompts

- `sheetUpdate.prompt` - AI instructions for updating Google Sheets based on user transcripts

## Quick Commands

To copy updated prompts to Genkit:
```bash
# Using npm script (recommended)
npm run copy-prompts

# Or manually
cp .prompt/*.prompt prompts/
```

## Why This Setup?

- **Separation of concerns**: Keep source prompts separate from runtime prompts
- **Version control**: Track prompt changes in `.prompt/` directory
- **Hot reloading**: Genkit can reload prompts without code changes
- **Easy editing**: Edit prompts without touching code files

## Tips

- Always edit prompts in `.prompt/` directory first
- Test prompt changes by copying to `prompts/` directory
- Commit prompt changes to version control
- Use descriptive prompt names for easy identification 