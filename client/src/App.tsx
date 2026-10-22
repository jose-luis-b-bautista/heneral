import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider, useSocket } from './context/SocketContext';
import { GameProvider } from './context/GameContext';
import { Layout } from './components/Layout';
import { AuthPage } from './pages/AuthPage';
import { LobbyPage } from './pages/LobbyPage';
import { GameView } from './components/GameView';
import { Spinner } from './components/ui';

/**
 * The view is driven entirely by auth + match state (not the URL): the socket
 * phase decides whether we show the lobby or the board, which keeps a real-time
 * game consistent across refreshes and reconnects.
 */
function CurrentView() {
  const { user, loading } = useAuth();
  const { phase } = useSocket();

  if (loading) return <div className="flex justify-center py-20"><Spinner label="Loading…" /></div>;
  if (!user) return <AuthPage />;
  if (phase === 'playing' || phase === 'concluded') return <GameView />;
  return <LobbyPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <GameProvider>
          <Layout>
            <CurrentView />
          </Layout>
        </GameProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
