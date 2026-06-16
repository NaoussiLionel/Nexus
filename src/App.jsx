import { useEffect, lazy, Suspense } from 'react';
import { useNexus } from './store/NexusContext';
import Header from './components/Header';
import Canvas from './components/Canvas';
import ErrorBoundary from './components/ErrorBoundary';
import { SidebarSkeleton, DrawerSkeleton } from './components/Skeleton';

const Sidebar = lazy(() => import('./components/Sidebar'));
const DetailsDrawer = lazy(() => import('./components/DetailsDrawer'));
const ToastContainer = lazy(() => import('./components/Toast'));
const ConfirmDialog = lazy(() => import('./components/ConfirmDialog'));

export default function App() {
  const { loadFromStorage } = useNexus();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <ErrorBoundary>
      <Header />
      <main className="app-main">
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
        <Canvas />
        <Suspense fallback={<DrawerSkeleton />}>
          <DetailsDrawer />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <ConfirmDialog />
        <ToastContainer />
      </Suspense>
    </ErrorBoundary>
  );
}
