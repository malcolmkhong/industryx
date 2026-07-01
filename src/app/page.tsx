import { redirect } from 'next/navigation';

// Server component — no JS shipped to browser, redirect happens at edge.
export default function RootPage() {
  redirect('/game/dashboard');
}
