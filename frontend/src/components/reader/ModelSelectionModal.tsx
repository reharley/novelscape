import {
  Button,
  Card,
  Carousel,
  Col,
  Image,
  Input,
  List,
  Modal,
  Row,
  Spin,
  Switch,
  Typography,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { getNsfwLabel } from '../../utils/nsfw'; // Import the utility function
import { AiModel, ModelImage } from '../../utils/types';

const { Text, Title, Paragraph } = Typography;
const { Search } = Input;
const { Meta } = Card;

interface ModelSelectionModalProps {
  visible: boolean;
  onCancel: () => void;
  onSelectImage: (image: ModelImage) => void;
  profileId: number;
}

const ModelSelectionModal: React.FC<ModelSelectionModalProps> = ({
  visible,
  onCancel,
  onSelectImage,
  profileId,
}) => {
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [nsfwEnabled, setNsfwEnabled] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<AiModel | null>(null);
  const [selectedImage, setSelectedImage] = useState<ModelImage | null>(null);
  const [imageCarouselVisible, setImageCarouselVisible] =
    useState<boolean>(false);

  const baseUrl = 'http://localhost:5000/api';
  console.log('selectedModel:', selectedModel);
  console.log('selectedImage:', selectedImage);
  useEffect(() => {
    if (visible) {
      fetchModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, searchQuery, nsfwEnabled]);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${baseUrl}/civitai/models`, {
        params: {
          query: searchQuery,
          nsfw: nsfwEnabled,
          limit: 20, // Adjust as needed
          page: 1, // Implement pagination if necessary
        },
      });
      setModels(response.data.items || []);
    } catch (error) {
      console.error('Error fetching models:', error);
    }
    setLoading(false);
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
  };

  const handleNsfwToggle = (checked: boolean) => {
    setNsfwEnabled(checked);
  };

  const handleModelSelect = (model: AiModel) => {
    setSelectedModel(model);
    setImageCarouselVisible(true);
  };

  const handleImageSelect = (image: ModelImage) => {
    setSelectedImage(image);
  };

  const confirmImageSelection = () => {
    if (selectedImage) {
      onSelectImage(selectedImage);
      setImageCarouselVisible(false);
      setSelectedModel(null);
      setSelectedImage(null);
    } else {
      alert('Please select an image.');
    }
  };

  const handleModalCancel = () => {
    setSelectedModel(null);
    setSelectedImage(null);
    setImageCarouselVisible(false);
    onCancel();
  };

  const selectedImages =
    selectedModel?.modelVersions[0].images.map((i) => ({
      ...i,
      modelId: selectedModel.id,
    })) || [];

  return (
    <Modal
      title='Select a Model Image'
      open={visible}
      onCancel={handleModalCancel}
      footer={null}
      width={1000}
    >
      {!imageCarouselVisible ? (
        <>
          {/* Search and NSFW Toggle */}
          <Row gutter={[16, 16]} style={{ marginBottom: '20px' }}>
            <Col span={16}>
              <Search
                placeholder='Search for models'
                enterButton='Search'
                onSearch={handleSearch}
                allowClear
              />
            </Col>
            <Col
              span={8}
              style={{
                textAlign: 'right',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Text style={{ marginRight: '8px' }}>NSFW Content</Text>
              <Switch checked={nsfwEnabled} onChange={handleNsfwToggle} />
            </Col>
          </Row>

          {/* Models List */}
          {loading ? (
            <Spin tip='Loading models...' />
          ) : (
            <List
              grid={{ gutter: 16, column: 4 }}
              dataSource={models}
              renderItem={(model) => (
                <List.Item>
                  <Card
                    hoverable
                    cover={
                      model.modelVersions &&
                      model.modelVersions[0] &&
                      model.modelVersions[0].images &&
                      model.modelVersions[0].images.length > 0 ? (
                        <Image
                          alt={model.name}
                          src={model.modelVersions[0].images[0].url}
                          height={200}
                          style={{ objectFit: 'cover' }}
                          preview={false}
                        />
                      ) : (
                        <div
                          style={{
                            height: '200px',
                            backgroundColor: '#f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text type='secondary'>No Image Available</Text>
                        </div>
                      )
                    }
                    onClick={() => handleModelSelect(model)}
                  >
                    <Meta
                      title={
                        <Text strong ellipsis={{ tooltip: model.name }}>
                          {model.name}
                        </Text>
                      }
                      description={
                        <Paragraph
                          ellipsis={{
                            rows: 2,
                            expandable: false,
                          }}
                          style={{ marginBottom: 0 }}
                        >
                          {model.description ? (
                            <div
                              dangerouslySetInnerHTML={{
                                __html: model.description,
                              }}
                            />
                          ) : (
                            'No description available.'
                          )}
                        </Paragraph>
                      }
                    />
                  </Card>
                </List.Item>
              )}
            />
          )}
        </>
      ) : (
        <>
          {/* Carousel for Model Images and Full Description */}
          <Row gutter={[16, 16]} style={{ marginBottom: '20px' }}>
            <Col span={24}>
              <Button onClick={() => setImageCarouselVisible(false)}>
                Back to Models
              </Button>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col span={24}>
              {selectedModel &&
              selectedModel.modelVersions[0] &&
              selectedModel.modelVersions[0].images.length > 0 ? (
                <>
                  <Title level={4}>{selectedModel.name}</Title>
                  <Carousel arrows>
                    {selectedImages.map((image) => {
                      const nsfwLabel = getNsfwLabel(image.nsfwLevel);
                      return (
                        <div key={image.id}>
                          <div
                            style={{
                              position: 'relative',
                              textAlign: 'center',
                            }}
                          >
                            <Image
                              src={image.url}
                              alt={`Model Image ${image.id}`}
                              width='100%'
                              height={400}
                              style={{
                                objectFit: 'contain',
                                cursor: 'pointer',
                              }}
                              onClick={() => handleImageSelect(image)}
                              preview={false}
                            />
                            {nsfwLabel && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '10px',
                                  left: '10px',
                                  backgroundColor: 'rgba(255,0,0,0.7)',
                                  color: 'white',
                                  padding: '5px 10px',
                                  borderRadius: '5px',
                                }}
                              >
                                {nsfwLabel}
                              </div>
                            )}
                            {selectedImage?.id === image.id && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: '10px',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  backgroundColor: 'rgba(0,0,0,0.5)',
                                  color: 'white',
                                  padding: '10px 20px',
                                  borderRadius: '5px',
                                }}
                              >
                                Selected
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </Carousel>
                  {/* Confirm Selection Button */}
                  <Row gutter={[16, 16]} style={{ marginTop: '20px' }}>
                    <Col span={24} style={{ textAlign: 'right' }}>
                      <Button
                        type='primary'
                        onClick={confirmImageSelection}
                        disabled={!selectedImage}
                      >
                        Assign as Profile Picture
                      </Button>
                    </Col>
                  </Row>
                  {selectedModel.description ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: selectedModel.description,
                      }}
                    />
                  ) : (
                    'No description available.'
                  )}
                </>
              ) : (
                <Text type='secondary'>
                  No images available for this model.
                </Text>
              )}
            </Col>
          </Row>
        </>
      )}
    </Modal>
  );
};

export default ModelSelectionModal;
