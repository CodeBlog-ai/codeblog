import prisma from "@/lib/prisma";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  process.env.CODEBLOG_URL ||
  "https://codeblog.ai";

interface PostInfo {
  id: string;
  title: string;
  summary?: string | null;
}

function buildSlackBlocks(post: PostInfo, authorName: string) {
  const postUrl = `${APP_URL}/post/${post.id}`;
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${postUrl}|${post.title}>*\nby ${authorName}`,
      },
    },
  ];

  if (post.summary) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: post.summary.length > 200 ? post.summary.slice(0, 200) + "..." : post.summary,
      },
    });
  }

  return blocks;
}

async function sendViaWebhook(webhookUrl: string, post: PostInfo, authorName: string) {
  const blocks = buildSlackBlocks(post, authorName);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `New post: ${post.title} by ${authorName}`,
      blocks,
    }),
  });
  return res.ok;
}

async function sendViaBot(botToken: string, channelId: string, post: PostInfo, authorName: string) {
  const blocks = buildSlackBlocks(post, authorName);
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      text: `New post: ${post.title} by ${authorName}`,
      blocks,
      unfurl_links: false,
    }),
  });
  const data = await res.json();
  return data.ok === true;
}

/**
 * Send a Slack notification for a new post to all teams the user belongs to.
 * Uses Bot token if available, falls back to Incoming Webhook.
 */
export async function notifyTeamSlack(userId: string, post: PostInfo) {
  // Find teams with Slack integration that this user belongs to
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: {
      team: {
        select: {
          slackWebhookUrl: true,
          slackBotToken: true,
          slackBotChannelId: true,
        },
      },
    },
  });

  // Get author name
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  const authorName = user?.username || "Someone";

  for (const m of memberships) {
    const { slackBotToken, slackBotChannelId, slackWebhookUrl } = m.team;

    try {
      // Prefer Bot over Webhook
      if (slackBotToken && slackBotChannelId) {
        await sendViaBot(slackBotToken, slackBotChannelId, post, authorName);
      } else if (slackWebhookUrl) {
        await sendViaWebhook(slackWebhookUrl, post, authorName);
      }
    } catch {
      // Silently ignore notification failures
    }
  }
}

/**
 * Send a test notification to a specific team's Slack integration.
 */
export async function sendTestSlackNotification(team: {
  slackWebhookUrl?: string | null;
  slackBotToken?: string | null;
  slackBotChannelId?: string | null;
}): Promise<{ ok: boolean; method: string; error?: string }> {
  const testPost: PostInfo = {
    id: "test",
    title: "Test Notification from CodeBlog",
    summary: "This is a test notification to verify your Slack integration is working correctly.",
  };

  try {
    if (team.slackBotToken && team.slackBotChannelId) {
      const ok = await sendViaBot(team.slackBotToken, team.slackBotChannelId, testPost, "CodeBlog");
      return { ok, method: "bot" };
    }
    if (team.slackWebhookUrl) {
      const ok = await sendViaWebhook(team.slackWebhookUrl, testPost, "CodeBlog");
      return { ok, method: "webhook" };
    }
    return { ok: false, method: "none", error: "no_slack_configured" };
  } catch (err) {
    return { ok: false, method: "unknown", error: String(err) };
  }
}
