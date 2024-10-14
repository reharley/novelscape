import { LogoutOutlined } from '@ant-design/icons';
import { useMsal } from '@azure/msal-react';
import { Button, Layout } from 'antd';
import React from 'react';

const { Header, Content } = Layout;

const UserPage: React.FC = () => {
  const { instance } = useMsal();
  const handleLogout = () => {
    instance.logoutPopup();
  };

  return (
    <Layout>
      <Header style={{ backgroundColor: '#fff', padding: 0 }}>
        <div style={{ float: 'right', marginRight: '16px' }}>
          <Button
            type='primary'
            icon={<LogoutOutlined />}
            onClick={handleLogout}
          >
            Logout
          </Button>
        </div>
      </Header>
      <Content style={{ padding: '24px', minHeight: '280px' }}>
        <h1>Welcome to the Dashboard</h1>
        <p>This is a protected page. You can log out using the button above.</p>
      </Content>
    </Layout>
  );
};

export default UserPage;
