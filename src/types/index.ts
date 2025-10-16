import { z } from 'zod';

// Configuration schemas
export const ConfigSchema = z.object({
  // Issue tracker selection
  issueTracker: z.enum(['jira', 'linear']).default('jira'),

  // Jira configuration
  jiraBaseUrl: z.string().url().optional(),
  jiraEmail: z.string().email().optional(),
  jiraApiToken: z.string().optional(),
  jiraProjectKey: z.string().optional(),

  // Linear configuration
  linearApiKey: z.string().optional(),
  linearTeamKey: z.string().optional(),

  // Common configuration
  slackBotToken: z.string(),
  slackChannelOrUser: z.string(),
  environment: z.string().default('staging'),
  pmMapping: z.record(z.string()).optional(),
  onlyActiveSprint: z.boolean().default(true),
  ticketStatusFilter: z.array(z.string()).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

// Abstract issue tracker interface
export interface IssueTrackerService {
  getIssues(issueIds: string[]): Promise<Issue[]>;
  isInActiveSprint(issue: Issue): boolean;
  filterByStatus(issues: Issue[], allowedStatuses?: string[]): Issue[];
  getPmEmail(issue: Issue): string | null;
  getIssueUrl(issueId: string): string;
}

// Generic Issue type (abstracted from platform)
export interface Issue {
  id: string;
  key: string;
  summary: string;
  status: string;
  assignee: {
    name: string;
    email: string;
  } | null;
  sprint: {
    name: string;
    state: 'active' | 'future' | 'closed';
  } | null;
  cycle: {
    name: string;
    state: 'started' | 'unstarted' | 'completed';
  } | null;
  pmEmail: string | null;
  url: string;
}

// Jira types
export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory: {
        name: string;
      };
    };
    assignee: {
      accountId: string;
      emailAddress: string;
      displayName: string;
    } | null;
    reporter: {
      accountId: string;
      emailAddress: string;
      displayName: string;
    } | null;
    sprint?: JiraSprint | null;
    customfield_pm?: {
      accountId: string;
      emailAddress: string;
      displayName: string;
    } | null;
  };
  self: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed';
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
  startAt: number;
}

export interface JiraSprintResponse {
  values: JiraSprint[];
  maxResults: number;
  startAt: number;
  isLast: boolean;
}

// Slack types
export interface SlackMessageBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  accessory?: {
    type: string;
    text?: {
      type: string;
      text: string;
    };
    url?: string;
  };
}

export interface NotificationData {
  ticket: string;
  summary: string;
  status: string;
  sprint: string | null;
  cycle: string | null;  // Linear cycles
  url: string;
  assignee: string | null;
}

// Parser types
export interface ParsedCommit {
  sha: string;
  message: string;
  author: string;
  ticketIds: string[];
}

// Action outputs
export interface ActionOutputs {
  ticketsFound: number;
  ticketsNotified: number;
  slackMessageTs?: string;
}

// Linear types
export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  state: {
    name: string;
    type: string;
  };
  assignee: {
    name: string;
    email: string;
  } | null;
  cycle: {
    name: string;
    startsAt: string;
    endsAt: string;
    completedAt?: string;
  } | null;
  team: {
    key: string;
    name: string;
  };
  url: string;
}

export interface LinearCycle {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  completedAt?: string;
}

export interface LinearGraphQLResponse<T> {
  data: T;
  errors?: Array<{
    message: string;
    path?: string[];
  }>;
}

// Error types
export class IssueTrackerError extends Error {
  constructor(
    message: string,
    public platform: 'jira' | 'linear',
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'IssueTrackerError';
  }
}

export class JiraApiError extends IssueTrackerError {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message, 'jira', statusCode, response);
    this.name = 'JiraApiError';
  }
}

export class LinearApiError extends IssueTrackerError {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message, 'linear', statusCode, response);
    this.name = 'LinearApiError';
  }
}

export class SlackApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public response?: unknown
  ) {
    super(message);
    this.name = 'SlackApiError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
