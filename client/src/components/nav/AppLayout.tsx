import { useMsal } from '@azure/msal-react';
import { Layout, Menu } from 'antd';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const { Header, Content, Footer } = Layout;

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { accounts } = useMsal();

  let roles = '';
  if (accounts[0]?.idTokenClaims?.extension_applicationRoles)
    roles = accounts[0].idTokenClaims.extension_applicationRoles as string;
  const selectedKeys = [location.pathname];
  let isAdmin = false;
  if (roles.includes('ns-admin')) isAdmin = true;
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ position: 'fixed', zIndex: 1, width: '100%' }}>
        <div
          className='logo'
          style={{
            float: 'left',
            color: 'white',
            marginRight: '20px',
            display: 'flex',
            alignItems: 'center',
            height: '100%',
          }}
        >
          <h2
            style={{
              color: 'white',
              margin: 0,
              marginRight: '0.3rem',
            }}
          >
            Libscape
          </h2>
        </div>
        <Menu theme='dark' mode='horizontal' selectedKeys={selectedKeys}>
          <Menu.Item key='/'>
            <Link to='/'>Library</Link>
          </Menu.Item>
          {isAdmin && (
            <>
              <Menu.Item key='/models'>
                <Link to='/models'>Model Manager</Link>
              </Menu.Item>
              <Menu.Item key='/profile-generation-data'>
                <Link to='/profile-generation-data'>Gen Data</Link>
              </Menu.Item>
              <Menu.Item key='/style-packages'>
                <Link to='/style-packages'>Style Packs</Link>
              </Menu.Item>
              <Menu.Item key='/profiles'>
                <Link to='/profiles'>Profiles</Link>
              </Menu.Item>
            </>
          )}
          <Menu.Item key='/user'>
            <Link to='/user'>User</Link>
          </Menu.Item>
        </Menu>
      </Header>
      <Content style={{ padding: '50px', marginTop: 64 }}>{children}</Content>
      <Footer style={{ textAlign: 'center' }}>
        Crafted with the wisdom of ages, where tales come to life and
        imagination knows no bounds. Venture forth, for every passage leads to
        new horizons.
      </Footer>
    </Layout>
  );
};

export default AppLayout;
