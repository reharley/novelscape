import {
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
  RouterProvider,
} from 'react-router-dom';

import AppLayout from './components/nav/AppLayout';

import ModelManagerPage from './components/models/ModelManagerPage';
import ProfilesPage from './components/profiles/ProfilesPage';
import AIEnhancedReaderPage from './components/reader/AIEnhancedReaderPage.tsx';
import BookReaderPage from './components/reader/BookReaderPage';
import ChapterImageGenerator from './pages/ImageGenerationPage.tsx';
import LoraAssociationPage from './pages/LoraAssociationPage.tsx';

const LayoutRoute = () => (
  <AppLayout>
    <Outlet />
  </AppLayout>
);

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {/* <Route element={<ProtectedRoute />}> */}
      <Route path='/' element={<LayoutRoute />}>
        {/* <Route index element={<HomePage />} /> */}
        <Route path='models' element={<ModelManagerPage />} />
        <Route path='reader' element={<BookReaderPage />} />
        <Route path='ai-reader' element={<AIEnhancedReaderPage />} />
        <Route path='profiles' element={<ProfilesPage />} />
        <Route path='associate-loras' element={<LoraAssociationPage />} />
        <Route path='chapter-generation' element={<ChapterImageGenerator />} />
      </Route>
      {/* </Route> */}
    </>
  )
);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
