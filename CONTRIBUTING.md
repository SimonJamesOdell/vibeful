# Contributing to Vibeful

Thanks for wanting to help! Vibeful is an open-source AI agent platform that makes it easy to add agentic functionality to any web app.

## Quick Start for Contributors

```bash
git clone https://github.com/vibeful/vibeful.git
cd vibeful
cp .env.example .env
# Add your DeepSeek API key to .env
docker compose up -d
```

## What to Work On

- **Good first issues**: Check the `good first issue` tag on GitHub
- **Documentation**: Improve docs, add examples, fix typos
- **SDK components**: Add new widget types, improve the chat UI
- **MCP servers**: Build new tool servers (Slack, email, database connectors)
- **Agent nodes**: Add new graph nodes for specialized reasoning
- **Tests**: Write Playwright E2E tests from the spec in `packages/sdk/tests/e2e-specs.md`

## Development Workflow

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `docker compose run --rm test`
5. Submit a PR

## Code Standards

- **Python**: Follow PEP 8, use type hints, async/await for I/O
- **TypeScript/React**: Use strict mode, functional components, CSS-in-JS
- **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`, `test:`)

## Questions?

Open a GitHub Discussion or join our community.
