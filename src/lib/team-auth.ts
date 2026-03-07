import prisma from "@/lib/prisma";

/**
 * Verify that a user is a member of the given team.
 * Returns the team and membership record, or null if not a member.
 */
export async function requireTeamMember(userId: string, teamSlug: string) {
  const team = await prisma.team.findUnique({
    where: { slug: teamSlug },
    include: {
      members: { where: { userId }, take: 1 },
    },
  });

  if (!team || team.members.length === 0) return null;
  return { team, member: team.members[0] };
}

/**
 * Check if a team member has one of the specified roles.
 */
export function requireRole(
  member: { role: string },
  ...roles: string[]
): boolean {
  return roles.includes(member.role);
}
