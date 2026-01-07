import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { MainLayout } from './layouts/MainLayout';
import { Loader2 } from 'lucide-react';

// Lazy Load Pages
const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Registrations = lazy(() => import('./pages/Registrations').then(module => ({ default: module.Registrations })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full w-full min-h-[400px]">
    <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="dashboard"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <Dashboard />
                </Suspense>
              }
            />
            <Route
              path="registrations"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <Registrations />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
