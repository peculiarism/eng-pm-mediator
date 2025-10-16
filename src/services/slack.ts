import { WebClient, ChatPostMessageResponse, Block, KnownBlock } from '@slack/web-api';
import { NotificationData, SlackApiError } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('SlackService');

export class SlackService {
  private client: WebClient;

  constructor(botToken: string) {
    this.client = new WebClient(botToken, {
      retryConfig: {
        retries: 3,
      },
    });
  }

  /**
   * Creates rich message blocks for Slack notification
   */
  private createMessageBlocks(
    notifications: NotificationData[],
    metadata: {
      branch: string;
      environment: string;
      deployedBy: string;
      commitSha: string;
      repoUrl: string;
    }
  ): (Block | KnownBlock)[] {
    const blocks: (Block | KnownBlock)[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚀 New Deployment Ready for Testing',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Branch:*\n${metadata.branch}`,
          },
          {
            type: 'mrkdwn',
            text: `*Environment:*\n${metadata.environment}`,
          },
          {
            type: 'mrkdwn',
            text: `*Deployed by:*\n${metadata.deployedBy}`,
          },
          {
            type: 'mrkdwn',
            text: `*Commit:*\n<${metadata.repoUrl}/commit/${metadata.commitSha}|${metadata.commitSha.substring(0, 7)}>`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Tickets Ready for Testing:*',
        },
      },
    ];

    // Add each ticket as a section
    for (const notification of notifications) {
      const statusEmoji = this.getStatusEmoji(notification.status);

      // Support both sprints (Jira) and cycles (Linear)
      let iterationText = 'No sprint/cycle';
      if (notification.sprint) {
        iterationText = `Sprint: ${notification.sprint}`;
      } else if (notification.cycle) {
        iterationText = `Cycle: ${notification.cycle}`;
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${notification.url}|${notification.ticket}>* - ${notification.summary}\n${statusEmoji} ${notification.status} | ${iterationText}${notification.assignee ? ` | Assignee: ${notification.assignee}` : ''}`,
        },
      });
    }

    // Add context footer
    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_${notifications.length} ticket${notifications.length !== 1 ? 's' : ''} deployed at <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>_`,
          },
        ],
      }
    );

    return blocks;
  }

  /**
   * Gets an emoji for a Jira status
   */
  private getStatusEmoji(status: string): string {
    const statusLower = status.toLowerCase();

    if (statusLower.includes('done') || statusLower.includes('complete')) {
      return '✅';
    }
    if (statusLower.includes('progress') || statusLower.includes('development')) {
      return '🔄';
    }
    if (statusLower.includes('review') || statusLower.includes('testing')) {
      return '👀';
    }
    if (statusLower.includes('todo') || statusLower.includes('backlog')) {
      return '📋';
    }
    if (statusLower.includes('blocked')) {
      return '🚫';
    }

    return '📌';
  }

  /**
   * Sends a notification to a Slack channel or user
   */
  async sendNotification(
    channelOrUserId: string,
    notifications: NotificationData[],
    metadata: {
      branch: string;
      environment: string;
      deployedBy: string;
      commitSha: string;
      repoUrl: string;
    }
  ): Promise<string | undefined> {
    try {
      logger.group('Sending Slack notification');
      logger.info(`Channel/User: ${channelOrUserId}`);
      logger.info(`Notifications: ${notifications.length}`);

      const blocks = this.createMessageBlocks(notifications, metadata);

      const response: ChatPostMessageResponse = await this.client.chat.postMessage({
        channel: channelOrUserId,
        text: `🚀 ${notifications.length} ticket${notifications.length !== 1 ? 's' : ''} deployed to ${metadata.environment}`, // Fallback text
        blocks,
        unfurl_links: false,
        unfurl_media: false,
      });

      if (!response.ok) {
        throw new SlackApiError(
          'Failed to send Slack message',
          response.error,
          response
        );
      }

      logger.info(`Message sent successfully (ts: ${response.ts})`);
      logger.endGroup();

      return response.ts;
    } catch (error) {
      logger.error('Failed to send Slack notification', error as Error);
      logger.endGroup();

      if ((error as { code?: string }).code === 'slack_webapi_platform_error') {
        throw new SlackApiError(
          `Slack API error: ${(error as Error).message}`,
          (error as { data?: { error?: string } }).data?.error,
          error
        );
      }

      throw error;
    }
  }

  /**
   * Sends a simple text message (for errors or fallback)
   */
  async sendSimpleMessage(
    channelOrUserId: string,
    text: string
  ): Promise<string | undefined> {
    try {
      const response = await this.client.chat.postMessage({
        channel: channelOrUserId,
        text,
      });

      if (!response.ok) {
        throw new SlackApiError(
          'Failed to send Slack message',
          response.error,
          response
        );
      }

      return response.ts;
    } catch (error) {
      logger.error('Failed to send simple message', error as Error);
      throw error;
    }
  }

  /**
   * Looks up a user by email address
   */
  async getUserIdByEmail(email: string): Promise<string | null> {
    try {
      const response = await this.client.users.lookupByEmail({ email });

      if (!response.ok || !response.user) {
        logger.warning(`User not found for email: ${email}`);
        return null;
      }

      logger.debug(`Found user ${response.user.id} for email ${email}`);
      return response.user.id ?? null;
    } catch (error) {
      logger.error(`Failed to lookup user by email: ${email}`, error as Error);
      return null;
    }
  }

  /**
   * Validates that the bot has access to a channel/user
   */
  async validateAccess(channelOrUserId: string): Promise<boolean> {
    try {
      // Try to get channel/conversation info
      const response = await this.client.conversations.info({
        channel: channelOrUserId,
      });

      return response.ok;
    } catch (error) {
      logger.warning(
        `Cannot access channel/user ${channelOrUserId}: ${(error as Error).message}`
      );
      return false;
    }
  }
}