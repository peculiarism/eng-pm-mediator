import * as core from '@actions/core';
import * as github from '@actions/github';
import { SlackService } from './services/slack';
import { createIssueTracker, getProjectKey } from './services/tracker-factory';
import { parseCommits, getAllTicketIds } from './utils/parser';
import { createLogger } from './utils/logger';
import {
  Config,
  ConfigSchema,
  NotificationData,
  Issue,
  IssueTrackerService,
  ConfigurationError,
} from './types';

const logger = createLogger('Main');

/**
 * Loads and validates configuration from action inputs
 */
function loadConfig(): Config {
  try {
    const pmMappingInput = core.getInput('pm_mapping_json') || '{}';
    const pmMapping = JSON.parse(pmMappingInput);

    const statusFilterInput = core.getInput('ticket_status_filter') || '';
    const ticketStatusFilter =
      statusFilterInput.length > 0
        ? statusFilterInput.split(',').map((s) => s.trim())
        : undefined;

    const issueTracker = (core.getInput('issue_tracker') || 'jira') as 'jira' | 'linear';

    const config = ConfigSchema.parse({
      issueTracker,
      // Jira config
      jiraBaseUrl: core.getInput('jira_base_url') || undefined,
      jiraEmail: core.getInput('jira_email') || undefined,
      jiraApiToken: core.getInput('jira_api_token') || undefined,
      jiraProjectKey: core.getInput('jira_project_key') || undefined,
      // Linear config
      linearApiKey: core.getInput('linear_api_key') || undefined,
      linearTeamKey: core.getInput('linear_team_key') || undefined,
      // Common config
      slackBotToken: core.getInput('slack_bot_token', { required: true }),
      slackChannelOrUser: core.getInput('slack_channel_or_user', {
        required: true,
      }),
      environment: core.getInput('environment') || 'staging',
      pmMapping,
      onlyActiveSprint:
        core.getInput('only_active_sprint') !== 'false',
      ticketStatusFilter,
    });

    logger.info('Configuration loaded successfully');
    logger.info(`Issue tracker: ${config.issueTracker}`);
    logger.debug(`Environment: ${config.environment}`);
    logger.debug(`Only active sprint/cycle: ${config.onlyActiveSprint}`);

    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw new ConfigurationError(`Invalid configuration: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Gets commit information from GitHub context
 */
function getCommitInfo() {
  const context = github.context;

  // Get commits from push event
  const commits = context.payload.commits || [];

  if (commits.length === 0) {
    logger.warning('No commits found in push event');
    return {
      commits: [],
      branch: context.ref.replace('refs/heads/', ''),
      sha: context.sha,
      actor: context.actor,
      repo: context.repo,
    };
  }

  logger.info(`Processing ${commits.length} commit(s)`);

  return {
    commits,
    branch: context.ref.replace('refs/heads/', ''),
    sha: context.sha,
    actor: context.actor,
    repo: context.repo,
  };
}

/**
 * Resolves the Slack user/channel to notify for a set of issues
 */
async function resolveSlackTarget(
  issues: Issue[],
  config: Config,
  trackerService: IssueTrackerService,
  slackService: SlackService
): Promise<string> {
  const projectKey = getProjectKey(config);

  // If PM mapping is provided, try to use it
  if (config.pmMapping && Object.keys(config.pmMapping).length > 0 && projectKey) {
    // Check if there's a mapping for the project/team
    const projectMapping = config.pmMapping[projectKey];
    if (projectMapping) {
      logger.info(
        `Using PM mapping for ${config.issueTracker} project ${projectKey}: ${projectMapping}`
      );
      return projectMapping;
    }
  }

  // Try to get PM from first issue
  if (issues.length > 0) {
    const pmEmail = trackerService.getPmEmail(issues[0]);
    if (pmEmail) {
      logger.info(`Found PM email from issue: ${pmEmail}`);
      const slackUserId = await slackService.getUserIdByEmail(pmEmail);
      if (slackUserId) {
        return slackUserId;
      }
    }
  }

  // Fallback to configured channel/user
  logger.info('Using configured Slack channel/user');
  return config.slackChannelOrUser;
}

/**
 * Main action logic
 */
async function run(): Promise<void> {
  try {
    logger.info('🚀 PM Updater Action started');

    // Load configuration
    const config = loadConfig();

    // Get commit information
    const { commits, branch, sha, actor, repo } = getCommitInfo();

    if (commits.length === 0) {
      logger.info('No commits to process, exiting');
      core.setOutput('tickets_found', 0);
      core.setOutput('tickets_notified', 0);
      return;
    }

    // Parse commits for issue IDs (works for both Jira and Linear)
    const projectKey = getProjectKey(config);
    const parsedCommits = parseCommits(commits, projectKey);
    const issueIds = getAllTicketIds(parsedCommits);

    if (issueIds.length === 0) {
      logger.info(`No ${config.issueTracker} issues found in commits, exiting`);
      core.setOutput('tickets_found', 0);
      core.setOutput('tickets_notified', 0);
      return;
    }

    logger.info(`Found ${issueIds.length} unique issue(s): ${issueIds.join(', ')}`);
    core.setOutput('tickets_found', issueIds.length);

    // Initialize services
    const trackerService = createIssueTracker(config);
    const slackService = new SlackService(config.slackBotToken);

    // Fetch issue details
    const issues = await trackerService.getIssues(issueIds);

    if (issues.length === 0) {
      logger.warning(`No issues found in ${config.issueTracker}`);
      core.setOutput('tickets_notified', 0);
      return;
    }

    // Filter by active sprint/cycle if configured
    let filteredIssues = issues;
    if (config.onlyActiveSprint) {
      filteredIssues = issues.filter((issue) =>
        trackerService.isInActiveSprint(issue)
      );
      const iterationType = config.issueTracker === 'linear' ? 'cycle' : 'sprint';
      logger.info(
        `Filtered to ${filteredIssues.length} issue(s) in active ${iterationType}`
      );
    }

    // Filter by status if configured
    if (config.ticketStatusFilter && config.ticketStatusFilter.length > 0) {
      filteredIssues = trackerService.filterByStatus(
        filteredIssues,
        config.ticketStatusFilter
      );
    }

    if (filteredIssues.length === 0) {
      logger.info('No issues match the filter criteria, skipping notification');
      core.setOutput('tickets_notified', 0);
      return;
    }

    // Prepare notification data
    const notifications: NotificationData[] = filteredIssues.map((issue) => ({
      ticket: issue.key,
      summary: issue.summary,
      status: issue.status,
      sprint: issue.sprint?.name || null,
      cycle: issue.cycle?.name || null,
      url: issue.url,
      assignee: issue.assignee?.name || null,
    }));

    // Resolve Slack target
    const slackTarget = await resolveSlackTarget(
      filteredIssues,
      config,
      trackerService,
      slackService
    );

    // Send Slack notification
    const repoUrl = `https://github.com/${repo.owner}/${repo.repo}`;
    const messageTs = await slackService.sendNotification(
      slackTarget,
      notifications,
      {
        branch,
        environment: config.environment,
        deployedBy: actor,
        commitSha: sha,
        repoUrl,
      }
    );

    logger.info(
      `✅ Successfully notified about ${notifications.length} ticket(s)`
    );

    // Set outputs
    core.setOutput('tickets_notified', notifications.length);
    if (messageTs) {
      core.setOutput('slack_message_ts', messageTs);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
      logger.error('Action failed', error);
    } else {
      core.setFailed('An unknown error occurred');
      logger.error('Action failed with unknown error');
    }
  }
}

// Run the action
run();
