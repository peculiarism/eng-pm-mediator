import * as core from '@actions/core';
import { ParsedCommit } from '../types';

/**
 * Regular expression patterns for matching issue IDs
 * Jira format: PROJ-123, [PROJ-123], (PROJ-123)
 * Linear format: TEAM-123, [TEAM-123], (TEAM-123)
 * Both follow the same pattern: LETTERS-NUMBERS
 */
const ISSUE_ID_PATTERN = /\b([A-Z]{2,10}-\d+)\b/g;

/**
 * Extracts issue IDs from a commit message (works for both Jira and Linear)
 * @param message The commit message to parse
 * @returns Array of unique issue IDs found
 */
export function extractTicketIds(message: string): string[] {
  const matches = message.match(ISSUE_ID_PATTERN);
  if (!matches) {
    return [];
  }

  // Remove duplicates and return
  return [...new Set(matches)];
}

/**
 * Extracts Jira ticket IDs (alias for backward compatibility)
 */
export const extractJiraTicketIds = extractTicketIds;

/**
 * Extracts Linear issue IDs (alias for clarity)
 */
export const extractLinearIssueIds = extractTicketIds;

/**
 * Parses commits from GitHub context
 * @param commits Array of commit objects from GitHub webhook
 * @param projectKey Optional project/team key to filter tickets (works for both Jira and Linear)
 * @returns Array of parsed commits with ticket information
 */
export function parseCommits(
  commits: Array<{
    id: string;
    message: string;
    author: { name: string; email: string };
  }>,
  projectKey?: string
): ParsedCommit[] {
  const parsedCommits: ParsedCommit[] = [];

  for (const commit of commits) {
    const ticketIds = extractTicketIds(commit.message);

    // Filter by project/team key if provided (works for both Jira PROJ-123 and Linear TEAM-123)
    const filteredTickets = projectKey
      ? ticketIds.filter((id) => id.startsWith(`${projectKey}-`))
      : ticketIds;

    if (filteredTickets.length > 0) {
      parsedCommits.push({
        sha: commit.id,
        message: commit.message.split('\n')[0], // First line only
        author: commit.author.name,
        ticketIds: filteredTickets,
      });

      core.debug(
        `Found ${filteredTickets.length} issue(s) in commit ${commit.id.substring(0, 7)}: ${filteredTickets.join(', ')}`
      );
    }
  }

  return parsedCommits;
}

/**
 * Gets all unique ticket IDs from parsed commits
 * @param parsedCommits Array of parsed commits
 * @returns Array of unique ticket IDs
 */
export function getAllTicketIds(parsedCommits: ParsedCommit[]): string[] {
  const allTickets = parsedCommits.flatMap((commit) => commit.ticketIds);
  return [...new Set(allTickets)];
}

/**
 * Validates an issue ID format (works for both Jira and Linear)
 * @param ticketId The ticket/issue ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidTicketId(ticketId: string): boolean {
  return /^[A-Z]{2,10}-\d+$/.test(ticketId);
}

/**
 * Detects if an issue ID is likely from Jira or Linear based on common patterns
 * Note: This is heuristic-based and may not be 100% accurate
 * @param issueId The issue ID to check
 * @returns 'jira', 'linear', or 'unknown'
 */
export function detectIssueTracker(issueId: string): 'jira' | 'linear' | 'unknown' {
  if (!isValidTicketId(issueId)) {
    return 'unknown';
  }

  // Linear typically uses shorter team keys (2-4 chars) and sequential numbering
  // Jira often uses longer project keys (3-10 chars)
  // This is heuristic and should be overridden by explicit configuration
  const [prefix] = issueId.split('-');

  if (prefix.length <= 4) {
    // Could be either, return unknown to rely on config
    return 'unknown';
  }

  // Longer prefixes are more common in Jira
  return 'jira';
}
