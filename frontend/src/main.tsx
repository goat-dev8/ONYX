import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { WalletProvider } from './components/providers/WalletProvider';
import { App } from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalletProvider>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid rgba(212, 175, 55, 0.2)',
            borderRadius: '12px',
            padding: '16px',
            fontFamily: 'Inter, sans-serif',
          },
          success: {
            iconTheme: {
              primary: '#D4AF37',
              secondary: '#0D0D0D',
            },
          },
          error: {
            iconTheme: {
              primary: '#EF4444',
              secondary: '#0D0D0D',
            },
          },
        }}
      />
    </WalletProvider>
  </React.StrictMode>
);
