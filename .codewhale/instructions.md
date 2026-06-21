## Architecture Rule — Natural Language Processing

All natural-language input, intent detection, and semantic reasoning
MUST be routed through an LLM (DeepSeek via `/v1/ai/assist` or `/converse`).

String matching, keyword sets, regex patterns, and any form of
deterministic intent classification are **FORBIDDEN** for natural-language
input. This includes (but is not limited to):
  - `Set.has()`, `.includes()`, `.match()`, regex
  - Normalization + dictionary lookup
  - Keyword-based routing or classification
  - Pre-defined response dictionaries (ONBOARDING_QA, ONBOARDING_YES, etc.)

The LLM is the sole semantic brain. The frontend is hands — it extracts
`vibeful-command` blocks from LLM output and executes them deterministically.
It does not interpret user intent.

## Deployment Rule — Push Script

When making code changes to the vibeful project, always use
`.\scripts\push-deploy.ps1` instead of running `git push` directly.
This script pushes to GitHub AND triggers a pull + restart on the
test machine at `simon@192.168.0.16`, keeping the live deployment
in sync.

Deterministic processing is permitted ONLY when explicitly requested:
  - `vibeful-command` block extraction and execution
  - Structured data validation (YAML, JSON schemas)
  - Canvas state mutations (add_node, remove_node, start_tour)
