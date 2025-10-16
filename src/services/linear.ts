import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  LinearIssue,
  LinearGraphQLResponse,
  LinearApiError,
  Issue,
  IssueTrackerService,
} from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('LinearService');

export class LinearService implements IssueTrackerService {
  private client: AxiosInstance;
  private teamKey?: string;

  constructor(apiKey: string, teamKey?: string) {
    this.teamKey = teamKey;

    this.client = axios.create({
      baseURL: 'https://api.linear.app',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      timeout: 30000,
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const statusCode = error.response?.status;
        const message = `Linear API error: ${error.message}`;
        logger.error(message, error);
        throw new LinearApiError(message, statusCode, error.response?.data);
      }
    );
  }

  /**
   * Gets issues by their identifiers (e.g., PROJ-123)
   */
  async getIssues(issueIds: string[]): Promise<Issue[]> {
    if (issueIds.length === 0) {
      return [];
    }

    try {
      logger.group(`Fetching ${issueIds.length} issues from Linear`);

      const issues: Issue[] = [];

      // Linear doesn't support batch queries with specific identifiers easily,
      // so we'll query them individually or use a filter
      for (const issueId of issueIds) {
        const issue = await this.getIssue(issueId);
        if (issue) {
          issues.push(issue);
        }
      }

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
   * Gets a single issue by identifier
   */
  private async getIssue(identifier: string): Promise<Issue | null> {
    const query = `
      query GetIssue($identifier: String!) {
        issue(id: $identifier) {
          id
          identifier
          title
          url
          state {
            name
            type
          }
          assignee {
            name
            email
          }
          cycle {
            id
            name
            startsAt
            endsAt
            completedAt
          }
          team {
            key
            name
          }
        }
      }
    `;

    try {
      const response = await this.client.post<
        LinearGraphQLResponse<{ issue: LinearIssue }>
      >('/graphql', {
        query,
        variables: { identifier },
      });

      if (response.data.errors) {
        logger.warning(
          `GraphQL errors for ${identifier}: ${JSON.stringify(response.data.errors)}`
        );
        return null;
      }

      const linearIssue = response.data.data.issue;
      if (!linearIssue) {
        logger.warning(`Issue ${identifier} not found`);
        return null;
      }

      // If teamKey is specified, filter by team
      if (this.teamKey && linearIssue.team.key !== this.teamKey) {
        logger.debug(
          `Issue ${identifier} is not in team ${this.teamKey}, skipping`
        );
        return null;
      }

      logger.debug(`Retrieved issue ${identifier}: ${linearIssue.title}`);

      return this.convertToGenericIssue(linearIssue);
    } catch (error) {
      logger.error(`Failed to get issue ${identifier}`, error as Error);
      return null;
    }
  }

  /**
   * Converts Linear issue to generic Issue format
   */
  private convertToGenericIssue(linearIssue: LinearIssue): Issue {
    return {
      id: linearIssue.id,
      key: linearIssue.identifier,
      summary: linearIssue.title,
      status: linearIssue.state.name,
      assignee: linearIssue.assignee
        ? {
            name: linearIssue.assignee.name,
            email: linearIssue.assignee.email,
          }
        : null,
      sprint: null, // Linear uses cycles, not sprints
      cycle: linearIssue.cycle
        ? {
            name: linearIssue.cycle.name,
            state: this.getCycleState(linearIssue.cycle),
          }
        : null,
      pmEmail: null, // Will need to determine from team or custom field
      url: linearIssue.url,
    };
  }

  /**
   * Determines cycle state from Linear cycle data
   */
  private getCycleState(cycle: LinearIssue['cycle']): 'started' | 'unstarted' | 'completed' {
    if (!cycle) return 'unstarted';

    const now = new Date();
    const startsAt = new Date(cycle.startsAt);
    const endsAt = new Date(cycle.endsAt);

    if (cycle.completedAt) {
      return 'completed';
    }

    if (now < startsAt) {
      return 'unstarted';
    }

    if (now >= startsAt && now <= endsAt) {
      return 'started';
    }

    return 'completed';
  }

  /**
   * Checks if issue is in active cycle (Linear equivalent of sprint)
   */
  isInActiveSprint(issue: Issue): boolean {
    if (!issue.cycle) {
      logger.debug(`Issue ${issue.key} has no cycle assigned`);
      return false;
    }

    const isActive = issue.cycle.state === 'started';
    logger.debug(
      `Issue ${issue.key} cycle status: ${issue.cycle.name} (${issue.cycle.state})`
    );
    return isActive;
  }

  /**
   * Filters issues by status
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
   * Gets PM email for an issue
   * Linear doesn't have a built-in PM field, so this would need customization
   */
  getPmEmail(issue: Issue): string | null {
    // Could be extended to check custom fields or team membership
    logger.debug(`No PM email found for issue ${issue.key} (Linear doesn't have built-in PM field)`);
    return issue.pmEmail;
  }

  /**
   * Constructs the URL for an issue
   */
  getIssueUrl(issueId: string): string {
    // Linear provides the full URL in the API response
    // This is a fallback if needed
    return `https://linear.app/issue/${issueId}`;
  }

  /**
   * Gets the active cycle for a team
   */
  async getActiveCycle(teamId: string): Promise<LinearIssue['cycle'] | null> {
    const query = `
      query GetActiveCycle($teamId: String!) {
        team(id: $teamId) {
          activeCycle {
            id
            name
            startsAt
            endsAt
            completedAt
          }
        }
      }
    `;

    try {
      const response = await this.client.post<
        LinearGraphQLResponse<{ team: { activeCycle: LinearIssue['cycle'] } }>
      >('/graphql', {
        query,
        variables: { teamId },
      });

      if (response.data.errors) {
        logger.warning(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
        return null;
      }

      const activeCycle = response.data.data.team.activeCycle;
      if (activeCycle) {
        logger.info(`Found active cycle: ${activeCycle.name}`);
      }

      return activeCycle;
    } catch (error) {
      logger.error('Failed to get active cycle', error as Error);
      return null;
    }
  }

  /**
   * Searches for issues using Linear's search functionality
   */
  async searchIssues(identifiers: string[]): Promise<Issue[]> {
    if (identifiers.length === 0) {
      return [];
    }

    // Build a filter for multiple identifiers
    const filter: {
      or: { identifier: { eq: string } }[];
      team?: { key: { eq: string } };
    } = {
      or: identifiers.map((id) => ({ identifier: { eq: id } })),
    };

    if (this.teamKey) {
      filter.team = { key: { eq: this.teamKey } };
    }

    const query = `
      query SearchIssues($filter: IssueFilter!) {
        issues(filter: $filter, first: 100) {
          nodes {
            id
            identifier
            title
            url
            state {
              name
              type
            }
            assignee {
              name
              email
            }
            cycle {
              id
              name
              startsAt
              endsAt
              completedAt
            }
            team {
              key
              name
            }
          }
        }
      }
    `;

    try {
      const response = await this.client.post<
        LinearGraphQLResponse<{ issues: { nodes: LinearIssue[] } }>
      >('/graphql', {
        query,
        variables: { filter },
      });

      if (response.data.errors) {
        logger.warning(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
        return [];
      }

      const linearIssues = response.data.data.issues.nodes;
      logger.info(`Found ${linearIssues.length} issues via search`);

      return linearIssues.map((issue) => this.convertToGenericIssue(issue));
    } catch (error) {
      logger.error('Failed to search issues', error as Error);
      return [];
    }
  }
}