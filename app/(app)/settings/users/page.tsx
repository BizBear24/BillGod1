import { listMembers } from "@/app/actions/members";
import { MembersManager } from "@/components/app/members-manager";
import { Card, CardContent } from "@/components/ui/card";

export default async function SettingsUsersPage() {
  let data: Awaited<ReturnType<typeof listMembers>> | null = null;
  try {
    data = await listMembers();
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          You don&apos;t have permission to view team members. Ask your business owner or admin for access.
        </CardContent>
      </Card>
    );
  }

  return <MembersManager members={data.members} invitations={data.invitations} myRole={data.myRole} />;
}
