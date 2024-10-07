// components/models/ModelManagerPage.tsx
import {
  Button,
  Card,
  Image,
  Input,
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
import { AiModel } from '../../utils/types';

const { Content } = Layout;
const { Option } = Select;
const { Search } = Input;
const { Text, Title } = Typography;

const ModelManagerPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [models, setModels] = useState<any[]>([]); // Adjust type based on your search result
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [modelTypeFilter, setModelTypeFilter] = useState<string>('All');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [downloadedModels, setDownloadedModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AiModel>();
  const [downloadedLoras, setDownloadedLoras] = useState<AiModel[]>([]);
  const [selectedLoras, setSelectedLoras] = useState<string[]>([]);
  const [selectedModelDetails, setSelectedModelDetails] =
    useState<AiModel | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const baseUrl = 'http://' + window.location.hostname + ':5000/api';

  useEffect(() => {
    const fetchDownloadedModels = async () => {
      try {
        const response = await axios.get<AiModel[]>(
          `${baseUrl}/ai-models/list-models`
        );
        const models = response.data;
        setDownloadedModels(models);
        if (models.length > 0) {
          setSelectedModel(models[0]); // Use fileName for selection
        }
      } catch (error) {
        console.error('Error fetching downloaded models:', error);
        message.error('Failed to fetch downloaded models.');
      }
    };

    fetchDownloadedModels();
  }, []);

  useEffect(() => {
    const fetchDownloadedLoras = async () => {
      try {
        const response = await axios.get<AiModel[]>(
          `${baseUrl}/ai-models/list-loras`
        );
        const loras = response.data;
        setDownloadedLoras(loras);
      } catch (error) {
        console.error('Error fetching downloaded LoRAs:', error);
        message.error('Failed to fetch downloaded LoRAs.');
      }
    };

    fetchDownloadedLoras();
  }, []);

  const handleLoraSelection = (values: string[]) => {
    setSelectedLoras(values);
  };

  const handleModelChange = (value: string) => {
    const model = downloadedModels.find((m) => m.fileName === value);
    setSelectedLoras([]);
    setSelectedModel(model);
  };

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const response = await axios.get(`${baseUrl}/search`, {
        params: { query },
      });
      const modelsData = response.data.items.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        type: item.type,
        images: item.modelVersions[0]?.images || [],
      }));
      setModels(modelsData || []);
    } catch (error) {
      console.error('Error fetching models:', error);
      message.error('Failed to fetch models.');
    }
    setLoading(false);
  };

  const handleLoadModel = async (model: AiModel) => {
    if (!window.confirm(`Are you sure you want to load this ${model.type}?`))
      return;
    try {
      const response = await axios.post(`${baseUrl}/ai-models/load-model`, {
        modelId: model.id, // Ensure you're sending the correct ID
      });
      message.info(response.data.message);
    } catch (error: any) {
      console.error(`Error loading ${model.type}:`, error);
      message.error(
        `Failed to load the ${model.type}. ${error.response?.data?.error || ''}`
      );
    }
  };

  const handleGenerateImage = async () => {
    if (!prompt || !selectedModel) {
      message.error('Please enter a prompt and select a model.');
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(`${baseUrl}/generate-image`, {
        prompt,
        loras: selectedLoras, // These are fileNames
        model: selectedModel.fileName, // This is the fileName of the selected model
      });
      setGeneratedImage(`data:image/png;base64,${response.data.image}`);
    } catch (error: any) {
      console.error('Error generating image:', error);
      message.error(
        `Failed to generate image. ${error.response?.data?.error || ''}`
      );
    }
    setLoading(false);
  };

  const filteredModels = models.filter((model) => {
    if (modelTypeFilter === 'All') return true;
    return model.type === modelTypeFilter;
  });

  const showModelDetails = (model: AiModel) => {
    setSelectedModelDetails(model);
    setIsModalVisible(true);
  };

  const handleModalOk = () => {
    setIsModalVisible(false);
    setSelectedModelDetails(null);
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    setSelectedModelDetails(null);
  };

  return (
    <Layout>
      <Content style={{ padding: '20px' }}>
        {/* Search and Filters */}
        <div style={{ marginBottom: '20px' }}>
          <Select
            defaultValue='All'
            style={{ width: 150, marginRight: '10px' }}
            onChange={(value) => setModelTypeFilter(value)}
          >
            <Option value='All'>All Types</Option>
            <Option value='Checkpoint'>Checkpoint</Option>
            <Option value='LORA'>LORA</Option>
            <Option value='TextualInversion'>Embedding</Option>
            {/* Add other types as needed */}
          </Select>
          <Search
            placeholder='Search for models or LoRAs'
            onSearch={handleSearch}
            enterButton
            style={{ width: 400 }}
            loading={loading}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Models Grid */}
        <Spin spinning={loading}>
          <List
            grid={{ gutter: 16, column: 4 }}
            dataSource={filteredModels}
            renderItem={(model) => (
              <List.Item>
                <Card
                  hoverable
                  cover={
                    model.images.length > 0 ? (
                      <Image
                        src={model.images[0].url}
                        alt={model.name}
                        height={200}
                        style={{ objectFit: 'cover' }}
                      />
                    ) : null
                  }
                  onClick={() => showModelDetails(model)}
                >
                  <Card.Meta
                    title={model.name}
                    description={<Text type='secondary'>{model.type}</Text>}
                  />
                </Card>
              </List.Item>
            )}
          />
        </Spin>

        {/* Model Details Modal */}
        <Modal
          visible={isModalVisible}
          title={selectedModelDetails?.name}
          onOk={handleModalOk}
          onCancel={handleModalCancel}
          footer={[
            <Button key='back' onClick={handleModalCancel}>
              Close
            </Button>,
            <Button
              key='load'
              type='primary'
              onClick={() => handleLoadModel(selectedModelDetails!)}
            >
              Load {selectedModelDetails?.type}
            </Button>,
          ]}
        >
          <p>Type: {selectedModelDetails?.type}</p>
          <div
            dangerouslySetInnerHTML={{
              __html: selectedModelDetails?.description || '',
            }}
          />
        </Modal>

        {/* Downloaded Models Selection */}
        <div style={{ marginTop: '40px' }}>
          <Title level={2}>Select a Model</Title>
          <Select
            style={{ width: 300 }}
            value={selectedModel?.fileName}
            onChange={handleModelChange}
          >
            {downloadedModels.map((model) => (
              <Option key={model.fileName} value={model.fileName}>
                {model.name}
              </Option>
            ))}
          </Select>
        </div>

        {/* LORA Selection */}
        {selectedModel ? (
          <div style={{ marginTop: '20px' }}>
            <Title level={2}>Select LoRAs to Include</Title>
            <Select
              mode='multiple'
              style={{ width: '100%' }}
              placeholder='Select LoRAs'
              value={selectedLoras}
              onChange={handleLoraSelection}
            >
              {downloadedLoras
                .filter((lora) => lora.baseModel === selectedModel.baseModel)
                .map((lora) => (
                  <Option key={lora.fileName} value={lora.fileName}>
                    {lora.name}
                  </Option>
                ))}
            </Select>
          </div>
        ) : null}

        {/* Text-to-Image Generation Section */}
        <div style={{ marginTop: '40px' }}>
          <Title level={2}>Generate Image from Text Prompt</Title>
          <Input.Search
            placeholder='Enter your prompt'
            enterButton='Generate Image'
            size='large'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onSearch={handleGenerateImage}
            loading={loading}
          />
        </div>

        {/* Display Generated Image */}
        {generatedImage && (
          <div style={{ marginTop: '20px' }}>
            <Title level={3}>Generated Image:</Title>
            <img
              src={generatedImage}
              alt='Generated'
              style={{ maxWidth: '100%' }}
            />
          </div>
        )}
      </Content>
    </Layout>
  );
};

export default ModelManagerPage;
