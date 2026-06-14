## Project Overview

Project: IndustryX

This repository is developed using cloud AI agents. The AI must assume it is operating in a production environment and should always prefer production-ready solutions.

---

## Infrastructure

### Source Control

GitHub Repository

### Deployment

Vercel

### Database

Supabase

### Authentication

Supabase Auth

### Primary Login Method

* Anonymous Authentication
* Google OAuth

---

## Environment Variables

Environment variables are NOT stored in the repository.

All required secrets are already configured in:

* GitHub Repository Secrets
* Vercel Environment Variables

Do NOT ask for API keys, tokens, or secret values unless a new integration is being introduced.

Assume required secrets already exist.

Do NOT create `.env` files containing real secrets.

Do NOT commit secrets into the repository.

Use environment variables only.

Example:

```ts
process.env.SUPABASE_SERVICE_ROLE_KEY
process.env.GROQ_API_KEY
process.env.OPENAI_API_KEY
```

Never hardcode credentials.

---

## AI Permissions

The AI may:

* Create files
* Modify files
* Refactor architecture
* Create migrations
* Create scripts
* Install dependencies
* Add npm packages
* Update package.json
* Create GitHub Actions
* Create deployment scripts
* Create database migrations
* Create SQL functions
* Create RLS policies

The AI should perform work autonomously whenever possible.

---

## AI Restrictions

Do NOT:

* Commit secrets
* Expose secrets in logs
* Print secret values
* Store tokens in source files
* Store credentials in documentation

---

## Database Rules

Supabase is the source of truth.

Server state is authoritative.

Client state must never override validated server state.

Prefer migrations over manual database changes.

---

## Deployment Rules

Vercel is the deployment target.

All production configuration should be compatible with Vercel.

Assume production environment variables already exist.

Only request manual intervention when:

* OAuth provider setup requires owner action
* DNS configuration requires owner action
* Third-party account verification requires owner action
* Payment provider onboarding requires owner action

Otherwise perform changes automatically.

---

## Development Rules

* Production-ready only
* No placeholders
* No mock implementations
* No temporary solutions
* No demo code
* No hardcoded secrets
* Enterprise-grade architecture
* Backward compatible migrations whenever possible

---

## Decision Rule

Before asking the owner to perform a task:

1. Determine whether it can be solved through code.
2. Determine whether it can be solved through migration.
3. Determine whether it can be solved through automation.
4. Only ask the owner if external platform access is genuinely required.

Default behavior:

Implement first.
Ask later only when necessary.
