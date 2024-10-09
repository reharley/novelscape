import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { AppInsightsContext } from '@microsoft/applicationinsights-react-js';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
  RouterProvider,
} from 'react-router-dom';

import ModelManagerPage from './components/models/ModelManagerPage';
import AppLayout from './components/nav/AppLayout';
import AppTheme from './components/nav/AppTheme.tsx';
import ProfilesPage from './components/profiles/ProfilesPage';
import AIEnhancedReaderPage from './components/reader/AIEnhancedReaderPage.tsx';
import BookReaderPage from './components/reader/BookReaderPage';
import ProtectedRoute from './components/routing/ProtectedRoute.tsx';
import FullScreenReaderPage from './pages/FullScreenReaderPage.tsx';
import ChapterImageGenerator from './pages/ImageGenerationPage.tsx';
import LoraAssociationPage from './pages/LoraAssociationPage.tsx';

import LandingPage from './pages/LandingPage.tsx';
import { reactPlugin } from './utils/appInsights.ts';
import { msalConfig } from './utils/authConfig.ts';

const LayoutRoute = () => (
  <AppLayout>
    <Outlet />
  </AppLayout>
);

const ThemeRoute = () => (
  <AppTheme>
    <Outlet />
  </AppTheme>
);

// @ts-ignore
const msalInstance = new PublicClientApplication(msalConfig);

msalInstance.initialize();

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route element={<ThemeRoute />}>
        <Route path='welcome' element={<LandingPage />} />
        <Route element={<ProtectedRoute />}>
          <Route
            path='reader/:bookId/:chapterId/:passageIndex'
            element={<FullScreenReaderPage />}
          />
          <Route path='/' element={<LayoutRoute />}>
            {/* <Route index element={<HomePage />} /> */}
            <Route path='models' element={<ModelManagerPage />} />
            <Route path='reader' element={<BookReaderPage />} />
            <Route path='ai-reader' element={<AIEnhancedReaderPage />} />
            <Route path='profiles' element={<ProfilesPage />} />
            <Route path='associate-loras' element={<LoraAssociationPage />} />
            <Route
              path='chapter-generation'
              element={<ChapterImageGenerator />}
            />
          </Route>
        </Route>
      </Route>
    </>
  )
);

function App() {
  return (
    <AppInsightsContext.Provider value={reactPlugin}>
      <MsalProvider instance={msalInstance}>
        <RouterProvider router={router} />
      </MsalProvider>
    </AppInsightsContext.Provider>
  );
}

export default App;
