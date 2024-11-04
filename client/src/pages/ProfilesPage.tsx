import {
  Button,
  Card,
  Divider,
  Form,
  Image,
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
import ProfileGenerationDataModal from '../components/ProfileGenerationDataModal'; // Added import
import { apiUrl } from '../utils/general';
import { AiModel, ProfileGenerationData } from '../utils/types';

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

interface AiModels {
  loras: AiModel[];
  models: AiModel[];
  embeddings: AiModel[];
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

const ProfilesPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [editingGenData, setEditingGenData] =
    useState<ProfileGenerationData | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState<boolean>(false);
  const [form] = Form.useForm();
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

  const showEditModal = (genData: ProfileGenerationData) => {
    setEditingGenData(genData);
    form.setFieldsValue({
      name: genData.name, // Set the name field
      prompt: genData.prompt,
      negativePrompt: genData.negativePrompt,
      steps: genData.steps,
      width: genData.width,
      height: genData.height,
      checkpointId: genData.checkpointId,
      removeBackground: genData.removeBackground,
      loras: genData.loras.map((lora) => ({
        id: lora.aiModelId,
        weight: lora.weight || 1.0,
      })),
      embeddings: genData.embeddings.map((embedding) => embedding.id),
      negativeEmbeddings: genData.negativeEmbeddings.map(
        (embedding) => embedding.aiModelId
      ),
      generationPackageId: genData.generationPackageId, // If needed
    });
    setIsEditModalVisible(true);
  };

  // Handler to submit the edit form
  const handleEditSubmit = () => {
    form
      .validateFields()
      .then((values) => {
        if (!editingGenData) return;
        // Prepare the payload based on your API requirements
        const payload: Partial<ProfileGenerationData> = {
          name: values.name, // Include the name field
          prompt: values.prompt,
          negativePrompt: values.negativePrompt,
          steps: values.steps,
          width: values.width,
          height: values.height,
          checkpointId: values.checkpointId,
          removeBackground: values.removeBackground,
          loras: values.loras.map((lora: { id: number; weight: number }) => ({
            id: lora.id,
            weight: lora.weight,
          })),
          embeddings: values.embeddings,
          negativeEmbeddings: values.negativeEmbeddings,
          // Include generationPackageId if it's editable
          // generationPackageId: values.generationPackageId,
        };
        axios
          .put(
            apiUrl + `/api/generation-packages/profile/${editingGenData.id}`,
            payload
          )
          .then((response) => {
            message.success('Profile Generation Data updated successfully.');
            // Refresh profiles
            if (selectedGenerationPackageId !== null) {
              axios
                .get(
                  apiUrl +
                    `/api/generation-packages/${selectedGenerationPackageId}/profiles`
                )
                .then((res) => {
                  setProfiles(res.data);
                })
                .catch((error) => {
                  console.error('Error fetching profiles:', error);
                  message.error('Failed to load profiles.');
                });
            }
            setIsEditModalVisible(false);
            setEditingGenData(null);
            form.resetFields();
          })
          .catch((error) => {
            console.error('Error updating Profile Generation Data:', error);
            message.error('Failed to update Profile Generation Data.');
          });
      })
      .catch((info) => {
        console.log('Validate Failed:', info);
      });
  };

  const handleCancelEditModal = () => {
    setIsEditModalVisible(false);
    setEditingGenData(null);
    form.resetFields();
  };

  const onClickGenerate = async (genData: ProfileGenerationData) => {
    try {
      const response = await axios.post(
        apiUrl + '/api/profiles/generate-image',
        {
          profileGenerationId: genData.id,
        }
      );

      // Assume the API returns the new imageUrl
      const { imageUrl } = response.data;

      if (!imageUrl) {
        message.error('Image URL not returned from the server.');
        return;
      }

      // Find the profile that contains this genData and update its imageUrl
      setProfiles((prevProfiles) =>
        prevProfiles.map((profile) => {
          const hasGenData = profile.profileGenerationData.some(
            (g) => g.id === genData.id
          );
          if (hasGenData) {
            return { ...profile, imageUrl };
          }
          return profile;
        })
      );

      message.success('Image generated successfully.');
    } catch (error) {
      console.error('Error generating image:', error);
      message.error('Failed to generate image.');
    }
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
                        <Image
                          src={profile.imageUrl}
                          alt={profile.name}
                          style={{
                            width: '100px',
                            // height: '100px',
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
                          title={`Generation Data: ${genData.name}`} // Displaying the name instead of id
                          style={{ marginTop: 16 }}
                          key={genData.id}
                          extra={
                            <>
                              <Button
                                type='primary'
                                onClick={() => onClickGenerate(genData)}
                              >
                                Generate
                              </Button>
                              <Button
                                type='link'
                                onClick={() => showEditModal(genData)}
                              >
                                Edit
                              </Button>
                            </>
                          }
                        >
                          <p>
                            <Text strong>Name:</Text> {genData.name}
                          </p>
                          <p>
                            <Text strong>Prompt:</Text> {genData.prompt}
                          </p>
                          <p>
                            <Text strong>Negative Prompt:</Text>{' '}
                            {genData.negativePrompt || 'N/A'}
                          </p>
                          <p>
                            <Text strong>Steps:</Text>{' '}
                            {genData.steps !== undefined
                              ? genData.steps
                              : 'N/A'}
                          </p>
                          <p>
                            <Text strong>Width:</Text>{' '}
                            {genData.width !== undefined
                              ? genData.width
                              : 'N/A'}
                          </p>
                          <p>
                            <Text strong>Height:</Text>{' '}
                            {genData.height !== undefined
                              ? genData.height
                              : 'N/A'}
                          </p>
                          <p>
                            <Text strong>Checkpoint:</Text>{' '}
                            {aiModels.models.find(
                              (model) => model.id === genData.checkpointId
                            )?.name || 'N/A'}
                          </p>
                          <p>
                            <Text strong>Remove Background:</Text>{' '}
                            {genData.removeBackground ? 'Yes' : 'No'}
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
                                    {
                                      aiModels.loras.find(
                                        (x) => x.id === lora.aiModelId
                                      )?.name
                                    }{' '}
                                    (Weight: {lora.weight})
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
                                  <List.Item>
                                    {
                                      aiModels.embeddings.find(
                                        (x) => x.id === embedding.aiModelId
                                      )?.name
                                    }
                                  </List.Item>
                                )}
                              />
                            </div>
                          )}
                          {/* Negative Embeddings */}
                          {genData.negativeEmbeddings.length > 0 && (
                            <div>
                              <Text strong>Negative Embeddings:</Text>
                              <List
                                size='small'
                                dataSource={genData.negativeEmbeddings}
                                renderItem={(embedding) => (
                                  <List.Item>
                                    {
                                      aiModels.embeddings.find(
                                        (x) => x.id === embedding.aiModelId
                                      )?.name
                                    }
                                  </List.Item>
                                )}
                              />
                            </div>
                          )}
                          <p>
                            <Text strong>Created At:</Text>{' '}
                            {new Date(genData.createdAt).toLocaleString()}
                          </p>
                          <p>
                            <Text strong>Updated At:</Text>{' '}
                            {new Date(genData.updatedAt).toLocaleString()}
                          </p>
                          {/* Display Generation Package if available */}
                          {genData.generationPackageId && (
                            <p>
                              <Text strong>Generation Package ID:</Text>{' '}
                              {genData.generationPackageId}
                            </p>
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

      {/* Use the new ProfileGenerationDataModal component */}
      <ProfileGenerationDataModal
        visible={isEditModalVisible}
        onOk={handleEditSubmit}
        onCancel={handleCancelEditModal}
        editingGenData={editingGenData}
        form={form}
        aiModels={aiModels}
      />
    </div>
  );
};

export default ProfilesPage;
