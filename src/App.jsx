import { useEffect } from 'react';
import { useNexus } from './store/NexusContext';
import Header from './components/Header';
import Canvas from './components/Canvas';
import Sidebar from './components/Sidebar';
import DetailsDrawer from './components/DetailsDrawer';
import ToastContainer from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';

export default function App() {
  const { loadFromStorage } = useNexus();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <>
      <Header />
      <main className="app-main">
        <Canvas />
        <Sidebar />
        <DetailsDrawer />
      </main>
      <ConfirmDialog />
      <ToastContainer />
    </>
  );
}
