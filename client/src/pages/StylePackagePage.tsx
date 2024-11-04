import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Table,
  Typography,
  message,
} from 'antd';
import { ColumnsType } from 'antd/lib/table';
import React, { useEffect, useState } from 'react';
import { getProfileGenerationData } from '../api/profileGenerationDataApi'; // Ensure this API exists
import {
  createStylePackage,
  deleteStylePackage,
  getStylePackages,
  updateStylePackage,
} from '../api/stylePackageApi';
import { ProfileGenerationData, StylePackage } from '../utils/types';

const { Option } = Select;
const { Title } = Typography;

const StylePackagePage: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [editingStylePackage, setEditingStylePackage] =
    useState<StylePackage | null>(null);
  const [stylePackages, setStylePackages] = useState<StylePackage[]>([]);
  const [profileGenData, setProfileGenData] = useState<ProfileGenerationData[]>(
    []
  );
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchStylePackages();
    fetchProfileGenData();
  }, []);

  const fetchStylePackages = async () => {
    setLoading(true);
    try {
      const data = await getStylePackages();
      setStylePackages(data);
    } catch (error) {
      message.error('Failed to fetch Style Packages.');
    } finally {
      setLoading(false);
    }
  };

  const fetchProfileGenData = async () => {
    try {
      const data = await getProfileGenerationData();
      setProfileGenData(data);
    } catch (error) {
      message.error('Failed to fetch Profile Generation Data.');
    }
  };

  const handleOk = () => {
    form.submit();
  };

  const handleCancel = () => {
    setVisible(false);
    setEditingStylePackage(null);
    form.resetFields();
  };

  const onFinish = async (values: any) => {
    try {
      if (editingStylePackage) {
        await updateStylePackage(editingStylePackage.id, values);
        message.success('Style Package updated successfully.');
      } else {
        await createStylePackage(values);
        message.success('Style Package created successfully.');
      }
      fetchStylePackages();
      handleCancel();
    } catch (error: any) {
      message.error(
        `Failed to ${editingStylePackage ? 'update' : 'create'} Style Package.`
      );
    }
  };

  const showEditModal = (stylePackage: StylePackage) => {
    setEditingStylePackage(stylePackage);
    setVisible(true);
    form.setFieldsValue(stylePackage);
  };

  const confirmDelete = async (id: number) => {
    try {
      await deleteStylePackage(id);
      message.success('Style Package deleted successfully.');
      fetchStylePackages();
    } catch (error) {
      message.error('Failed to delete Style Package.');
    }
  };

  const columns: ColumnsType<StylePackage> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Character Profile',
      dataIndex: 'characterProfile',
      key: 'characterProfile',
      render: (profile: ProfileGenerationData) => profile.name,
    },
    {
      title: 'Background Profile',
      dataIndex: 'backgroundProfile',
      key: 'backgroundProfile',
      render: (profile: ProfileGenerationData) => profile.name,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: StylePackage) => (
        <>
          <Button
            type='link'
            icon={<EditOutlined />}
            onClick={() => showEditModal(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title='Are you sure you want to delete this Style Package?'
            onConfirm={() => confirmDelete(record.id)}
            okText='Yes'
            cancelText='No'
          >
            <Button type='link' danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </>
      ),
    },
  ];

  return (
    <>
      <Title level={2}>Style Packages</Title>
      <Button
        type='primary'
        onClick={() => setVisible(true)}
        style={{ marginBottom: 16 }}
      >
        Create Style Package
      </Button>
      <Table
        dataSource={stylePackages}
        columns={columns}
        rowKey='id'
        loading={loading}
      />
      <Modal
        title={
          editingStylePackage ? 'Edit Style Package' : 'Create Style Package'
        }
        visible={visible}
        onOk={handleOk}
        onCancel={handleCancel}
        width={600}
      >
        <Form
          form={form}
          layout='vertical'
          initialValues={{
            name: '',
            characterProfileId: undefined,
            backgroundProfileId: undefined,
          }}
          onFinish={onFinish}
        >
          <Form.Item
            label='Name'
            name='name'
            rules={[{ required: true, message: 'Please enter the name.' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label='Character Profile'
            name='characterProfileId'
            rules={[
              { required: true, message: 'Please select a character profile.' },
            ]}
          >
            <Select placeholder='Select Character Profile'>
              {profileGenData.map((pgd) => (
                <Option key={pgd.id} value={pgd.id}>
                  {pgd.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label='Background Profile'
            name='backgroundProfileId'
            rules={[
              {
                required: true,
                message: 'Please select a background profile.',
              },
            ]}
          >
            <Select placeholder='Select Background Profile'>
              {profileGenData.map((pgd) => (
                <Option key={pgd.id} value={pgd.id}>
                  {pgd.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default StylePackagePage;
