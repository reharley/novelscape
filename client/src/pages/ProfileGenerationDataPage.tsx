import { Button, Form, message, Table } from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import ProfileGenerationDataModal from '../components/ProfileGenerationDataModal';
import { apiUrl } from '../utils/general';
import { AiModel, ProfileGenerationData } from '../utils/types';

const ProfileGenerationDataPage: React.FC = () => {
  const [data, setData] = useState<ProfileGenerationData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingData, setEditingData] = useState<ProfileGenerationData | null>(
    null
  );

  const [form] = Form.useForm();
  const [aiModels, setAiModels] = useState<{
    loras: AiModel[];
    models: AiModel[];
    embeddings: AiModel[];
  }>({
    loras: [],
    models: [],
    embeddings: [],
  });

  console.log(data);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axios.get<ProfileGenerationData[]>(
        `${apiUrl}/api/profile-generation-data`
      );
      setData(response.data);
    } catch (error) {
      message.error('Failed to fetch Profile Generation Data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAiModels = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/ai-models`);
      setAiModels(response.data);
    } catch {
      message.error('Failed to fetch AI Models.');
    }
  };

  useEffect(() => {
    fetchData();
    fetchAiModels();
  }, []);

  const handleAdd = () => {
    setEditingData(null);
    setModalVisible(true);
  };

  const handleEdit = (record: ProfileGenerationData) => {
    setEditingData(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${apiUrl}/api/profile-generation-data/${id}`);
      message.success('Deleted successfully.');
      fetchData();
    } catch {
      message.error('Failed to delete.');
    }
  };

  const handleFormSubmit = async (values: any) => {
    try {
      if (editingData) {
        // Update existing ProfileGenerationData
        await axios.put(
          `${apiUrl}/api/profile-generation-data/${editingData.id}`,
          values
        );
        message.success('Profile Generation Data updated successfully.');
      } else {
        // Create new ProfileGenerationData
        await axios.post(`${apiUrl}/api/profile-generation-data`, values);
        message.success('Profile Generation Data created successfully.');
      }
      setModalVisible(false);
      fetchData();
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'An error occurred.');
    }
  };

  return (
    <>
      <Button type='primary' onClick={handleAdd} style={{ marginBottom: 16 }}>
        Add Profile Generation Data
      </Button>
      <Table
        dataSource={data}
        loading={loading}
        rowKey='id'
        // ...existing table columns...
      >
        <Table.Column title='Name' dataIndex='name' key='name' />
        {/* Add other columns as needed */}
        <Table.Column
          title='Actions'
          key='actions'
          render={(text, record: any) => (
            <>
              <Button onClick={() => handleEdit(record)}>Edit</Button>
              <Button danger onClick={() => handleDelete(record.id)}>
                Delete
              </Button>
            </>
          )}
        />
      </Table>
      <ProfileGenerationDataModal
        visible={modalVisible}
        onOk={handleFormSubmit} // Pass handleFormSubmit to handle form submission
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        editingGenData={editingData}
        form={form}
        aiModels={aiModels}
      />
    </>
  );
};

export default ProfileGenerationDataPage;
