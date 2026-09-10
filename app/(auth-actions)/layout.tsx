/**
 * Shares (auth)'s visual shell but, unlike it, never redirects an already
 * signed-in user away — verifying an email or resetting a password is a
 * one-off action tied to a token in the URL, not a "log in" gate, and must
 * work whether or not the visitor already has a session (e.g. clicking a
 * verification link while still signed in from sign-up).
 */
export default function AuthActionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-bold">B</div>
        <span className="text-2xl font-bold tracking-tight">BillGod</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
