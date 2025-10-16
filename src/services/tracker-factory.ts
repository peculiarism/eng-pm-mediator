import { JiraService } from './jira';
import { LinearService } from './linear';
import { IssueTrackerService, Config, ConfigurationError } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('TrackerFactory');

/**
 * Factory function to create the appropriate issue tracker service
 * based on configuration
 */
export function createIssueTracker(config: Config): IssueTrackerService {
  logger.info(`Creating ${config.issueTracker} issue tracker service`);

  switch (config.issueTracker) {
    case 'jira':
      return createJiraService(config);

    case 'linear':
      return createLinearService(config);

    default:
      throw new ConfigurationError(
        `Unknown issue tracker: ${config.issueTracker}`
      );
  }
}

/**
 * Creates and validates a Jira service instance
 */
function createJiraService(config: Config): JiraService {
  if (!config.jiraBaseUrl) {
    throw new ConfigurationError(
      'jira_base_url is required when issue_tracker is "jira"'
    );
  }

  if (!config.jiraEmail) {
    throw new ConfigurationError(
      'jira_email is required when issue_tracker is "jira"'
    );
  }

  if (!config.jiraApiToken) {
    throw new ConfigurationError(
      'jira_api_token is required when issue_tracker is "jira"'
    );
  }

  logger.info(`Initializing Jira service: ${config.jiraBaseUrl}`);

  return new JiraService(
    config.jiraBaseUrl,
    config.jiraEmail,
    config.jiraApiToken
  );
}

/**
 * Creates and validates a Linear service instance
 */
function createLinearService(config: Config): LinearService {
  if (!config.linearApiKey) {
    throw new ConfigurationError(
      'linear_api_key is required when issue_tracker is "linear"'
    );
  }

  logger.info('Initializing Linear service');

  if (config.linearTeamKey) {
    logger.info(`Filtering by Linear team: ${config.linearTeamKey}`);
  }

  return new LinearService(config.linearApiKey, config.linearTeamKey);
}

/**
 * Gets the project/team key based on the tracker type
 */
export function getProjectKey(config: Config): string | undefined {
  switch (config.issueTracker) {
    case 'jira':
      return config.jiraProjectKey;

    case 'linear':
      return config.linearTeamKey;

    default:
      return undefined;
  }
}
