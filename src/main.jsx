import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NexusProvider } from './store/NexusContext';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NexusProvider>
      <App />
    </NexusProvider>
  </StrictMode>
);
