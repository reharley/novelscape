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
import ProtectedRoute from './components/routing/ProtectedRoute.tsx';
import FullScreenReaderPage from './pages/FullScreenReaderPage.tsx';
import LoraAssociationPage from './pages/LoraAssociationPage.tsx';

import { useTokenRefresh } from './hooks/useTokenRefresh.ts';
import BookProcessingPage from './pages/BookProcessingPage.tsx';
import LandingPage from './pages/LandingPage.tsx';
import LibraryPage from './pages/LibraryPage.tsx';
import ProfileGenerationDataPage from './pages/ProfileGenerationDataPage';
import ProfilesPage from './pages/ProfilesPage.tsx';
import StylePackagePage from './pages/StylePackagePage.tsx';
import UserPage from './pages/UserPage.tsx';
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

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route element={<ThemeRoute />}>
        <Route path='welcome' element={<LandingPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path='reader/:bookId' element={<FullScreenReaderPage />} />
          <Route
            path='reader/:bookId/:chapterId/:passageIndex'
            element={<FullScreenReaderPage />}
          />
          <Route path='/' element={<LayoutRoute />}>
            <Route index element={<LibraryPage />} />
            <Route path='models' element={<ModelManagerPage />} />
            <Route path='library' element={<LibraryPage />} />
            <Route path='user' element={<UserPage />} />
            <Route path='style-packages' element={<StylePackagePage />} />
            <Route path='processing/:bookId' element={<BookProcessingPage />} />
            <Route path='profiles' element={<ProfilesPage />} />
            <Route path='associate-loras' element={<LoraAssociationPage />} />
            <Route
              path='profile-generation-data'
              element={<ProfileGenerationDataPage />}
            />
          </Route>
        </Route>
      </Route>
    </>
  )
);

function App() {
  useTokenRefresh();
  return <RouterProvider router={router} />;
}

export default App;
