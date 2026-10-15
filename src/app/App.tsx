import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSubmissionSync } from '../api/useSubmissionSync';
import { CaptainsLog } from './screens/CaptainsLog';
import { GameScreen } from './screens/GameScreen';
import { MainMenu } from './screens/MainMenu';
import { OptionsScreen } from './screens/OptionsScreen';
import { ResultScreen } from './screens/ResultScreen';
import { useRoute } from './router';

function SubmissionSync() {
  useSubmissionSync();
  return null;
}

function Screens() {
  const { route, navigationId } = useRoute();
  const [restartCount, setRestartCount] = useState(0);

  useEffect(() => {
    document.title =
      route.name === 'play'
        ? 'Battle · Pirate Battle'
        : route.name === 'log'
          ? `${route.tab === 'ranking' ? 'Ranking' : 'Match History'} · Pirate Battle`
          : route.name === 'menu'
            ? 'Pirate Battle'
            : `${route.name[0]?.toUpperCase() ?? ''}${route.name.slice(1)} · Pirate Battle`;
  }, [route]);

  switch (route.name) {
    case 'play':
      // A new key on every navigation/restart guarantees a fresh match.
      return <GameScreen key={`${navigationId}-${restartCount}`} onRestart={() => setRestartCount((n) => n + 1)} />;
    case 'options':
      return <OptionsScreen />;
    case 'result':
      return <ResultScreen />;
    case 'log':
      return <CaptainsLog tab={route.tab} />;
    default:
      return <MainMenu />;
  }
}

export function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SubmissionSync />
      <Screens />
    </QueryClientProvider>
  );
}
