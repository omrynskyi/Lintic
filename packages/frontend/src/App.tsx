import { TopBar } from './components/TopBar.js';
import { SplitPane } from './components/SplitPane.js';
import { IdePanel } from './components/IdePanel.js';

export function App() {
  // Placeholder constraint values — will be wired to session state in later stories
  const constraintState = {
    secondsRemaining: 3600,
    tokensRemaining: 50000,
    interactionsRemaining: 30,
    maxTokens: 50000,
    maxInteractions: 30,
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#080808' }}>
      <TopBar
        secondsRemaining={constraintState.secondsRemaining}
        tokensRemaining={constraintState.tokensRemaining}
        interactionsRemaining={constraintState.interactionsRemaining}
        maxTokens={constraintState.maxTokens}
        maxInteractions={constraintState.maxInteractions}
      />
      <div className="flex-1 overflow-hidden">
        <SplitPane
          left={<IdePanel />}
          right={
            <div
              className="h-full flex items-center justify-center text-sm"
              style={{ background: '#0c0c0c', color: '#333333' }}
            >
              Agent chat panel (US-013)
            </div>
          }
        />
      </div>
    </div>
  );
}
