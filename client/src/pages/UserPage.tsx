import { LogoutOutlined } from '@ant-design/icons';
import { useMsal } from '@azure/msal-react';
import { Button, Checkbox, Form, InputNumber, Layout, message } from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { apiUrl } from '../utils/general';

const { Header, Content } = Layout;

interface UserSettings {
  autoPlay: boolean;
  wpm: number;
}

const UserPage: React.FC = () => {
  const { instance } = useMsal();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleLogout = () => {
    instance.logoutPopup();
  };
  const fetchUserSettings = async () => {
    setLoading(true);
    try {
      const response = await axios.get<UserSettings>(
        apiUrl + '/api/user/settings'
      );
      form.setFieldsValue(response.data);
    } catch (error) {
      message.error('Failed to load user settings.');
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values: UserSettings) => {
    setLoading(true);
    try {
      await axios.post(apiUrl + '/api/user/settings', values);
      message.success('Settings saved successfully.');
    } catch (error) {
      message.error('Failed to save settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserSettings();
  }, []);

  return (
    <Layout>
      <Header style={{ padding: 0 }}>
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

        <Form form={form} layout='vertical' onFinish={onFinish}>
          <Form.Item name='autoPlay' valuePropName='checked'>
            <Checkbox>Enable Auto-Play</Checkbox>
          </Form.Item>

          <Form.Item
            name='wpm'
            label='Words Per Minute'
            rules={[
              {
                required: true,
                message: 'Please input your preferred words per minute!',
              },
            ]}
          >
            <InputNumber min={50} max={1000} />
          </Form.Item>

          <Form.Item>
            <Button type='primary' htmlType='submit' loading={loading}>
              Save Settings
            </Button>
          </Form.Item>
        </Form>
      </Content>
    </Layout>
  );
};

export default UserPage;
