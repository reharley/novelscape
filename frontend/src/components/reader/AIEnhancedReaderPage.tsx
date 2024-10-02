import {
  Button,
  Card,
  Image,
  Layout,
  Progress,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import {
  AiModel,
  Book,
  Chapter,
  ModelImage,
  Passage,
  Profile,
} from '../../utils/types';
import ModelPreview from './ModelPreview';
import ModelSelectionModal from './ModelSelectionModal';
import ProfileCard from './ProfileCard';

const { Content } = Layout;
const { Title, Paragraph, Text } = Typography;
const { Option } = Select;

const AIEnhancedReaderPage: React.FC = () => {
  // Existing state variables
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [currentPassageIndex, setCurrentPassageIndex] = useState<number>(0);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState<boolean>(false);
  const [downloadedModels, setDownloadedModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>();
  const [downloadedLoras, setDownloadedLoras] = useState<AiModel[]>([]);
  const [selectedLoras, setSelectedLoras] = useState<string[]>([]);
  const [loadingPassages, setLoadingPassages] = useState<boolean>(false);
  const [loadingChapters, setLoadingChapters] = useState<boolean>(false);

  // New state variables for modal and preview
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isModelModalVisible, setIsModelModalVisible] =
    useState<boolean>(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState<boolean>(false);
  const [previewModel, setPreviewModel] = useState<AiModel | null>(null);

  const baseUrl = 'http://localhost:5000/api';

  useEffect(() => {
    // Fetch list of books
    axios
      .get<Book[]>(`${baseUrl}/books`)
      .then((response) => setBooks(response.data))
      .catch((error) => console.error('Error fetching books:', error));

    // Fetch downloaded models
    axios
      .get<AiModel[]>(`${baseUrl}/ai-models/list-models`)
      .then((response) => {
        setDownloadedModels(response.data);
      })
      .catch((error) => console.error('Error fetching models:', error));

    // Fetch downloaded LoRAs
    axios
      .get<AiModel[]>(`${baseUrl}/ai-models/list-loras`)
      .then((response) => {
        setDownloadedLoras(response.data);
      })
      .catch((error) => console.error('Error fetching LoRAs:', error));
  }, [baseUrl]);

  const fetchChapters = (bookId: string) => {
    setLoadingChapters(true);
    axios
      .get<Chapter[]>(`${baseUrl}/books/${bookId}/chapters`)
      .then((response) => {
        setChapters(response.data);
        setSelectedChapter(null);
        setPassages([]);
        setCurrentPassageIndex(0);
        setGeneratedImage(null);
      })
      .catch((error) => console.error('Error fetching chapters:', error))
      .finally(() => setLoadingChapters(false));
  };

  const fetchPassages = (bookId: string, chapterId: number) => {
    setLoadingPassages(true);
    axios
      .get<Passage[]>(
        `${baseUrl}/books/${bookId}/chapters/${chapterId}/passages`
      )
      .then((response) => {
        setPassages(response.data);
        setCurrentPassageIndex(0);
        setGeneratedImage(null);
      })
      .catch((error) => console.error('Error fetching passages:', error))
      .finally(() => setLoadingPassages(false));
  };

  const generateImage = async () => {
    const currentPassage = passages[currentPassageIndex];
    const prompt = currentPassage?.textContent || '';
    if (!prompt || !selectedModel) {
      alert('Please select a model and ensure there is passage text.');
      return;
    }

    setLoadingImage(true);

    try {
      const response = await axios.post(`${baseUrl}/generate-image`, {
        prompt,
        loras: selectedLoras,
        model: selectedModel,
      });
      setGeneratedImage(`data:image/png;base64,${response.data.image}`);
    } catch (error: any) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    }

    setLoadingImage(false);
  };

  const handleNextPassage = () => {
    if (currentPassageIndex < passages.length - 1) {
      setCurrentPassageIndex(currentPassageIndex + 1);
      setGeneratedImage(null);
    }
  };

  const handlePreviousPassage = () => {
    if (currentPassageIndex > 0) {
      setCurrentPassageIndex(currentPassageIndex - 1);
      setGeneratedImage(null);
    }
  };

  const handlePassageChange = (passageIndex: number) => {
    setCurrentPassageIndex(passageIndex);
    setGeneratedImage(null);
  };

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
  };

  const handleLoraSelection = (values: string[]) => {
    setSelectedLoras(values);
  };

  const handleChapterChange = (chapterId: number) => {
    setSelectedChapter(chapterId);
    if (selectedBook) {
      fetchPassages(selectedBook.id, chapterId);
    }
  };

  const handleProfileClick = (profile: Profile) => {
    setSelectedProfile(profile);
    setIsModelModalVisible(true);
  };

  // New handler for image selection
  const handleImageSelect = async (image: ModelImage) => {
    if (!selectedProfile) {
      alert('No profile selected.');
      return;
    }

    setIsModelModalVisible(false); // Close the modal

    try {
      const response = await axios.post(`${baseUrl}/profiles/setup-profile`, {
        profileId: selectedProfile.id,
        image,
      });

      message.success(response.data.message || 'Profile setup successfully.');

      // Optionally, update local state with the updated profile
      if (response.data.profile) {
        setSelectedProfile(response.data.profile);
      }

      // Handle model load message if needed
      if (response.data.modelLoad) {
        console.log(response.data.modelLoad.message);
      }
    } catch (error: any) {
      console.error('Error setting up profile:', error);
      message.error(error.response?.data?.error || 'Failed to set up profile.');
    }
  };

  const handleModelSelect = async (model: AiModel) => {
    setIsModelModalVisible(false);
    setPreviewModel(model);
    setIsPreviewVisible(true);

    // Associate the model with the profile in the backend
    await associateModelWithProfile(selectedProfile?.id, model.id);

    // Fetch and store generation data for associated images
    await fetchAndStoreGenerationDataForModel(model.id);
  };

  const associateModelWithProfile = async (
    profileId: number | undefined,
    modelId: number
  ) => {
    if (!profileId) return;
    try {
      await axios.post(`${baseUrl}/profiles/${profileId}/associate-lora`, {
        loraId: modelId,
      });
      message.success('Model associated with profile successfully.');
    } catch (error: any) {
      console.error('Error associating model with profile:', error);
      message.error(
        error.response?.data?.error || 'Failed to associate model with profile.'
      );
    }
  };

  const fetchAndStoreGenerationDataForModel = async (modelId: number) => {
    try {
      // Fetch all images associated with the AiModel
      const imagesResponse = await axios.get<ModelImage[]>(
        `${baseUrl}/ai-models/${modelId}/images`
      );
      const images = imagesResponse.data;

      if (images.length === 0) {
        message.info('No images found for this model.');
        return;
      }

      // For each image, trigger fetching and storing generation data
      const fetchPromises = images.map((image) =>
        axios.post(`${baseUrl}/getGenerationData`, { imageId: image.id })
      );

      await Promise.all(fetchPromises);

      console.log('Generation data fetched and stored for all model images.');
      message.success('Generation data fetched for all images.');
    } catch (error: any) {
      console.error(
        'Error fetching and storing generation data for model:',
        error.message || error
      );
      message.error('Failed to fetch and store generation data for the model.');
    }
  };

  const handlePreviewClose = () => {
    setIsPreviewVisible(false);
    setPreviewModel(null);
  };

  const currentPassage = passages[currentPassageIndex];
  const readingProgress = passages.length
    ? Math.round(((currentPassageIndex + 1) / passages.length) * 100)
    : 0;

  return (
    <Layout>
      <Content style={{ padding: '50px' }}>
        {/* Book Selection */}
        <Select
          placeholder='Select a book'
          style={{ width: 300, marginBottom: '20px' }}
          onChange={(value: string) => {
            const book = books.find((b) => b.id === value) || null;
            setSelectedBook(book);
            if (book) {
              fetchChapters(book.id);
            }
          }}
          value={selectedBook?.id || undefined}
        >
          {books.map((book) => (
            <Option key={book.id} value={book.id}>
              {book.title}
            </Option>
          ))}
        </Select>

        {selectedBook && (
          <>
            <Title level={3}>Current Book: {selectedBook.title}</Title>

            {/* Chapter Selection */}
            <div style={{ marginBottom: '20px' }}>
              <Title level={4}>Select a Chapter</Title>
              {loadingChapters ? (
                <Spin />
              ) : (
                <Select
                  placeholder='Select a chapter'
                  style={{ width: 300 }}
                  onChange={(value: number) => handleChapterChange(value)}
                  value={selectedChapter || undefined}
                >
                  {chapters.map((chapter) => (
                    <Option key={chapter.id} value={chapter.id}>
                      {`Chapter ${chapter.order + 1}: ${chapter.title}`}
                    </Option>
                  ))}
                </Select>
              )}
            </div>

            {/* Model Selection */}
            <div style={{ marginBottom: '20px' }}>
              <Title level={4}>Select a Model</Title>
              <Select
                style={{ width: 300 }}
                value={selectedModel}
                onChange={handleModelChange}
                placeholder='Select an AI Model'
              >
                {downloadedModels.map((model) => (
                  <Option key={model.id} value={model.id.toString()}>
                    {model.name}
                  </Option>
                ))}
              </Select>
            </div>

            {/* LORA Selection */}
            <div style={{ marginBottom: '20px' }}>
              <Title level={4}>Select LoRAs to Include</Title>
              <Select
                mode='multiple'
                style={{ width: '100%' }}
                placeholder='Select LoRAs'
                value={selectedLoras}
                onChange={handleLoraSelection}
              >
                {downloadedLoras.map((lora) => (
                  <Option key={lora.id} value={lora.id.toString()}>
                    {lora.name}
                  </Option>
                ))}
              </Select>
            </div>

            {/* Model Selection Modal */}
            <ModelSelectionModal
              visible={isModelModalVisible}
              onCancel={() => setIsModelModalVisible(false)}
              onSelectImage={handleImageSelect} // Updated handler
              profileId={selectedProfile?.id || 0}
            />

            {/* Model Preview Modal */}
            {previewModel && (
              <ModelPreview
                visible={isPreviewVisible}
                onClose={handlePreviewClose}
                model={previewModel}
              />
            )}

            {/* Passages Section */}
            {selectedChapter && (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <Title level={4}>
                    Passage {currentPassageIndex + 1} of {passages.length}
                  </Title>
                  {loadingPassages ? (
                    <Spin />
                  ) : passages.length > 0 ? (
                    <Select
                      value={currentPassageIndex}
                      onChange={(value: number) => handlePassageChange(value)}
                      style={{ width: 200 }}
                    >
                      {passages.map((passage, index) => (
                        <Option key={passage.id} value={index}>
                          Passage {index + 1}
                        </Option>
                      ))}
                    </Select>
                  ) : (
                    <Paragraph>
                      No passages available in this chapter.
                    </Paragraph>
                  )}
                </div>

                {/* Generated Image */}
                {loadingImage ? (
                  <Spin size='large' />
                ) : generatedImage ? (
                  <div style={{ marginBottom: '20px' }}>
                    <Image
                      src={generatedImage}
                      alt='Generated'
                      style={{ maxWidth: '100%' }}
                    />
                  </div>
                ) : null}

                {/* Current Passage */}
                {currentPassage ? (
                  <Card style={{ marginBottom: '20px' }}>
                    <Paragraph>{currentPassage.textContent}</Paragraph>
                    {currentPassage.profiles.length > 0 && (
                      <div style={{ marginTop: '20px' }}>
                        <Title level={5}>Relevant Profiles</Title>
                        <Space wrap>
                          {currentPassage.profiles.map((profile) => (
                            <ProfileCard
                              key={profile.id}
                              profile={profile}
                              onClick={handleProfileClick}
                            />
                          ))}
                        </Space>
                      </div>
                    )}
                  </Card>
                ) : (
                  <Paragraph>No content available for this passage.</Paragraph>
                )}

                {/* Navigation and Generate Button */}
                <Space>
                  <Button
                    onClick={handlePreviousPassage}
                    disabled={currentPassageIndex === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={handleNextPassage}
                    disabled={currentPassageIndex === passages.length - 1}
                  >
                    Next
                  </Button>
                  <Button
                    type='primary'
                    onClick={generateImage}
                    disabled={!currentPassage || !selectedModel}
                  >
                    Generate Image
                  </Button>
                </Space>

                {/* Reading Progress */}
                <div style={{ marginTop: '20px' }}>
                  <Title level={5}>Reading Progress</Title>
                  <Progress percent={readingProgress} />
                </div>
              </>
            )}
          </>
        )}
      </Content>
    </Layout>
  );
};

export default AIEnhancedReaderPage;
