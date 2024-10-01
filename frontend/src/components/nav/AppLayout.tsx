import { ConfigProvider, Layout, Menu, theme } from 'antd';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const { Header, Content, Footer } = Layout;

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  // Determine the selected menu item based on the current route
  const selectedKeys = [location.pathname];

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
      }}
    >
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
            <Menu.Item key='/reader'>
              <Link to='/reader'>Book Reader</Link>
            </Menu.Item>
            <Menu.Item key='/ai-reader'>
              <Link to='/ai-reader'>AI Enhanced Reader</Link>
            </Menu.Item>
            <Menu.Item key='/profiles'>
              <Link to='/profiles'>Profiles</Link>
            </Menu.Item>
            <Menu.Item key='/associate-loras'>
              <Link to='/associate-loras'>Associate LoRAs</Link>
            </Menu.Item>
          </Menu>
        </Header>
        <Content style={{ padding: '50px', marginTop: 64 }}>{children}</Content>
        <Footer style={{ textAlign: 'center' }}>©2023 My App</Footer>
      </Layout>
    </ConfigProvider>
  );
};

export default AppLayout;
