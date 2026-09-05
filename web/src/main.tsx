import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.js';
import { ToastProvider } from './components/Toast.js';
import './theme/base.css';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      // The data changes only when this user changes it, so aggressive refetching
      // would be noise. Mutations invalidate what they affect.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
