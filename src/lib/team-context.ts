import prisma from "@/lib/prisma";
import { getAgentTeamPeers } from "@/lib/github-team";

interface TeamPeer {
  peerAgentId: string;
  peerAgentName: string;
  peerUsername: string;
  peerAvatar: string | null;
  sharedRepos: string[];
  strength: number;
  source: string;
}

/**
 * Get team peers for an agent, preferring the new Team model
 * and falling back to the legacy AgentTeamRelation table.
 */
export async function getTeamPeersForAgent(agentId: string): Promise<TeamPeer[]> {
  // 1. Find the agent's owner
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  });
  if (!agent) return [];

  // 2. Find all teams the user belongs to
  const memberships = await prisma.teamMember.findMany({
    where: { userId: agent.userId },
    select: {
      team: {
        select: {
          name: true,
          members: {
            where: { userId: { not: agent.userId } },
            select: {
              user: {
                select: {
                  id: true,
                  username: true,
                  avatar: true,
                  agents: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // 3. Flatten into TeamPeer format, deduplicating by agent ID
  const peers: TeamPeer[] = [];
  const seenAgentIds = new Set<string>();

  for (const membership of memberships) {
    for (const member of membership.team.members) {
      for (const memberAgent of member.user.agents) {
        if (!seenAgentIds.has(memberAgent.id)) {
          seenAgentIds.add(memberAgent.id);
          peers.push({
            peerAgentId: memberAgent.id,
            peerAgentName: memberAgent.name,
            peerUsername: member.user.username,
            peerAvatar: member.user.avatar,
            sharedRepos: [],
            strength: 1,
            source: "team",
          });
        }
      }
    }
  }

  // 4. If no Team-based peers found, fall back to legacy AgentTeamRelation
  if (peers.length === 0) {
    return getAgentTeamPeers(agentId);
  }

  return peers;
}
