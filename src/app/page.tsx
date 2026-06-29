import { redirect } from 'next/navigation';

// Root entry — game moved under /game/[tab].
// Redirect to the default dashboard tab. This preserves the "go to game"
// behavior of the original `/` route while keeping every panel behind its own
// shareable, SEO-indexable URL.
export default function RootRedirect() {
  redirect('/game/dashboard');
}