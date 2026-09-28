import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { EASE_OUT } from './components/ui/Motion';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Sits above the query client so a crash inside a provider still lands on
        a real recovery screen instead of a blank page. */}
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* Two global motion decisions, made once:
              - `reducedMotion="user"` turns every transform/layout animation in
                the app into a no-op for visitors who ask for that. The CSS media
                query in index.css cannot reach framer-motion, so without this
                the JS-driven entrances ignored the preference.
              - a default transition keeps components that never declared one
                (the notification rows, the layout-animated lists) on the same
                0.26s curve as everything else. */}
        <MotionConfig
          reducedMotion="user"
          transition={{ duration: 0.26, ease: EASE_OUT }}
        >
          <App />
        </MotionConfig>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
