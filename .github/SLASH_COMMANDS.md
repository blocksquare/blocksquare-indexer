# Slash Commands

## Setup (One-Time)

1. Create fine-grained PAT: Settings → Developer Settings → Fine-grained tokens
   - Repository: `blocksquare/blocksquare-indexer` only
   - Permissions:
     - Actions: Read and write
     - Pull requests: Read and write
     - Metadata: Read (automatic)
   - Expiration: 90 days
2. Add to repo secrets as `PAT_WORKFLOW_DISPATCH`

## Available Commands

- `/generate-config` - Generate config.yaml for target environment

## Adding New Command

1. Create workflow with `workflow_dispatch` trigger and `pull_request` input
2. Add command name to `slash-command-dispatcher.yml` commands list
3. Deploy dispatcher to `release` branch

Worker workflows can live on any branch.
