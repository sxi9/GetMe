import { useStore } from '../lib/store';
import { Body, Button, Header } from '../ui';
export function PartnerApp() {
  const { session, signOut } = useStore();
  return <><Header title="Partner app" /><Body><div className="card">Signed in as {session?.me.user.name}</div><Button variant="outlined" onClick={signOut}>Log out</Button></Body></>;
}
