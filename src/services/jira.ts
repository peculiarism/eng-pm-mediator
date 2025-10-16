import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  JiraIssue,
  JiraSprint,
  JiraSearchResponse,
  JiraSprintResponse,
  JiraApiError,
  Issue,
  IssueTrackerService,
} from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('JiraService');

export class JiraService implements IssueTrackerService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      auth: {
        username: email,
        password: apiToken,
      },
      timeout: 30000, // 30 second timeout
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use((config) => {
      logger.debug(`Making request to ${config.url}`);
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const statusCode = error.response?.status;
        const message = `Jira API error: ${error.message}`;
        logger.error(message, error);
        throw new JiraApiError(message, statusCode, error.response?.data);
      }
    );
  }

  /**
   * Gets the active sprint for a project board
   */
  async getActiveSprint(boardId?: number): Promise<JiraSprint | null> {
    try {
      // If no board ID provided, we'll need to search issues for sprint info
      if (!boardId) {
        logger.debug('No board ID provided, will extract sprint from issues');
        return null;
      }

      const response = await this.client.get<JiraSprintResponse>(
        `/rest/agile/1.0/board/${boardId}/sprint`,
        {
          params: {
            state: 'active',
            maxResults: 1,
          },
        }
      );

      const activeSprints = response.data.values.filter(
        (sprint) => sprint.state === 'active'
      );

      if (activeSprints.length === 0) {
        logger.warning(`No active sprint found for board ${boardId}`);
        return null;
      }

      const sprint = activeSprints[0];
      logger.info(`Found active sprint: ${sprint.name} (ID: ${sprint.id})`);
      return sprint;
    } catch (error) {
      logger.error('Failed to get active sprint', error as Error);
      return null;
    }
  }

  /**
   * Gets issue details for a ticket
   */
  async getIssue(ticketId: string): Promise<JiraIssue | null> {
    try {
      const response = await this.client.get<JiraIssue>(
        `/rest/api/3/issue/${ticketId}`,
        {
          params: {
            fields:
              'summary,status,assignee,reporter,sprint,customfield_pm',
          },
        }
      );

      logger.debug(`Retrieved issue ${ticketId}: ${response.data.fields.summary}`);
      return response.data;
    } catch (error) {
      if ((error as JiraApiError).statusCode === 404) {
        logger.warning(`Issue ${ticketId} not found`);
        return null;
      }
      logger.error(`Failed to get issue ${ticketId}`, error as Error);
      return null;
    }
  }

  /**
   * Gets multiple issues in batch (returns generic Issue type)
   */
  async getIssues(ticketIds: string[]): Promise<Issue[]> {
    if (ticketIds.length === 0) {
      return [];
    }

    try {
      logger.group(`Fetching ${ticketIds.length} issues from Jira`);

      const jiraIssues = await this.getJiraIssues(ticketIds);
      const issues = jiraIssues.map((issue) => this.convertToGenericIssue(issue));

      logger.info(`Found ${issues.length} issues`);
      logger.endGroup();

      return issues;
    } catch (error) {
      logger.error('Failed to get issues', error as Error);
      logger.endGroup();
      return [];
    }
  }

  /**
   * Gets multiple Jira issues in batch (returns Jira-specific type)
   */
  async getJiraIssues(ticketIds: string[]): Promise<JiraIssue[]> {
    if (ticketIds.length === 0) {
      return [];
    }

    const jql = `key in (${ticketIds.join(',')})`;
    const response = await this.client.post<JiraSearchResponse>(
      '/rest/api/3/search',
      {
        jql,
        fields: [
          'summary',
          'status',
          'assignee',
          'reporter',
          'sprint',
          'customfield_pm',
        ],
        maxResults: 100,
      }
    );

    return response.data.issues;
  }

  /**
   * Converts Jira issue to generic Issue format
   */
  private convertToGenericIssue(jiraIssue: JiraIssue): Issue {
    return {
      id: jiraIssue.id,
      key: jiraIssue.key,
      summary: jiraIssue.fields.summary,
      status: jiraIssue.fields.status.name,
      assignee: jiraIssue.fields.assignee
        ? {
            name: jiraIssue.fields.assignee.displayName,
            email: jiraIssue.fields.assignee.emailAddress,
          }
        : null,
      sprint: jiraIssue.fields.sprint
        ? {
            name: jiraIssue.fields.sprint.name,
            state: jiraIssue.fields.sprint.state,
          }
        : null,
      cycle: null, // Jira doesn't use cycles
      pmEmail: this.getJiraPmEmail(jiraIssue),
      url: this.getIssueUrl(jiraIssue.key),
    };
  }

  /**
   * Checks if an issue is in the active sprint (generic Issue)
   */
  isInActiveSprint(issue: Issue): boolean {
    // Check if issue has sprint field
    const sprint = issue.sprint;
    if (!sprint) {
      logger.debug(`Issue ${issue.key} has no sprint assigned`);
      return false;
    }

    const isActive = sprint.state === 'active';
    logger.debug(
      `Issue ${issue.key} sprint status: ${sprint.name} (${sprint.state})`
    );
    return isActive;
  }

  /**
   * Filters issues by status (generic Issue)
   */
  filterByStatus(issues: Issue[], allowedStatuses?: string[]): Issue[] {
    if (!allowedStatuses || allowedStatuses.length === 0) {
      return issues;
    }

    const filtered = issues.filter((issue) =>
      allowedStatuses.includes(issue.status)
    );

    logger.info(
      `Filtered ${issues.length} issues to ${filtered.length} by status: ${allowedStatuses.join(', ')}`
    );

    return filtered;
  }

  /**
   * Gets the PM email for an issue (generic Issue)
   */
  getPmEmail(issue: Issue): string | null {
    // Use pre-extracted PM email from conversion
    return issue.pmEmail;
  }

  /**
   * Gets the PM email from a Jira issue
   * Tries custom PM field first, falls back to reporter
   */
  private getJiraPmEmail(jiraIssue: JiraIssue): string | null {
    // Try custom PM field first
    if (jiraIssue.fields.customfield_pm?.emailAddress) {
      return jiraIssue.fields.customfield_pm.emailAddress;
    }

    // Fall back to reporter
    if (jiraIssue.fields.reporter?.emailAddress) {
      return jiraIssue.fields.reporter.emailAddress;
    }

    logger.debug(`No PM email found for issue ${jiraIssue.key}`);
    return null;
  }

  /**
   * Constructs the URL for an issue
   */
  getIssueUrl(ticketId: string): string {
    return `${this.baseUrl}/browse/${ticketId}`;
  }
}
