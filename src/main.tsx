import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ToastProvider from './components/Toast';
import { loadSettings, applyTheme } from './lib/settings';
import './App.css';

// Apply the device's last-known theme before first paint so a stored Dark
// choice doesn't flash light while auth loads (and the login screen matches).
const lastOwner = localStorage.getItem('gym-tracker-owner');
if (lastOwner) applyTheme(loadSettings(lastOwner).theme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
