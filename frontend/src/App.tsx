import {
  Button,
  Card,
  Image,
  Input,
  Layout,
  List,
  Menu,
  Modal,
  Select,
  Spin,
  Typography,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';

const { Header, Content, Footer } = Layout;
const { Option } = Select;
const { Search } = Input;
const { Text } = Typography;

interface Model {
  id: number;
  name: string;
  description: string;
  type: string;
  images: { url: string }[];
}

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [modelTypeFilter, setModelTypeFilter] = useState<string>('All');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [downloadedLoras, setDownloadedLoras] = useState<string[]>([]);
  const [selectedLoras, setSelectedLoras] = useState<string[]>([]);
  const [selectedModelDetails, setSelectedModelDetails] =
    useState<Model | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const baseUrl = 'http://localhost:5000';

  useEffect(() => {
    const fetchDownloadedLoras = async () => {
      try {
        const response = await axios.get(baseUrl + '/list-loras');
        const loras = response.data.map((lora: any) => lora.name);
        setDownloadedLoras(loras);
      } catch (error) {
        console.error('Error fetching downloaded LoRas:', error);
      }
    };

    fetchDownloadedLoras();
  }, []);

  useEffect(() => {
    const fetchDownloadedModels = async () => {
      try {
        const response = await axios.get(baseUrl + '/list-models');
        const models = response.data.map((model: any) => model.name);
        setDownloadedModels(models);
        if (models.length > 0) {
          setSelectedModel(models[0]); // Set default selected model
        }
      } catch (error) {
        console.error('Error fetching downloaded models:', error);
      }
    };

    fetchDownloadedModels();
  }, []);

  const handleLoraSelection = (values: string[]) => {
    setSelectedLoras(values);
  };

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const response = await axios.get(baseUrl + '/search', {
        params: { query },
      });
      // Map over the results to include the type field and images
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
      alert('Failed to fetch models.');
    }
    setLoading(false);
  };

  const handleLoadModel = async (modelId: number, modelType: string) => {
    if (!window.confirm(`Are you sure you want to load this ${modelType}?`))
      return;
    try {
      const response = await axios.post(baseUrl + '/load-model', {
        modelId,
      });
      alert(response.data.message);
    } catch (error: any) {
      console.error(`Error loading ${modelType}:`, error);
      alert(
        `Failed to load the ${modelType}. ${error.response?.data?.error || ''}`
      );
    }
  };

  const handleGenerateImage = async () => {
    if (!prompt) return;
    setLoading(true);
    try {
      const response = await axios.post(baseUrl + '/generate-image', {
        prompt,
        loras: selectedLoras,
        model: selectedModel,
      });
      setGeneratedImage(`data:image/png;base64,${response.data.image}`);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image.');
    }
    setLoading(false);
  };

  const filteredModels = models.filter((model) => {
    if (modelTypeFilter === 'All') return true;
    return model.type === modelTypeFilter;
  });

  const showModelDetails = (model: Model) => {
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
    <Layout style={{ minHeight: '100vh' }}>
      <Header>
        <div className='logo' />
        <Menu theme='dark' mode='horizontal'>
          <Menu.Item key='1'>CivitAI Model and LoRA Search</Menu.Item>
        </Menu>
      </Header>
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
            <Option value='LoRA'>LoRA</Option>
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
              onClick={() =>
                handleLoadModel(
                  selectedModelDetails!.id,
                  selectedModelDetails!.type
                )
              }
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
          <h2>Select a Model</h2>
          <Select
            style={{ width: 300 }}
            value={selectedModel}
            onChange={(value) => setSelectedModel(value)}
          >
            {downloadedModels.map((modelName) => (
              <Option key={modelName} value={modelName}>
                {modelName}
              </Option>
            ))}
          </Select>
        </div>

        {/* LoRA Selection */}
        <div style={{ marginTop: '20px' }}>
          <h2>Select LoRAs to Include</h2>
          <Select
            mode='multiple'
            style={{ width: '100%' }}
            placeholder='Select LoRAs'
            value={selectedLoras}
            onChange={handleLoraSelection}
          >
            {downloadedLoras.map((loraName) => (
              <Option key={loraName} value={loraName}>
                {loraName}
              </Option>
            ))}
          </Select>
        </div>

        {/* Text-to-Image Generation Section */}
        <div style={{ marginTop: '40px' }}>
          <h2>Generate Image from Text Prompt</h2>
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
            <h3>Generated Image:</h3>
            <img
              src={generatedImage}
              alt='Generated'
              style={{ maxWidth: '100%' }}
            />
          </div>
        )}
      </Content>
      <Footer style={{ textAlign: 'center' }}>Your Footer Content</Footer>
    </Layout>
  );
};

export default App;
