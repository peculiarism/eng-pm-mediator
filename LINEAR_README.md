# PM Updater - Now with Linear Support! 🚀

PM Updater now supports **both Jira and Linear** as issue tracking platforms!

## Quick Start

### Using with Linear

```yaml
- uses: your-org/pm-updater@v1
  with:
    issue_tracker: linear
    linear_api_key: ${{ secrets.LINEAR_API_KEY }}
    linear_team_key: TEAM
    slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
    slack_channel_or_user: C01234567
```

### Using with Jira (Default)

```yaml
- uses: your-org/pm-updater@v1
  with:
    # issue_tracker: jira is the default
    jira_base_url: https://company.atlassian.net
    jira_email: ${{ secrets.JIRA_EMAIL }}
    jira_api_token: ${{ secrets.JIRA_API_TOKEN }}
    jira_project_key: PROJ
    slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
    slack_channel_or_user: C01234567
```

## Key Features

### Unified Interface
- Same Slack notification format for both platforms
- Consistent configuration options
- Sprint (Jira) and Cycle (Linear) support

### Platform-Specific Support

**Jira:**
- Sprint tracking
- Custom fields for PM assignment
- JQL-based filtering
- Board integration

**Linear:**
- Cycle tracking
- Team-based organization
- GraphQL API
- Modern, fast queries

## Documentation

- **[Linear Setup Guide](./LINEAR_SETUP.md)** - Complete Linear configuration guide
- **[Jira Setup Guide](./SETUP.md)** - Original Jira setup instructions
- **[Main README](./README.md)** - Full feature documentation
- **[Architecture](./ARCHITECTURE.md)** - Technical design details

## Commit Message Format

Both platforms use the same format:

```bash
# Works for both Jira (PROJ-123) and Linear (TEAM-123)
git commit -m "PROJ-123 Fix authentication bug"
git commit -m "TEAM-456 Update user dashboard"
```

## Comparison

| Feature | Jira | Linear |
|---------|------|--------|
| Work Iteration | Sprint | Cycle |
| Grouping | Project | Team |
| API | REST | GraphQL |
| ID Format | PROJ-123 | TEAM-123 |
| PM Assignment | Custom Field | Manual Mapping |
| Performance | Good | Excellent |

## Which Should You Use?

**Choose Linear if:**
- You want a modern, fast issue tracker
- Your team is small to medium-sized
- You value simplicity and speed
- You're starting fresh

**Choose Jira if:**
- You have existing Jira workflows
- You need extensive customization
- You have complex enterprise requirements
- You're already invested in Atlassian ecosystem

## Migration from Jira to Linear

### 1. Update Configuration

**Before (Jira):**
```yaml
with:
  jira_base_url: https://company.atlassian.net
  jira_email: ${{ secrets.JIRA_EMAIL }}
  jira_api_token: ${{ secrets.JIRA_API_TOKEN }}
  jira_project_key: PROJ
```

**After (Linear):**
```yaml
with:
  issue_tracker: linear
  linear_api_key: ${{ secrets.LINEAR_API_KEY }}
  linear_team_key: TEAM
```

### 2. Update Secrets

Remove Jira secrets, add Linear:
- Remove: `JIRA_EMAIL`, `JIRA_API_TOKEN`
- Add: `LINEAR_API_KEY`

### 3. Update Commit Messages

Linear uses the same format, just different prefixes:
- Jira: `PROJ-123`
- Linear: `TEAM-123`

### 4. Test

```bash
git commit -m "TEAM-1 Test Linear integration"
git push
```

## Common Configuration

These settings work the same for both platforms:

```yaml
environment: staging
only_active_sprint: 'true'  # Works for both sprints and cycles
ticket_status_filter: 'In Progress,In Review'
pm_mapping_json: '{"PROJ": "U123", "TEAM": "U456"}'
```

## Examples

### Jira Workflow

```yaml
name: Deploy with Jira

on: [push]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/pm-updater@v1
        with:
          jira_base_url: ${{ secrets.JIRA_BASE_URL }}
          jira_email: ${{ secrets.JIRA_EMAIL }}
          jira_api_token: ${{ secrets.JIRA_API_TOKEN }}
          jira_project_key: PROJ
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
          slack_channel_or_user: ${{ vars.SLACK_CHANNEL }}
```

### Linear Workflow

```yaml
name: Deploy with Linear

on: [push]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/pm-updater@v1
        with:
          issue_tracker: linear
          linear_api_key: ${{ secrets.LINEAR_API_KEY }}
          linear_team_key: ${{ vars.LINEAR_TEAM }}
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
          slack_channel_or_user: ${{ vars.SLACK_CHANNEL }}
```

### Multi-Platform (Advanced)

Support both platforms in different branches:

```yaml
- uses: your-org/pm-updater@v1
  if: contains(github.ref, 'legacy')
  with:
    # Use Jira for legacy branches
    jira_base_url: ${{ secrets.JIRA_BASE_URL }}
    # ... jira config

- uses: your-org/pm-updater@v1
  if: contains(github.ref, 'main')
  with:
    # Use Linear for main branch
    issue_tracker: linear
    linear_api_key: ${{ secrets.LINEAR_API_KEY }}
    # ... linear config
```

## FAQ

**Q: Can I use both Jira and Linear simultaneously?**
A: Not in the same workflow run, but you can have different workflows for different branches or use conditional logic.

**Q: Will my Slack messages look different?**
A: No! The format is identical, except "Sprint" becomes "Cycle" for Linear.

**Q: Do I need to change my commit message format?**
A: No, both use the same `KEY-123` format.

**Q: Is Linear faster than Jira?**
A: Yes, Linear's GraphQL API is generally faster than Jira's REST API.

**Q: Can I migrate my Jira data to Linear?**
A: Linear provides import tools, but that's separate from PM Updater.

## Troubleshooting

### Linear Issues

See [LINEAR_SETUP.md](./LINEAR_SETUP.md#troubleshooting)

### Jira Issues

See [SETUP.md](./SETUP.md#troubleshooting)

### Common Issues

**Wrong tracker selected:**
```yaml
# Make sure to specify for Linear
issue_tracker: linear
```

**Missing credentials:**
- Jira needs: `jira_base_url`, `jira_email`, `jira_api_token`
- Linear needs: `linear_api_key`

**No issues found:**
- Check commit message format
- Verify issue IDs exist in your tracker
- Check team/project key filter

## Contributing

We welcome contributions for:
- Other issue trackers (GitHub Issues, Azure DevOps, etc.)
- Enhanced Linear features
- Better Jira integration
- Documentation improvements

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT - See [LICENSE](./LICENSE)

---

**Built with ❤️ for modern software teams**
