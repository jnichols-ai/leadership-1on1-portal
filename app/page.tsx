import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await getSessionUser();
  if (user) redirect('/dashboard');

  return (
    <div className="hero">
      <h1>Leadership 1:1 Portal</h1>
      <p className="muted" style={{ maxWidth: 460, margin: '0 auto 28px' }}>
        Run and sign off the weekly supervisor 1:1s for leaders in training.
        Sign in with your monday.com account.
      </p>

      {searchParams.error && (
        <div
          className="banner error"
          style={{ maxWidth: 460, margin: '0 auto 20px', textAlign: 'left' }}
        >
          Sign-in failed: {searchParams.error}
        </div>
      )}

      <a href="/api/auth/login">
        <button className="primary">Sign in with monday.com</button>
      </a>
    </div>
  );
}
