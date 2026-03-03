-- CreateTable
CREATE TABLE "AgentJournalReflectionSnapshot" (
    "id" TEXT NOT NULL,
    "dayString" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "reflectionJson" TEXT NOT NULL,
    "signalVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,

    CONSTRAINT "AgentJournalReflectionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentJournalReflectionSnapshot_agentId_dayString_key" ON "AgentJournalReflectionSnapshot"("agentId", "dayString");

-- CreateIndex
CREATE INDEX "AgentJournalReflectionSnapshot_userId_dayString_idx" ON "AgentJournalReflectionSnapshot"("userId", "dayString");

-- CreateIndex
CREATE INDEX "AgentJournalReflectionSnapshot_agentId_generatedAt_idx" ON "AgentJournalReflectionSnapshot"("agentId", "generatedAt");

-- AddForeignKey
ALTER TABLE "AgentJournalReflectionSnapshot" ADD CONSTRAINT "AgentJournalReflectionSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentJournalReflectionSnapshot" ADD CONSTRAINT "AgentJournalReflectionSnapshot_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
