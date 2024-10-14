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
import AIEnhancedReaderPage from './components/reader/AIEnhancedReaderPage.tsx';
import ProtectedRoute from './components/routing/ProtectedRoute.tsx';
import FullScreenReaderPage from './pages/FullScreenReaderPage.tsx';
import ChapterImageGenerator from './pages/ImageGenerationPage.tsx';
import LoraAssociationPage from './pages/LoraAssociationPage.tsx';
import ProfileLoraPage from './pages/ProfileLoraPage.tsx';

import LandingPage from './pages/LandingPage.tsx';
import LibraryPage from './pages/LibraryPage.tsx';
import ProfileListPage from './pages/ProfilesListPage.tsx';
import UserPage from './pages/UserPage.tsx';
import { reactPlugin } from './utils/appInsights.ts';
import { msalConfig } from './utils/authConfig.ts';
import { setupAxios } from './utils/axiosSetup.ts';

setupAxios();

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
            <Route path='library' element={<LibraryPage />} />
            <Route path='ai-reader' element={<AIEnhancedReaderPage />} />
            <Route path='user' element={<UserPage />} />
            <Route path='profile-loras' element={<ProfileLoraPage />} />
            <Route path='profiles' element={<ProfileListPage />} />
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
