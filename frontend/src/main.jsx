// Punto de entrada de React. Normalmente no hace falta tocar este archivo.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { SesionProvider } from './context/SesionProvider.jsx';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SesionProvider>
        <App />
      </SesionProvider>
    </BrowserRouter>
  </React.StrictMode>
);
