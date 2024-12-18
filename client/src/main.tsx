import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { AppInsightsContext } from '@microsoft/applicationinsights-react-js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { reactPlugin } from './utils/appInsights.ts';
import { msalConfig } from './utils/authConfig.ts';

import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';
import { CustomNavigationClient } from './utils/navigationClient.ts';

// @ts-ignore
const msalInstance = new PublicClientApplication(msalConfig);
if (Capacitor.getPlatform() !== 'web') {
  //@ts-ignore
  const navigationClient = new CustomNavigationClient(msalInstance);
  msalInstance.setNavigationClient(navigationClient);
}
msalInstance.initialize();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppInsightsContext.Provider value={reactPlugin}>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </AppInsightsContext.Provider>
  </StrictMode>
);
