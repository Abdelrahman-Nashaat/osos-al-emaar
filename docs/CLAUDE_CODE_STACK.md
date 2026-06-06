# Claude Code Stack

## Installed Local CLIs

- Claude Code native Windows install
- Git
- Node.js and npm
- GitHub CLI (`gh`)
- Vercel CLI
- Supabase CLI
- Python 3.14.5 from python.org
- Git Bash
- Node 24 LTS portable is installed, but system PATH still resolves `node` to Node 22.11 from Program Files unless Node is updated with administrator permissions.

## Project MCP Servers

Configured in `.mcp.json`:

- `playwright`: browser automation and E2E testing.
- `supabase`: Supabase project/database/docs access after authentication.
- `github`: GitHub repository and pull request workflows after authentication.
- `vercel`: deployment, logs, env, and project management after authentication.

Plugin-provided MCP:

- `context7`: current framework/library documentation.
- `figma`: design integration after Figma authentication.

## Installed Claude Code Plugins

- `superpowers`
- `code-review`
- `code-simplifier`
- `skill-creator`
- `mcp-server-dev`
- `claude-code-setup`
- `feature-dev`
- `frontend-design`
- `commit-commands`
- `pr-review-toolkit`
- `security-guidance`
- `session-report`
- `typescript-lsp`
- `figma`
- `context7-plugin`

## Recommended Claude Code Startup

From a fresh terminal:

```powershell
cd C:\Users\Public\projrcts\hamza
claude
```

Then inside Claude Code:

```text
/mcp
/model opus[1m]
/effort max
/plugin
/skills
```

Authenticate/approve MCP servers when prompted.

Current verified MCP status after authentication:

- GitHub connected
- Supabase connected
- Vercel connected
- Playwright connected
- Context7 connected
- Figma connected

Security note: Python 3.14.5 and Git Bash are installed so the `security-guidance` plugin hooks can run.
