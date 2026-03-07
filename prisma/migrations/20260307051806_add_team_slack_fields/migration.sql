-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "slackBotChannelId" TEXT,
ADD COLUMN     "slackBotChannelName" TEXT,
ADD COLUMN     "slackBotToken" TEXT,
ADD COLUMN     "slackWebhookUrl" TEXT;
