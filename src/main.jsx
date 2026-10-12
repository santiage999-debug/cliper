import '@fontsource-variable/inter';
import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App.jsx'; import './styles.css'; import { BASE } from './api.js';
const st = document.createElement('style'); st.textContent = ['Poppins-Black','Poppins-Bold','Anton-Regular','BebasNeue-Regular','Bangers-Regular','PermanentMarker-Regular'].map(f => `@font-face{font-family:'${f}';src:url(./assets/fonts/${f}.ttf)}`).join(''); document.head.appendChild(st);
createRoot(document.getElementById('root')).render(<App />);
import { Capacitor as __C } from '@capacitor/core';
if (!__C.isNativePlatform() && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
