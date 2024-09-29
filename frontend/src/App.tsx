import {
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
  RouterProvider,
} from 'react-router-dom';

import AppLayout from './components/nav/AppLayout';

// Import the new pages
import ModelManagerPage from './components/models/ModelManagerPage';
import AIEnhancedReaderPage from './components/reader/AIEnhancedReaderPage.tsx';
import BookReaderPage from './components/reader/BookReaderPage';

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
      </Route>
      {/* </Route> */}
    </>
  )
);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
