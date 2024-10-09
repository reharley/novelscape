import { useIsAuthenticated } from '@azure/msal-react';
import { Outlet, useNavigate } from 'react-router-dom';

const ProtectedRoute = () => {
  const isAuthenticated = useIsAuthenticated();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    navigate('/welcome');
  }

  return <Outlet />;
};

export default ProtectedRoute;
