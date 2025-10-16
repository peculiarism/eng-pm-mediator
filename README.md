
<img width="576" height="384" alt="dilbert" src="https://github.com/user-attachments/assets/0cc8df43-2eb7-426d-b292-1cfbf7b65443" />

# The Engineering <> PM Mediator - GitHub Action by DevDay

A GitHub Action that automatically notifies Product Managers via Slack when tickets in the active sprint are deployed. Bridges Jira sprint tracking with Slack notifications to keep PMs informed about deployment status.

## Features

- 🔍 **Automatic Ticket Detection**: Parses commit messages for Jira ticket IDs
- 🏃 **Sprint Filtering**: Only notifies for tickets in the active sprint
- 📊 **Rich Notifications**: Sends beautifully formatted Slack messages with ticket details
- 🎯 **Flexible Targeting**: Supports channel notifications or direct messages
- ⚙️ **Configurable**: Filter by status, environment, and more
- 🔐 **Secure**: All credentials stored in GitHub Secrets

## How It Works

```
Git Push → Parse Commits → Extract Ticket IDs → Query Jira API
    ↓
Check Active Sprint → Get Ticket Details → Match PM
    ↓
Format Message → Send to Slack → Log Results
```

## Setup

### Prerequisites

1. **Jira API Access**
   - Jira base URL (e.g., `https://yourcompany.atlassian.net`)
   - User email and API token ([Create one here](https://id.atlassian.com/manage-profile/security/api-tokens))

2. **Slack Bot Token**
   - Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
   - Add bot token scopes: `chat:write`, `users:read`, `users:read.email`
   - Install app to workspace and copy the Bot User OAuth Token

3. **GitHub Secrets**
   Configure these secrets in your repository (Settings → Secrets and variables → Actions):
   - `JIRA_BASE_URL`: Your Jira instance URL
   - `JIRA_EMAIL`: Email for Jira API authentication
   - `JIRA_API_TOKEN`: Jira API token
   - `SLACK_BOT_TOKEN`: Slack bot token (starts with `xoxb-`)

4. **GitHub Variables** (optional, can also use secrets)
   - `JIRA_PROJECT_KEY`: Your Jira project key (e.g., `PROJ`)
   - `SLACK_PM_CHANNEL`: Slack channel or user ID (e.g., `C01234567` or `U01234567`)

### Installation

#### Option 1: Use in This Repository

1. Copy the example workflow:
```bash
cp .github/workflows/pm-notification.yml .github/workflows/pm-notification.yml
```

2. Update the workflow with your configuration

3. Commit and push to trigger the action

#### Option 2: Use as External Action

Add to your workflow file:

```yaml
- name: Notify PM
  uses: your-org/pm-updater@v1
  with:
    jira_base_url: ${{ secrets.JIRA_BASE_URL }}
    jira_email: ${{ secrets.JIRA_EMAIL }}
    jira_api_token: ${{ secrets.JIRA_API_TOKEN }}
    jira_project_key: PROJ
    slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
    slack_channel_or_user: C01234567
    environment: staging
```

## Configuration

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `jira_base_url` | Yes | - | Jira base URL (e.g., `https://company.atlassian.net`) |
| `jira_email` | Yes | - | Jira user email for authentication |
| `jira_api_token` | Yes | - | Jira API token |
| `jira_project_key` | Yes | - | Jira project key (e.g., `PROJ`) |
| `slack_bot_token` | Yes | - | Slack bot token |
| `slack_channel_or_user` | Yes | - | Slack channel ID or user ID |
| `environment` | No | `staging` | Deployment environment |
| `only_active_sprint` | No | `true` | Only notify for tickets in active sprint |
| `ticket_status_filter` | No | - | Comma-separated list of statuses to filter |
| `pm_mapping_json` | No | `{}` | JSON mapping of project keys to Slack user IDs |

### Outputs

| Output | Description |
|--------|-------------|
| `tickets_found` | Number of tickets found in commits |
| `tickets_notified` | Number of tickets for which notifications were sent |
| `slack_message_ts` | Timestamp of the Slack message sent |

## Usage Examples

### Basic Usage

```yaml
name: PM Notification

on:
  push:
    branches: [main, develop]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/pm-updater@v1
        with:
          jira_base_url: https://company.atlassian.net
          jira_email: ${{ secrets.JIRA_EMAIL }}
          jira_api_token: ${{ secrets.JIRA_API_TOKEN }}
          jira_project_key: PROJ
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
          slack_channel_or_user: C01234567
```

### With Status Filtering

Only notify for tickets in specific statuses:

```yaml
- uses: your-org/pm-updater@v1
  with:
    # ... other inputs
    ticket_status_filter: 'In Progress,Code Review,Ready for Testing'
```

### Environment-Specific Channels

Send to different channels based on environment:

```yaml
- uses: your-org/pm-updater@v1
  with:
    # ... other inputs
    environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    slack_channel_or_user: ${{ github.ref == 'refs/heads/main' && secrets.PROD_PM_CHANNEL || secrets.STAGING_PM_CHANNEL }}
```

### PM Mapping by Project

Map different projects to different PMs:

```yaml
- uses: your-org/pm-updater@v1
  with:
    # ... other inputs
    pm_mapping_json: '{"PROJ": "U01234567", "TEAM": "U76543210"}'
```

### All Features Combined

```yaml
- uses: your-org/pm-updater@v1
  id: pm-notify
  with:
    jira_base_url: https://company.atlassian.net
    jira_email: ${{ secrets.JIRA_EMAIL }}
    jira_api_token: ${{ secrets.JIRA_API_TOKEN }}
    jira_project_key: PROJ
    slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
    slack_channel_or_user: C01234567
    environment: production
    only_active_sprint: 'true'
    ticket_status_filter: 'Ready for Testing,In Testing'
    pm_mapping_json: ${{ secrets.PM_MAPPING }}

- name: Log results
  run: |
    echo "Found ${{ steps.pm-notify.outputs.tickets_found }} tickets"
    echo "Notified about ${{ steps.pm-notify.outputs.tickets_notified }} tickets"
```

## Commit Message Format

The action automatically detects Jira ticket IDs in commit messages. Supported formats:

- `PROJ-123 Fix login bug`
- `[PROJ-456] Update dashboard`
- `Fix auth issue (PROJ-789)`
- `Multiple tickets PROJ-111 and PROJ-222`

### Best Practices

1. **Include ticket ID at the start**: `PROJ-123: Description`
2. **Use conventional commits**: `feat(PROJ-456): Add new feature`
3. **Multiple tickets**: Reference all relevant tickets in commit message

## Slack Message Preview

The action sends rich, formatted messages like this:

```
🚀 New Deployment Ready for Testing

Branch: main                    Environment: production
Deployed by: developer-name     Commit: abc123

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tickets Ready for Testing:

PROJ-123 - Fix authentication timeout
🔄 In Progress | Sprint: Sprint 24 | Assignee: John Doe

PROJ-456 - Update user dashboard
👀 Code Review | Sprint: Sprint 24 | Assignee: Jane Smith

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2 tickets deployed at Jan 15, 2025 at 10:30 AM
```

## Development

### Build

```bash
npm install
npm run build
npm run package
```

### Testing Locally

1. Set environment variables:
```bash
export INPUT_JIRA_BASE_URL="https://company.atlassian.net"
export INPUT_JIRA_EMAIL="user@company.com"
export INPUT_JIRA_API_TOKEN="your-token"
# ... etc
```

2. Run:
```bash
node dist/index.js
```

### Project Structure

```
pm-updater/
├── .github/
│   └── workflows/          # Example workflows
├── src/
│   ├── index.ts           # Main entry point
│   ├── services/
│   │   ├── jira.ts        # Jira API client
│   │   └── slack.ts       # Slack API client
│   ├── utils/
│   │   ├── parser.ts      # Commit/ticket parser
│   │   └── logger.ts      # Structured logging
│   └── types/
│       └── index.ts       # TypeScript types
├── action.yml             # Action metadata
├── package.json
└── README.md
```

## Troubleshooting

### No tickets found

- Ensure commit messages contain valid Jira ticket IDs
- Check that `jira_project_key` matches your ticket prefix
- Review action logs for parsing details

### Jira authentication fails

- Verify `JIRA_BASE_URL` includes `https://` and no trailing slash
- Confirm API token is valid and not expired
- Check that email matches the token owner

### Slack message not sent

- Verify bot token starts with `xoxb-`
- Ensure bot has `chat:write` scope
- Check that channel/user ID is correct (starts with `C` or `U`)
- Confirm bot is added to the channel

### No issues in active sprint

- Verify tickets are assigned to an active sprint in Jira
- Set `only_active_sprint: 'false'` to disable sprint filtering
- Check Jira board configuration

## Security

- Never commit secrets to the repository
- Use GitHub Secrets for all sensitive data
- Rotate API tokens regularly
- Use least-privilege scopes for Slack bot
- Review action logs for sensitive information

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/pm-updater/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/pm-updater/discussions)

## Related Projects

- [Jira GitHub Integration](https://github.com/atlassian/gajira)
- [Slack GitHub Actions](https://github.com/slackapi/slack-github-action)

---

Built with ❤️ for better PM-developer collaboration by the [DevDay team](https://trydevday.com).
