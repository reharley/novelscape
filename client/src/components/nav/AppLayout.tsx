import { useIsAuthenticated } from '@azure/msal-react';
import { Layout, Menu } from 'antd';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const { Header, Content, Footer } = Layout;

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isAuthenticated = useIsAuthenticated();

  // Determine the selected menu item based on the current route
  const selectedKeys = [location.pathname];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ position: 'fixed', zIndex: 1, width: '100%' }}>
        {/* You can replace this div with your logo */}
        <div
          className='logo'
          style={{ float: 'left', color: 'white', marginRight: '20px' }}
        >
          <h2 style={{ color: 'white' }}>NovelScape</h2>
        </div>
        <Menu theme='dark' mode='horizontal' selectedKeys={selectedKeys}>
          <Menu.Item key='/'>
            <Link to='/'>Home</Link>
          </Menu.Item>
          <Menu.Item key='/models'>
            <Link to='/models'>Model Manager</Link>
          </Menu.Item>
          <Menu.Item key='/library'>
            <Link to='/library'>Library</Link>
          </Menu.Item>
          <Menu.Item key='/ai-reader'>
            <Link to='/ai-reader'>AI Enhanced Reader</Link>
          </Menu.Item>
          <Menu.Item key='/profile-loras'>
            <Link to='/profile-loras'>Profile Loras</Link>
          </Menu.Item>
          <Menu.Item key='/profiles'>
            <Link to='/profiles'>Profiles</Link>
          </Menu.Item>
          <Menu.Item key='/associate-loras'>
            <Link to='/associate-loras'>Associate LoRAs</Link>
          </Menu.Item>
          <Menu.Item key='/chapter-generation'>
            <Link to='/chapter-generation'>Chapter Generation</Link>
          </Menu.Item>
          <Menu.Item key='/user'>
            <Link to='/user'>User</Link>
          </Menu.Item>
        </Menu>
      </Header>
      <Content style={{ padding: '50px', marginTop: 64 }}>{children}</Content>
      <Footer style={{ textAlign: 'center' }}>©2023 My App</Footer>
    </Layout>
  );
};

export default AppLayout;
