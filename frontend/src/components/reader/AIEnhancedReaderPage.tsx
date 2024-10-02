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
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState<boolean>(false);
  const [loadingPassages, setLoadingPassages] = useState<boolean>(false);
  const [loadingChapters, setLoadingChapters] = useState<boolean>(false);

  // New state variables for modal and preview
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isModelModalVisible, setIsModelModalVisible] =
    useState<boolean>(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState<boolean>(false);
  const [previewModel, setPreviewModel] = useState<AiModel | null>(null);

  // New state variables for profile images
  const [profileImages, setProfileImages] = useState<{
    [profileId: number]: string;
  }>({});
  const [loadingProfileImages, setLoadingProfileImages] =
    useState<boolean>(false);

  const baseUrl = 'http://localhost:5000/api';

  useEffect(() => {
    // Fetch list of books
    axios
      .get<Book[]>(`${baseUrl}/books`)
      .then((response) => setBooks(response.data))
      .catch((error) => console.error('Error fetching books:', error));
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
        setBackgroundImage(null);
        setProfileImages({}); // Reset profile images when chapters change
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
        setBackgroundImage(null);
        setProfileImages({}); // Reset profile images when passages change
      })
      .catch((error) => console.error('Error fetching passages:', error))
      .finally(() => setLoadingPassages(false));
  };

  const generateImagesForPassage = async () => {
    if (!selectedBook || !selectedChapter) {
      message.error('Please select a book and a chapter first.');
      return;
    }

    const currentPassage = passages[currentPassageIndex];
    if (!currentPassage) {
      message.error('No passage selected.');
      return;
    }

    setLoadingProfileImages(true);
    setLoadingImage(true);

    try {
      const response = await axios.post(
        `${baseUrl}/generate-image/passages/${currentPassage.id}/generate-images`
      );
      const { images } = response.data as {
        passageId: number;
        images: { profileId: number; profileName: string; image: string }[];
      };

      // Create a mapping of profileId to image
      const imagesMap: { [profileId: number]: string } = {};
      images.forEach((img) => {
        imagesMap[img.profileId] = `data:image/png;base64,${img.image}`;
      });
      setBackgroundImage(imagesMap[0]);
      setProfileImages(imagesMap);
      message.success('Images generated successfully for all profiles.');
    } catch (error: any) {
      console.error('Error generating images for passage:', error);
      message.error(
        error.response?.data?.error || 'Failed to generate images for profiles.'
      );
    } finally {
      setLoadingProfileImages(false);
      setLoadingImage(false);
    }
  };

  const handleNextPassage = () => {
    if (currentPassageIndex < passages.length - 1) {
      setCurrentPassageIndex(currentPassageIndex + 1);
      setBackgroundImage(null);
      setProfileImages({}); // Reset profile images when changing passage
    }
  };

  const handlePreviousPassage = () => {
    if (currentPassageIndex > 0) {
      setCurrentPassageIndex(currentPassageIndex - 1);
      setBackgroundImage(null);
      setProfileImages({}); // Reset profile images when changing passage
    }
  };

  const handlePassageChange = (passageIndex: number) => {
    setCurrentPassageIndex(passageIndex);
    setBackgroundImage(null);
    setProfileImages({}); // Reset profile images when changing passage
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
      message.error('No profile selected.');
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

  const handlePreviewClose = () => {
    setIsPreviewVisible(false);
    setPreviewModel(null);
  };

  // Safely access currentPassage
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
                {/* Reading Progress */}
                <div style={{ marginTop: '20px' }}>
                  <Title level={5}>Reading Progress</Title>
                  <Progress percent={readingProgress} />
                </div>

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

                {/* Navigation and Progress */}
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
                    onClick={generateImagesForPassage}
                    disabled={
                      !currentPassage || currentPassage.profiles.length === 0
                    }
                    loading={loadingProfileImages}
                  >
                    Generate Images for Profiles
                  </Button>
                </Space>

                {/* Display Generated Image for Passage */}
                {loadingImage ? (
                  <Spin size='large' />
                ) : backgroundImage ? (
                  <div style={{ marginBottom: '20px' }}>
                    <Image
                      src={backgroundImage}
                      alt='Generated'
                      style={{ maxWidth: '100%' }}
                      placeholder={<Spin />}
                    />
                  </div>
                ) : null}

                {/* Current Passage */}
                {currentPassage ? (
                  <Card style={{ marginBottom: '20px' }}>
                    <Paragraph style={{ fontSize: '30px' }}>
                      {currentPassage.textContent}
                    </Paragraph>
                    {currentPassage.profiles &&
                      currentPassage.profiles.length > 0 && (
                        <div style={{ marginTop: '20px' }}>
                          <Title level={5}>Relevant Profiles</Title>
                          <Space wrap>
                            {currentPassage.profiles.map((profile) => (
                              <div
                                key={profile.id}
                                style={{ textAlign: 'center' }}
                              >
                                <ProfileCard
                                  profile={profile}
                                  onClick={handleProfileClick}
                                />
                                {profileImages[profile.id] ? (
                                  <Image
                                    src={profileImages[profile.id]}
                                    alt={`${profile.name} Image`}
                                    style={{ width: 200, marginTop: '10px' }}
                                    placeholder={<Spin />}
                                  />
                                ) : null}
                              </div>
                            ))}
                          </Space>
                        </div>
                      )}
                  </Card>
                ) : (
                  <Paragraph>No content available for this passage.</Paragraph>
                )}
              </>
            )}
          </>
        )}
      </Content>
    </Layout>
  );
};

export default AIEnhancedReaderPage;
