import type { Metadata } from 'next';
import './globals.css';
import { getSessionUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Leadership 1:1 Portal',
  description:
    'Supervisor-led 1:1 leadership certification tracking for Frontline Pest.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/dashboard" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
            Leadership 1:1 Portal
          </a>
          {user && (
            <span className="who">
              {user.name}
              {' · '}
              <form
                action="/api/auth/logout"
                method="post"
                style={{ display: 'inline' }}
              >
                <button
                  type="submit"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    font: 'inherit',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                  }}
                >
                  Sign out
                </button>
              </form>
            </span>
          )}
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
