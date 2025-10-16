# PM Updater - Architecture Documentation

## Overview

PM Updater is a GitHub Action that automatically notifies Product Managers via Slack when Jira tickets in the active sprint are deployed. It bridges the gap between code deployments and PM workflows.

## System Architecture

### High-Level Flow

```
┌─────────────┐
│ Git Push    │
│ (Trigger)   │
└──────┬──────┘
       │
       v
┌─────────────────────────────┐
│ GitHub Actions Workflow     │
│ (.github/workflows)         │
└──────┬──────────────────────┘
       │
       v
┌─────────────────────────────┐
│ PM Updater Action           │
│ (src/index.ts)              │
├─────────────────────────────┤
│ 1. Load Configuration       │
│ 2. Parse Commits            │
│ 3. Extract Ticket IDs       │
└──────┬──────────────────────┘
       │
       v
┌─────────────────────────────┐
│ Jira Service                │
│ (src/services/jira.ts)      │
├─────────────────────────────┤
│ 1. Fetch Issue Details      │
│ 2. Check Active Sprint      │
│ 3. Filter by Status         │
│ 4. Get PM Information       │
└──────┬──────────────────────┘
       │
       v
┌─────────────────────────────┐
│ Slack Service               │
│ (src/services/slack.ts)     │
├─────────────────────────────┤
│ 1. Format Message           │
│ 2. Resolve PM/Channel       │
│ 3. Send Notification        │
└─────────────────────────────┘
```

## Component Architecture

### 1. Entry Point (`src/index.ts`)

**Responsibilities:**
- Load and validate configuration from GitHub Action inputs
- Get commit information from GitHub context
- Orchestrate the workflow between services
- Handle errors and set outputs

**Key Functions:**
- `loadConfig()`: Validates inputs using Zod schemas
- `getCommitInfo()`: Extracts commits from GitHub webhook payload
- `resolveSlackTarget()`: Determines which PM to notify
- `run()`: Main execution function

**Error Handling:**
- Graceful failures (won't block deployments)
- Detailed logging via `@actions/core`
- Sets action as failed with meaningful messages

### 2. Jira Service (`src/services/jira.ts`)

**Responsibilities:**
- Authenticate with Jira API (Basic Auth)
- Fetch issue details and sprint information
- Filter issues by sprint status and ticket status
- Extract PM information from issues

**API Endpoints Used:**
- `GET /rest/api/3/issue/{issueKey}` - Get issue details
- `POST /rest/api/3/search` - Search issues by JQL
- `GET /rest/agile/1.0/board/{boardId}/sprint` - Get sprints (optional)

**Key Methods:**
```typescript
getIssue(ticketId: string): Promise<JiraIssue | null>
getIssues(ticketIds: string[]): Promise<JiraIssue[]>
isInActiveSprint(issue: JiraIssue): boolean
filterByStatus(issues: JiraIssue[], statuses?: string[]): JiraIssue[]
getPmEmail(issue: JiraIssue): string | null
```

**Features:**
- Retry logic via axios interceptors
- 30-second timeout on requests
- Detailed debug logging
- Graceful handling of 404s (missing tickets)

### 3. Slack Service (`src/services/slack.ts`)

**Responsibilities:**
- Send rich formatted messages using Block Kit
- Look up users by email
- Validate channel/user access

**API Methods Used:**
- `chat.postMessage` - Send messages
- `users.lookupByEmail` - Find Slack user by email
- `conversations.info` - Validate channel access

**Key Methods:**
```typescript
sendNotification(
  channelOrUserId: string,
  notifications: NotificationData[],
  metadata: DeploymentMetadata
): Promise<string | undefined>

getUserIdByEmail(email: string): Promise<string | null>
validateAccess(channelOrUserId: string): Promise<boolean>
```

**Message Format:**
- Header with deployment emoji
- Metadata section (branch, environment, deployer)
- List of tickets with status emojis
- Clickable links to Jira
- Footer with timestamp

### 4. Parser Utility (`src/utils/parser.ts`)

**Responsibilities:**
- Extract Jira ticket IDs from commit messages
- Parse GitHub commit objects
- Deduplicate ticket IDs

**Regex Pattern:**
```typescript
/\b([A-Z]{2,10}-\d+)\b/g
```

**Supported Formats:**
- `PROJ-123` - Simple format
- `[PROJ-456]` - Bracketed
- `(PROJ-789)` - Parentheses
- Multiple tickets in one commit

**Key Functions:**
```typescript
extractTicketIds(message: string): string[]
parseCommits(commits: Commit[], projectKey?: string): ParsedCommit[]
getAllTicketIds(parsedCommits: ParsedCommit[]): string[]
```

### 5. Logger Utility (`src/utils/logger.ts`)

**Responsibilities:**
- Structured logging with context
- Integration with GitHub Actions log groups
- Different log levels (info, debug, warning, error)

**Features:**
```typescript
logger.info('Message')      // Standard output
logger.debug('Details')      // Debug output (only in debug mode)
logger.warning('Warning')    // Warning annotation
logger.error('Error', err)   // Error annotation with stack trace
logger.group('Name')         // Collapsible log group
```

## Data Flow

### 1. Configuration Loading

```typescript
Input (action.yml)
  → Validate with Zod (ConfigSchema)
  → Config object
```

### 2. Commit Processing

```typescript
GitHub Webhook Payload
  → Extract commits array
  → Parse each commit message
  → Extract ticket IDs using regex
  → Deduplicate
  → Filter by project key
  → Array of ticket IDs
```

### 3. Jira Integration

```typescript
Ticket IDs
  → JQL query: "key in (PROJ-123, PROJ-456)"
  → Jira API search
  → Get issue details
  → Check sprint field (state === 'active')
  → Filter by status (optional)
  → Array of JiraIssue objects
```

### 4. PM Resolution

```typescript
Issues + Config
  → Check PM mapping (config.pmMapping)
  → If not found: Extract PM email from issue
  → If email: Lookup Slack user by email
  → If not found: Use default channel/user
  → Slack User/Channel ID
```

### 5. Notification

```typescript
Issues + Metadata
  → Create Block Kit blocks
  → Format each ticket section
  → Add deployment context
  → Send to Slack API
  → Return message timestamp
```

## Configuration Strategy

### Three-Tier Configuration:

1. **Required (GitHub Secrets)**
   - Credentials that must be secret
   - `JIRA_API_TOKEN`, `SLACK_BOT_TOKEN`

2. **Optional (GitHub Variables)**
   - Non-sensitive configuration
   - `JIRA_PROJECT_KEY`, `SLACK_PM_CHANNEL`
   - Can be repository, environment, or organization level

3. **Optional (Input Parameters)**
   - Runtime configuration
   - `environment`, `only_active_sprint`, `ticket_status_filter`

## Type System

### Core Types

```typescript
// Configuration
type Config = {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;
  slackBotToken: string;
  slackChannelOrUser: string;
  environment: string;
  pmMapping?: Record<string, string>;
  onlyActiveSprint: boolean;
  ticketStatusFilter?: string[];
}

// Jira
interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string; ... };
    assignee: JiraUser | null;
    sprint?: JiraSprint | null;
    customfield_pm?: JiraUser | null;
  };
}

// Notification
interface NotificationData {
  ticket: string;
  summary: string;
  status: string;
  sprint: string | null;
  url: string;
  assignee: string | null;
}
```

## Security Considerations

### 1. Authentication

**Jira:**
- Basic Auth (email + API token)
- Token stored in GitHub Secrets
- Never logged or exposed

**Slack:**
- Bot token authentication
- OAuth scopes: `chat:write`, `users:read`, `users:read.email`
- Principle of least privilege

### 2. Data Handling

- No secrets in logs
- Sanitized error messages
- GitHub context data is trusted (from GitHub)
- User input (commit messages) is regex-validated

### 3. Network Security

- HTTPS-only connections
- 30-second timeouts
- Retry logic (max 3 attempts)
- Graceful degradation on failures

## Performance Optimization

### 1. Batch Operations

- Fetch all issues in single JQL query (not individual requests)
- Maximum 100 issues per request (Jira API limit)

### 2. Parallel Operations

- Independent API calls can run concurrently
- Axios connection pooling

### 3. Caching

- No caching implemented (intentional)
- Always fetch fresh data from Jira
- Ensures accuracy for deployments

## Error Handling Strategy

### 1. Levels of Failure

**Critical (Fail Action):**
- Invalid configuration
- Unable to load GitHub context
- Unhandled exceptions

**Non-Critical (Log & Continue):**
- Jira ticket not found (404)
- Issue not in active sprint
- Slack user lookup fails (fallback to default)

### 2. Error Types

```typescript
class JiraApiError extends Error {
  statusCode?: number;
  response?: unknown;
}

class SlackApiError extends Error {
  code?: string;
  response?: unknown;
}

class ConfigurationError extends Error {
  // Invalid inputs
}
```

## Extensibility Points

### 1. Custom Fields

Edit `src/services/jira.ts` to include custom fields:

```typescript
fields: 'summary,status,assignee,customfield_10001'
```

### 2. Message Formatting

Customize `src/services/slack.ts`:

```typescript
private createMessageBlocks(
  notifications: NotificationData[],
  metadata: Metadata
): object[]
```

### 3. Ticket Filtering

Add custom filtering logic:

```typescript
// In src/index.ts
const filteredIssues = issues.filter(customFilter);
```

### 4. Multiple Channels

Extend to notify multiple channels:

```typescript
const channels = ['C01234567', 'C76543210'];
for (const channel of channels) {
  await slackService.sendNotification(channel, notifications, metadata);
}
```

## Testing Strategy

### Unit Tests (Future)

- Parser utility (regex extraction)
- Config validation (Zod schemas)
- Message formatting

### Integration Tests (Future)

- Mock Jira API responses
- Mock Slack API responses
- Test error handling paths

### Manual Testing

1. Create test commits with ticket IDs
2. Verify Jira connection
3. Verify Slack message format
4. Test error scenarios (invalid tickets, missing sprints)

## Deployment

### Build Process

```bash
npm run build    # TypeScript → JavaScript (dist/)
npm run package  # Bundle with dependencies (dist/index.js)
```

### Distribution

- Committed `dist/` folder for GitHub Actions
- Or publish to GitHub Marketplace
- Version with git tags

## Monitoring and Observability

### Action Logs

- Structured logs with context
- Log groups for each phase
- Debug mode for detailed output

### Outputs

```yaml
outputs:
  tickets_found: "5"
  tickets_notified: "3"
  slack_message_ts: "1234567890.123456"
```

### Metrics to Track

- Ticket detection rate
- Sprint filtering accuracy
- Slack delivery success
- Average execution time

## Future Enhancements

### Potential Features

1. **Thread Updates**
   - Update existing Slack message on re-deployment
   - Track deployment status changes

2. **Multi-Project Support**
   - Handle multiple Jira projects in one run
   - Different PMs per project

3. **Custom Webhooks**
   - Support webhook destinations beyond Slack
   - Teams, Discord, custom endpoints

4. **Deployment Tracking**
   - Store deployment state
   - Link to deployment URLs

5. **Smart Grouping**
   - Group tickets by epic or sprint
   - Aggregate multiple deployments

6. **Rollback Detection**
   - Detect reverted commits
   - Notify about rollbacks

## Dependencies

### Production

- `@actions/core` - GitHub Actions SDK
- `@actions/github` - GitHub API client
- `@slack/web-api` - Slack Web API client
- `axios` - HTTP client for Jira
- `zod` - Runtime type validation

### Development

- `typescript` - Type checking
- `@vercel/ncc` - Bundle for distribution
- `eslint` - Code linting
- `prettier` - Code formatting

## Maintenance

### Update Checklist

1. Update dependencies regularly
2. Monitor GitHub Actions API changes
3. Check Jira/Slack API deprecations
4. Review security advisories
5. Update TypeScript version

### Version Strategy

- Semantic versioning (v1.0.0)
- Major: Breaking changes
- Minor: New features
- Patch: Bug fixes

---

**Last Updated:** 2025-10-14
**Version:** 1.0.0
**Maintainer:** Your Team
