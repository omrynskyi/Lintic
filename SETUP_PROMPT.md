# Lintic Setup Prompt

Copy this into a repo-capable coding agent:

```md
Install and configure Lintic for my company.

Repository:
https://github.com/LinticAI/Lintic

What to do:
- Clone the repo and inspect it first so you understand how Lintic is configured and started.
- Ask me the setup questions you need before making important decisions.
- Determine whether this should be a standalone Lintic deployment or integrated into an existing system.
- Configure Lintic based on my answers.

Setup flow:
- If `lintic.yml` does not exist, run `npx lintic init`.
- Update `lintic.yml` or `.env` and any required environment variables or secrets.
- Set up the database and connection details required by the repo.
- Run `npx lintic migrate`.
- Run `npx lintic doctor`.
- Make sure the install is left in a runnable state.

When finished:
- Tell me exactly what you set up.
- Tell me which env vars or secrets I need.
- Tell me the exact command(s) to start Lintic.
- Tell me any remaining manual steps.
```
