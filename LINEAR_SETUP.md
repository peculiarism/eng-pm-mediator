# Linear Setup Guide

This guide explains how to configure PM Updater to work with Linear instead of Jira.

## Overview

Linear is a modern issue tracking tool that uses **cycles** (similar to Jira sprints) to organize work. PM Updater integrates with Linear via its GraphQL API to track which issues are in the active cycle and notify PMs when they're deployed.

## Step 1: Get Your Linear API Key

### Create a Personal API Key

1. Go to Linear Settings → API → [Personal API keys](https://linear.app/settings/api)
2. Click "Create new key"
3. Give it a name (e.g., "GitHub PM Updater")
4. Select the appropriate scopes:
   - `read` - Required for reading issues and cycles
5. Copy the API key (starts with `lin_api_`)
6. **Important**: Store this key securely - you won't see it again!

### Alternative: OAuth Application

For team-wide usage, you can create an OAuth application:
1. Go to Linear Settings → API → OAuth applications
2. Create a new application
3. Use the OAuth token in your workflow

## Step 2: Find Your Team Key

Linear organizes work by teams. Each team has a unique key.

### Method 1: From Linear URL

1. Navigate to your Linear team
2. Look at the URL: `https://linear.app/your-workspace/team/TEAM/...`
3. The team key is the uppercase letters (e.g., `TEAM`, `ENG`, `PROD`)

### Method 2: From Issue IDs

Your Linear issues have IDs like `TEAM-123`:
- `TEAM` is the team key
- `123` is the issue number

### Method 3: Via GraphQL API

Test your API key and list teams:

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: lin_api_YOUR_KEY_HERE" \
  -d '{
    "query": "{ teams { nodes { id key name } } }"
  }'
```

## Step 3: Configure GitHub Secrets

Add these secrets to your repository (Settings → Secrets and variables → Actions):

| Secret Name | Value | Example |
|-------------|-------|---------|
| `LINEAR_API_KEY` | Your Linear API key | `lin_api_abc123...` |
| `SLACK_BOT_TOKEN` | Your Slack bot token | `xoxb-...` |

### Optional Variables

| Variable Name | Value | Example |
|--------------|-------|---------|
| `LINEAR_TEAM_KEY` | Your Linear team key | `TEAM` |
| `SLACK_PM_CHANNEL` | Slack channel/user ID | `C01234567` |

## Step 4: Create GitHub Workflow

Create `.github/workflows/pm-notification-linear.yml`:

```yaml
name: PM Notification (Linear)

on:
  push:
    branches:
      - main
      - develop

jobs:
  notify-pm:
    name: Notify PM of Deployment
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Notify PM
        uses: your-org/pm-updater@v1
        with:
          issue_tracker: linear
          linear_api_key: ${{ secrets.LINEAR_API_KEY }}
          linear_team_key: TEAM
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
          slack_channel_or_user: C01234567
          environment: staging
          only_active_sprint: 'true'
```

## Step 5: Commit Message Format

Include Linear issue IDs in your commit messages:

```bash
# Single issue
git commit -m "TEAM-123 Fix authentication bug"

# Multiple issues
git commit -m "TEAM-123 TEAM-456 Update user dashboard"

# Conventional commits
git commit -m "feat(TEAM-789): Add dark mode"
```

### Supported Formats

- `TEAM-123 Description`
- `[TEAM-456] Description`
- `(TEAM-789) Description`
- `Multiple: TEAM-111 and TEAM-222`

## Configuration Options

### Filter by Team

Only process issues from a specific team:

```yaml
with:
  linear_team_key: TEAM
```

Without this, all issue IDs found in commits will be processed.

### Filter by Active Cycle

Only notify for issues in the currently active cycle:

```yaml
with:
  only_active_sprint: 'true'  # Default
```

Set to `'false'` to notify for all issues, regardless of cycle.

### Filter by Status

Only notify for issues in specific Linear states:

```yaml
with:
  ticket_status_filter: 'In Progress,In Review,Ready for Testing'
```

Common Linear statuses:
- Backlog
- Todo
- In Progress
- In Review
- Done
- Canceled

### PM Mapping

Map Linear teams to specific Slack users:

```yaml
with:
  pm_mapping_json: |
    {
      "TEAM": "U01234567",
      "ENG": "U76543210",
      "PROD": "U98765432"
    }
```

## Linear Concepts vs. Jira

| Linear | Jira | Notes |
|--------|------|-------|
| Issue | Issue/Ticket | Same concept |
| Team | Project | Issues belong to teams |
| Cycle | Sprint | Time-boxed work periods |
| State | Status | Issue workflow states |
| Identifier (TEAM-123) | Key (PROJ-123) | Issue reference format |

## Testing

### Test Linear API Connection

```bash
# List your teams
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: lin_api_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ viewer { name email } teams { nodes { key name } } }"
  }'
```

### Test Issue Query

```bash
# Get specific issue
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: lin_api_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { issue(id: \"TEAM-123\") { identifier title state { name } cycle { name } } }"
  }'
```

### Test Active Cycle

```bash
# Get active cycle for team
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: lin_api_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { teams { nodes { key activeCycle { name startsAt endsAt } } } }"
  }'
```

## Slack Message Example

When using Linear, the Slack message will show cycles instead of sprints:

```
🚀 New Deployment Ready for Testing

Branch: main                Environment: production
Deployed by: jane-dev      Commit: abc1234

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Issues Ready for Testing:

TEAM-123 - Fix authentication timeout
🔄 In Progress | Cycle: Q1 Sprint 3 | Assignee: John Doe

TEAM-456 - Update user dashboard
👀 In Review | Cycle: Q1 Sprint 3 | Assignee: Jane Smith
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2 issues deployed at Jan 15, 2025 at 10:30 AM
```

## Troubleshooting

### "Linear API error"

- Verify API key is valid and starts with `lin_api_`
- Check API key hasn't expired
- Ensure API key has `read` scope

### "No issues found"

- Verify commit messages contain Linear issue IDs
- Check team key matches (case-sensitive)
- Ensure issues exist in Linear

### "No issues in active cycle"

- Check that issues are assigned to a cycle
- Verify the cycle is active (started but not completed)
- Set `only_active_sprint: 'false'` to test without cycle filtering

### "Cannot find issue TEAM-123"

- Verify issue ID is correct
- Check that you have access to the team
- Ensure API key has permissions for that team

## Advanced Configuration

### Multiple Teams

Handle issues from multiple Linear teams:

```yaml
with:
  # Don't specify linear_team_key to process all teams
  pm_mapping_json: |
    {
      "TEAM": "U01234567",
      "ENG": "U76543210"
    }
```

### Custom Fields

Linear doesn't have a built-in PM field, but you can extend the code to use custom fields or team membership.

Edit `src/services/linear.ts`:

```typescript
// Add custom field query
cycle {
  name
}
customFields {
  pm {
    value
  }
}
```

### Webhook Integration (Future)

Linear supports webhooks for real-time updates. While PM Updater currently uses polling on push, webhooks could enable:
- Instant notifications on issue status changes
- Cycle start/end notifications
- Issue assignment notifications

## Comparison: Linear vs. Jira

### Advantages of Linear

1. **Modern GraphQL API** - More flexible and efficient
2. **Better Performance** - Faster queries and responses
3. **Simpler Data Model** - Easier to understand and query
4. **Better Defaults** - Sensible status workflows out of the box

### Differences to Note

1. **No Board ID** - Linear doesn't use board IDs like Jira
2. **Cycles vs. Sprints** - Different terminology, same concept
3. **Team-Based** - Everything organized by team, not project
4. **Automatic URLs** - Linear provides full URLs in API responses

## Next Steps

1. Test the integration with a simple commit
2. Verify Slack notifications are working
3. Customize status filters for your workflow
4. Set up PM mapping for your teams
5. Document for your team

## Support

For Linear-specific issues:
- [Linear API Documentation](https://developers.linear.app/docs)
- [Linear GraphQL Playground](https://studio.apollographql.com/public/Linear-API/schema/reference)
- [PM Updater Issues](https://github.com/your-org/pm-updater/issues)
