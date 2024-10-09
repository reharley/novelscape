import {
  Button,
  Card,
  Layout,
  List,
  message,
  Modal,
  Select,
  Spin,
  Typography,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { apiUrl } from '../utils/general';
import { AiModel, Profile } from '../utils/types';

const { Content } = Layout;
const { Option } = Select;
const { Title } = Typography;

const LoraAssociationPage: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loras, setLoras] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [selectedLoras, setSelectedLoras] = useState<number[]>([]);
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);

  const baseUrl = apiUrl + '/api';

  useEffect(() => {
    fetchProfiles();
    fetchLoras();
  }, []);

  // Fetch all profiles with their associated LoRAs
  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const response = await axios.get<Profile[]>(`${baseUrl}/profiles`);
      setProfiles(response.data);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      message.error('Failed to fetch profiles.');
    }
    setLoading(false);
  };

  // Fetch all downloaded LoRAs
  const fetchLoras = async () => {
    setLoading(true);
    try {
      const response = await axios.get<AiModel[]>(`${baseUrl}/ai-models/loras`);
      setLoras(response.data);
    } catch (error) {
      console.error('Error fetching LoRAs:', error);
      message.error('Failed to fetch LoRAs.');
    }
    setLoading(false);
  };

  // Handle profile selection
  const handleProfileSelect = (profileId: number) => {
    const profile = profiles.find((p) => p.id === profileId) || null;
    setSelectedProfile(profile);
    if (profile) {
      setSelectedLoras(profile.aiModels.map((lora) => lora.id));
    } else {
      setSelectedLoras([]);
    }
  };

  // Show the association modal
  const showAssociateModal = () => {
    if (!selectedProfile) {
      message.warning('Please select a profile first.');
      return;
    }
    setIsModalVisible(true);
  };

  // Handle associating selected LoRAs with the selected Profile
  const handleAssociate = async () => {
    if (!selectedProfile) return;

    try {
      // Iterate over selectedLoras and associate each with the profile
      for (const loraId of selectedLoras) {
        await axios.post(
          `${baseUrl}/profiles/${selectedProfile.id}/associate-lora`,
          { loraId }
        );
      }
      message.success('LoRAs associated successfully.');
      fetchProfiles(); // Refresh profiles to update associations
      setIsModalVisible(false);
    } catch (error) {
      console.error('Error associating LoRAs:', error);
      message.error('Failed to associate LoRAs.');
    }
  };

  // Handle disassociating a LORA from a Profile
  const handleDisassociate = async (profileId: number, loraId: number) => {
    try {
      await axios.delete(
        `${baseUrl}/profiles/${profileId}/disassociate-lora/${loraId}`
      );
      message.success('LORA disassociated successfully.');
      fetchProfiles(); // Refresh profiles to update associations
    } catch (error) {
      console.error('Error disassociating LORA:', error);
      message.error('Failed to disassociate LORA.');
    }
  };

  return (
    <Layout>
      <Content style={{ padding: '20px' }}>
        <Title level={2}>LORA Associations</Title>

        {/* Profiles List */}
        <Spin spinning={loading}>
          {/* Selected Profile Details */}
          {selectedProfile && (
            <Card
              title={`Profile: ${selectedProfile.name}`}
              style={{ marginTop: '20px' }}
              extra={
                <Button type='primary' onClick={showAssociateModal}>
                  Associate LoRAs
                </Button>
              }
            >
              <Title level={4}>Associated LoRAs</Title>
              <List
                grid={{ gutter: 16, column: 4 }}
                dataSource={selectedProfile.aiModels}
                locale={{ emptyText: 'No LoRAs associated.' }}
                renderItem={(lora) => (
                  <List.Item>
                    <Card
                      hoverable
                      cover={
                        lora.images && lora.images.length > 0 ? (
                          <img
                            alt={lora.name}
                            src={lora.images[0].url}
                            style={{ height: '150px', objectFit: 'cover' }}
                          />
                        ) : null
                      }
                      actions={[
                        <Button
                          type='link'
                          danger
                          onClick={() =>
                            handleDisassociate(selectedProfile.id, lora.id)
                          }
                        >
                          Remove
                        </Button>,
                      ]}
                    >
                      <Card.Meta title={lora.name} description={lora.type} />
                    </Card>
                  </List.Item>
                )}
              />
            </Card>
          )}

          <Card title='Profiles'>
            <List
              itemLayout='horizontal'
              dataSource={profiles}
              renderItem={(profile) => (
                <List.Item
                  actions={[
                    <Button
                      type='link'
                      onClick={() => handleProfileSelect(profile.id)}
                    >
                      Select
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={profile.name}
                    description={`Type: ${profile.type}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Spin>

        {/* Associate LoRAs Modal */}
        <Modal
          title={`Associate LoRAs with ${selectedProfile?.name}`}
          visible={isModalVisible}
          onOk={handleAssociate}
          onCancel={() => setIsModalVisible(false)}
          okText='Associate'
        >
          <Select
            mode='multiple'
            style={{ width: '100%' }}
            placeholder='Select LoRAs to associate'
            value={selectedLoras}
            onChange={(values) => setSelectedLoras(values as number[])}
          >
            {loras.map((lora) => (
              <Option key={lora.id} value={lora.id}>
                {lora.name} ({lora.type})
              </Option>
            ))}
          </Select>
        </Modal>
      </Content>
    </Layout>
  );
};

export default LoraAssociationPage;
