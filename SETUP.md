# Setup Guide

This guide will walk you through setting up the PM Updater GitHub Action from scratch.

## Step 1: Jira Setup

### Get Your Jira Credentials

1. **Base URL**: Your Jira instance URL
   - Example: `https://yourcompany.atlassian.net`
   - Find it by logging into Jira and copying the domain

2. **API Token**:
   - Go to https://id.atlassian.com/manage-profile/security/api-tokens
   - Click "Create API token"
   - Give it a name (e.g., "GitHub PM Updater")
   - Copy the token (you won't see it again!)

3. **Email**: The email associated with your Jira account

4. **Project Key**: Your Jira project identifier
   - Example: If your tickets look like `PROJ-123`, the key is `PROJ`
   - Find it in Jira under Project Settings → Details

### Test Jira Connection

```bash
# Replace with your credentials
curl -u "your-email@company.com:your-api-token" \
  "https://yourcompany.atlassian.net/rest/api/3/myself"
```

If successful, you'll see your user profile information.

## Step 2: Slack Setup

### Create a Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name it "PM Updater" and select your workspace
4. Click "Create App"

### Configure Bot Permissions

1. In the left sidebar, click "OAuth & Permissions"
2. Scroll to "Scopes" → "Bot Token Scopes"
3. Add these scopes:
   - `chat:write` - Post messages
   - `users:read` - Look up users
   - `users:read.email` - Match Jira emails to Slack users

### Install the App

1. Scroll up to "OAuth Tokens for Your Workspace"
2. Click "Install to Workspace"
3. Review permissions and click "Allow"
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

### Get Channel/User IDs

**For a channel:**
1. Open Slack in browser
2. Navigate to the channel
3. Look at the URL: `https://app.slack.com/client/T.../C01234567`
4. The part after the last `/` is the channel ID (starts with `C`)

**For a user DM:**
1. Right-click on the user in Slack
2. Click "View profile"
3. Click the three dots → "Copy member ID"
4. The ID starts with `U`

### Invite Bot to Channel

If using a channel, invite the bot:
```
/invite @PM Updater
```

### Test Slack Connection

```bash
curl -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer xoxb-your-bot-token" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "C01234567",
    "text": "Test message from PM Updater"
  }'
```

## Step 3: GitHub Setup

### Add Secrets to GitHub

1. Go to your repository on GitHub
2. Click Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `JIRA_BASE_URL` | `https://yourcompany.atlassian.net` |
| `JIRA_EMAIL` | Your Jira email |
| `JIRA_API_TOKEN` | Your Jira API token |
| `SLACK_BOT_TOKEN` | Your Slack bot token (starts with `xoxb-`) |

### Add Variables (Optional)

Click "Variables" tab and add:

| Variable Name | Value |
|---------------|-------|
| `JIRA_PROJECT_KEY` | `PROJ` |
| `SLACK_PM_CHANNEL` | `C01234567` |

## Step 4: Install the Action

### Option A: Use in This Repository

1. The action is already set up in `.github/workflows/pm-notification.yml`
2. Update the workflow file with your configuration
3. Commit and push to test

### Option B: Build and Package

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Package for distribution
npm run package

# Commit the dist folder
git add dist/
git commit -m "Build action"
git push
```

### Option C: Publish to Marketplace

1. Create a release:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

2. Create a GitHub release from the tag
3. Check "Publish this Action to the GitHub Marketplace"

## Step 5: Test the Action

### Create a Test Commit

```bash
git commit -m "PROJ-123 Test PM notification"
git push origin main
```

### Check the Action Run

1. Go to Actions tab in GitHub
2. Click on the latest workflow run
3. Check the logs for:
   - ✅ Tickets found
   - ✅ Jira connection successful
   - ✅ Slack message sent

### Verify Slack Message

Check your Slack channel for the notification message.

## Step 6: Customize

### Filter by Status

Edit the workflow to only notify for specific statuses:

```yaml
ticket_status_filter: 'Ready for Testing,In Testing'
```

### Environment-Based Configuration

```yaml
environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
slack_channel_or_user: ${{ github.ref == 'refs/heads/main' && vars.PROD_CHANNEL || vars.STAGING_CHANNEL }}
```

### PM Mapping

Create a secret `PM_MAPPING` with JSON:
```json
{
  "PROJ": "U01234567",
  "TEAM": "U76543210"
}
```

Then in the workflow:
```yaml
pm_mapping_json: ${{ secrets.PM_MAPPING }}
```

## Troubleshooting

### "Authentication failed" - Jira

- Check that email and API token are correct
- Verify API token hasn't expired
- Ensure base URL is correct (with `https://`, no trailing slash)

### "channel_not_found" - Slack

- Verify channel/user ID is correct
- Ensure bot is invited to the channel
- Check bot has `chat:write` scope

### "No tickets found"

- Ensure commits include Jira ticket IDs
- Check project key matches (case-sensitive)
- Review action logs for parsing details

### "Sprint not active"

- Verify tickets are in an active sprint in Jira
- Set `only_active_sprint: 'false'` to test without sprint filtering

## Advanced Configuration

### Custom Sprint Field

If your Jira uses a custom field for sprints, update `src/services/jira.ts`:

```typescript
fields: 'summary,status,assignee,reporter,customfield_10020' // Replace with your sprint field
```

### Multiple Projects

Use PM mapping to handle multiple projects:

```yaml
pm_mapping_json: |
  {
    "PROJ": "U01234567",
    "TEAM": "U76543210",
    "FEAT": "U98765432"
  }
```

### Conditional Execution

Only run on certain branches:

```yaml
on:
  push:
    branches:
      - main
      - develop
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

## Next Steps

- Review the [README.md](README.md) for full documentation
- Explore example workflows in `.github/workflows/`
- Customize the Slack message format in `src/services/slack.ts`
- Add error handling for your specific use cases

## Support

If you encounter issues:

1. Check action logs in GitHub Actions tab
2. Review this setup guide
3. Open an issue with logs and configuration (sanitize secrets!)

Happy deploying! 🚀
