import {
  Button,
  Card,
  Divider,
  Input,
  List,
  Modal,
  Select,
  Spin,
  Typography,
  message,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { apiUrl } from '../utils/general';

const { Option } = Select;
const { Title, Text } = Typography;

interface Book {
  id: number;
  title: string;
}

interface GenerationPackage {
  id: number;
  name: string;
}

interface PositiveLora {
  id: number;
  name: string;
  weight: number;
}

interface Embedding {
  id: number;
  name: string;
}

interface NegativeEmbedding {
  id: number;
  name: string;
}

interface ProfileGenerationData {
  id: number;
  prompt: string;
  negative_prompt?: string;
  steps?: number;
  width?: number;
  height?: number;
  model: string;
  removeBackground: boolean;
  loras: PositiveLora[];
  embeddings: Embedding[];
  negativeEmbeddings: NegativeEmbedding[];
}

interface Profile {
  id: number;
  name: string;
  type?: string;
  imageUrl?: string;
  gender?: string;
  descriptions: any[];
  profileGenerationData: ProfileGenerationData[];
}

interface AiModels {
  loras: AiModel[];
  models: AiModel[];
  embeddings: AiModel[];
}

interface AiModel {
  id: number;
  name: string;
  fileName: string;
  type: string;
}

const ProfilesPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);

  const [generationPackages, setGenerationPackages] = useState<
    GenerationPackage[]
  >([]);
  const [selectedGenerationPackageId, setSelectedGenerationPackageId] =
    useState<number | null>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState<boolean>(false);

  const [aiModels, setAiModels] = useState<AiModels>({
    loras: [],
    models: [],
    embeddings: [],
  });

  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [newPackageName, setNewPackageName] = useState<string>('');

  useEffect(() => {
    // Fetch list of books
    axios
      .get(apiUrl + '/api/books')
      .then((response) => {
        setBooks(response.data);
        if (response.data.length > 0) {
          // Optionally select the first book by default
          setSelectedBookId(response.data[0].id);
        }
      })
      .catch((error) => {
        console.error('Error fetching books:', error);
        message.error('Failed to load books.');
      });

    // Fetch AiModels
    const fetchAiModels = async () => {
      try {
        const [lorasResponse, modelsResponse, embeddingsResponse] =
          await Promise.all([
            axios.get(apiUrl + '/api/ai-models/list-loras'),
            axios.get(apiUrl + '/api/ai-models/list-models'),
            axios.get(apiUrl + '/api/ai-models/list-embeddings'),
          ]);
        setAiModels({
          loras: lorasResponse.data,
          models: modelsResponse.data,
          embeddings: embeddingsResponse.data,
        });
      } catch (error) {
        console.error('Error fetching AiModels:', error);
        message.error('Failed to load AI models.');
      }
    };
    fetchAiModels();
  }, []);

  useEffect(() => {
    if (selectedBookId !== null) {
      // Fetch generation packages for the selected book
      axios
        .get(apiUrl + `/api/books/${selectedBookId}/generation-packages`)
        .then((response) => {
          setGenerationPackages(response.data);
          setSelectedGenerationPackageId(null);
          setProfiles([]);
        })
        .catch((error) => {
          console.error('Error fetching generation packages:', error);
          message.error('Failed to load generation packages.');
        });
    }
  }, [selectedBookId]);

  useEffect(() => {
    if (selectedGenerationPackageId !== null) {
      setLoadingProfiles(true);
      // Fetch profiles for the selected generation package
      axios
        .get(
          apiUrl +
            `/api/generation-packages/${selectedGenerationPackageId}/profiles`
        )
        .then((response) => {
          setProfiles(response.data);
        })
        .catch((error) => {
          console.error('Error fetching profiles:', error);
          message.error('Failed to load profiles.');
        })
        .finally(() => {
          setLoadingProfiles(false);
        });
    }
  }, [selectedGenerationPackageId]);

  const handleBookChange = (value: number) => {
    setSelectedBookId(value);
  };

  const handleGenerationPackageChange = (value: number) => {
    setSelectedGenerationPackageId(value);
  };

  const showCreatePackageModal = () => {
    setIsModalVisible(true);
  };

  const handleCreatePackage = () => {
    if (!newPackageName) {
      message.error('Please enter a package name.');
      return;
    }
    axios
      .post(apiUrl + '/api/generation-packages', {
        name: newPackageName,
        bookId: selectedBookId,
      })
      .then((response) => {
        const newPackage = response.data;
        setGenerationPackages([...generationPackages, newPackage]);
        setSelectedGenerationPackageId(newPackage.id);
        setIsModalVisible(false);
        setNewPackageName('');
        message.success('Generation package created successfully.');
      })
      .catch((error) => {
        console.error('Error creating generation package:', error);
        message.error('Failed to create generation package.');
      });
  };

  const handleCancelModal = () => {
    setIsModalVisible(false);
    setNewPackageName('');
  };

  return (
    <div style={{ padding: '20px' }}>
      <Title level={2}>Select a Book</Title>
      <Select
        placeholder='Select a book'
        style={{ width: 300 }}
        value={selectedBookId || undefined}
        onChange={handleBookChange}
      >
        {books.map((book) => (
          <Option key={book.id} value={book.id}>
            {book.title}
          </Option>
        ))}
      </Select>

      {selectedBookId && (
        <>
          <Divider />
          <Title level={3}>Select or Create a Generation Package</Title>
          <Select
            placeholder='Select a generation package'
            style={{ width: 300 }}
            value={selectedGenerationPackageId || undefined}
            onChange={handleGenerationPackageChange}
          >
            {generationPackages.map((pkg) => (
              <Option key={pkg.id} value={pkg.id}>
                {pkg.name}
              </Option>
            ))}
          </Select>
          <Button
            type='primary'
            style={{ marginLeft: '10px' }}
            onClick={showCreatePackageModal}
          >
            Create New Package
          </Button>

          <Modal
            title='Create New Generation Package'
            visible={isModalVisible}
            onOk={handleCreatePackage}
            onCancel={handleCancelModal}
          >
            <Input
              placeholder='Package Name'
              value={newPackageName}
              onChange={(e) => setNewPackageName(e.target.value)}
            />
          </Modal>
        </>
      )}

      {selectedGenerationPackageId && (
        <>
          <Divider />
          {loadingProfiles ? (
            <Spin tip='Loading profiles...' />
          ) : (
            <>
              <Title level={3}>Profiles</Title>
              <List
                grid={{ gutter: 16, column: 1 }}
                dataSource={profiles}
                renderItem={(profile) => (
                  <List.Item>
                    <Card title={profile.name}>
                      {profile.imageUrl ? (
                        <img
                          src={profile.imageUrl}
                          alt={profile.name}
                          style={{
                            width: '100px',
                            height: '100px',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100px',
                            height: '100px',
                            backgroundColor: '#f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#999',
                          }}
                        >
                          No Image
                        </div>
                      )}
                      <p>
                        <Text strong>Number of Descriptions:</Text>{' '}
                        {profile.descriptions.length}
                      </p>
                      {/* Display ProfileGenerationData */}
                      {profile.profileGenerationData.map((genData) => (
                        <Card
                          type='inner'
                          title={`Generation Data ${genData.id}`}
                          style={{ marginTop: 16 }}
                          key={genData.id}
                        >
                          <p>
                            <Text strong>Prompt:</Text> {genData.prompt}
                          </p>
                          <p>
                            <Text strong>Model:</Text> {genData.model}
                          </p>
                          {/* Positive LORAs */}
                          {genData.loras.length > 0 && (
                            <div>
                              <Text strong>Positive LORAs:</Text>
                              <List
                                size='small'
                                dataSource={genData.loras}
                                renderItem={(lora) => (
                                  <List.Item>
                                    {lora.name} (Weight: {lora.weight})
                                  </List.Item>
                                )}
                              />
                            </div>
                          )}
                          {/* Embeddings */}
                          {genData.embeddings.length > 0 && (
                            <div>
                              <Text strong>Embeddings:</Text>
                              <List
                                size='small'
                                dataSource={genData.embeddings}
                                renderItem={(embedding) => (
                                  <List.Item>{embedding.name}</List.Item>
                                )}
                              />
                            </div>
                          )}
                        </Card>
                      ))}
                    </Card>
                  </List.Item>
                )}
              />
            </>
          )}
        </>
      )}

      <Divider />

      <Title level={3}>Available AI Models</Title>
      <List
        header={<Text strong>Models (Checkpoints)</Text>}
        dataSource={aiModels.models}
        renderItem={(model) => <List.Item>{model.name}</List.Item>}
      />

      <List
        header={<Text strong>LORAs</Text>}
        dataSource={aiModels.loras}
        renderItem={(lora) => <List.Item>{lora.name}</List.Item>}
      />

      <List
        header={<Text strong>Embeddings (Textual Inversions)</Text>}
        dataSource={aiModels.embeddings}
        renderItem={(embedding) => <List.Item>{embedding.name}</List.Item>}
      />
    </div>
  );
};

export default ProfilesPage;
