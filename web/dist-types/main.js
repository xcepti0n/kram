import { jsx as _jsx } from "react/jsx-runtime";
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
createRoot(document.getElementById('root')).render(_jsx(StrictMode, { children: _jsx(QueryClientProvider, { client: client, children: _jsx(ToastProvider, { children: _jsx(App, {}) }) }) }));
//# sourceMappingURL=main.js.map