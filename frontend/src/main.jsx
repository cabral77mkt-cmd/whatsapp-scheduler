import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './styles/tokens.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { background: '#111111', color: '#FAFAFA', fontSize: '14px', border: '1px solid #1F1F1F' },
          success: { iconTheme: { primary: '#D4AF37', secondary: '#000' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
