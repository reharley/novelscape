import { InfoCircleOutlined } from '@ant-design/icons';
import {
  Button,
  Checkbox,
  Collapse,
  Image,
  Layout,
  message,
  Progress,
  Select,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import axios from 'axios';
import html2canvas from 'html2canvas';
import React, { useEffect, useRef, useState } from 'react';
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
const { Title, Paragraph } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

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

  // New state variable for force regenerate checkbox
  const [forceRegenerate, setForceRegenerate] = useState<boolean>(false);

  // New state for scene passage ranges
  const [scenePassageRanges, setScenePassageRanges] = useState<{
    [sceneOrder: number]: { start: number; end: number };
  }>({});

  const baseUrl = 'http://localhost:5000/api';

  // Ref for the passage display area
  const passageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch list of books
    axios
      .get<Book[]>(`${baseUrl}/books`)
      .then((response) => setBooks(response.data))
      .catch((error) => {
        console.error('Error fetching books:', error);
        message.error('Failed to fetch books.');
      });
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
        setScenePassageRanges({}); // Reset scene passage ranges
      })
      .catch((error) => {
        console.error('Error fetching chapters:', error);
        message.error('Failed to fetch chapters.');
      })
      .finally(() => setLoadingChapters(false));
  };

  const fetchPassages = (bookId: string, chapterId: number) => {
    setLoadingPassages(true);
    axios
      .get<Passage[]>(
        `${baseUrl}/books/${bookId}/chapters/${chapterId}/passages`
      )
      .then((response) => {
        console.log('Fetched Passages:', response.data); // Log the fetched passages
        setPassages(response.data);
        setCurrentPassageIndex(0);
        setBackgroundImage(null);
        setProfileImages({}); // Reset profile images when passages change

        // Calculate scene passage ranges
        if (response.data.length > 0) {
          const ranges: {
            [sceneOrder: number]: { start: number; end: number };
          } = {};
          let currentSceneOrder: number | undefined = undefined;
          let startIndex = 0;

          response.data.forEach((passage, index) => {
            const sceneOrder = passage.scene?.order;

            if (sceneOrder !== currentSceneOrder) {
              if (currentSceneOrder !== undefined) {
                // Set the end index for the previous scene
                ranges[currentSceneOrder] = {
                  start: startIndex,
                  end: index - 1,
                };
              }
              // Update to the new scene
              currentSceneOrder = sceneOrder;
              startIndex = index;
            }

            // If it's the last passage, set the end index
            if (
              index === response.data.length - 1 &&
              currentSceneOrder !== undefined
            ) {
              ranges[currentSceneOrder] = { start: startIndex, end: index };
            }
          });

          setScenePassageRanges(ranges);
        }
      })
      .catch((error) => {
        console.error('Error fetching passages:', error);
        message.error('Failed to fetch passages.');
      })
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
        `${baseUrl}/generate-image/passages/${currentPassage.id}/generate-images`,
        {
          forceRegenerate, // Include the flag in the request body
        }
      );
      const { images } = response.data as {
        passageId: number;
        images: {
          profileId: number;
          profileName: string;
          image: string | null;
          error?: string;
        }[];
      };

      // Create a mapping of profileId to image
      const imagesMap: { [profileId: number]: string } = {};
      images.forEach((img) => {
        if (img.image) {
          imagesMap[img.profileId] = `data:image/png;base64,${img.image}`;
        }
      });
      setBackgroundImage(imagesMap[0] || null); // Assuming profileId 0 is the background
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
  const currentPassage =
    passages.length > 0 ? passages[currentPassageIndex] : null;
  const readingProgress = passages.length
    ? Math.round(((currentPassageIndex + 1) / passages.length) * 100)
    : 0;

  // Handler for downloading the passage image
  const handleDownload = async () => {
    if (!passageRef.current) {
      message.error('Passage area not found.');
      return;
    }

    const originalBorderRadius = passageRef.current.style.borderRadius;

    try {
      passageRef.current.style.borderRadius = '0px';

      const canvas = await html2canvas(passageRef.current, {
        useCORS: true, // Enable cross-origin images
        allowTaint: true,
        logging: true,
        scale: 2, // Increase resolution
      });
      const imgData = canvas.toDataURL('image/png');

      // Create a temporary link to trigger the download
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `passage_${currentPassageIndex + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      message.success('Passage image downloaded successfully!');
    } catch (error) {
      console.error('Error generating image:', error);
      message.error('Failed to download passage image.');
    } finally {
      passageRef.current.style.borderRadius = originalBorderRadius;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#1a1a1a' }}>
      <Content
        style={{
          padding: '20px',
          color: '#fff',
        }}
      >
        {/* Book Selection */}
        <div style={{ marginBottom: '20px' }}>
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
              <Title level={3} style={{ color: '#fff' }}>
                Current Book: {selectedBook.title}
              </Title>

              {/* Chapter Selection */}
              <div style={{ marginBottom: '20px' }}>
                <Title level={4} style={{ color: '#fff' }}>
                  Select a Chapter
                </Title>
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

              {/* Collapsible Profile Cards */}
              {currentPassage && currentPassage.profiles.length > 0 && (
                <Collapse accordion style={{ marginBottom: '20px' }} ghost>
                  <Panel header='View Profiles' key='1'>
                    <Space wrap>
                      {currentPassage.profiles.map((profile) => (
                        <ProfileCard
                          key={profile.id}
                          profile={profile}
                          onClick={handleProfileClick}
                        />
                      ))}
                    </Space>
                  </Panel>
                </Collapse>
              )}
            </>
          )}
        </div>

        {/* Passages Section */}
        {selectedChapter && (
          <>
            {/* Reading Progress */}
            <div style={{ marginBottom: '20px' }}>
              <Title level={5} style={{ color: '#fff' }}>
                Reading Progress
              </Title>
              <Progress
                percent={readingProgress}
                strokeColor='#1890ff'
                trailColor='#333'
              />
            </div>

            {/* Passage Selection */}
            <div style={{ marginBottom: '20px' }}>
              <Title level={4} style={{ color: '#fff' }}>
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
                <Paragraph style={{ color: '#fff' }}>
                  No passages available in this chapter.
                </Paragraph>
              )}
            </div>

            {/* Force Regenerate Checkbox */}
            <div
              style={{
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Checkbox
                checked={forceRegenerate}
                onChange={(e) => setForceRegenerate(e.target.checked)}
                style={{ color: '#fff' }}
              >
                Force Regenerate Prompts
              </Checkbox>
              <Tooltip title='Check this box to regenerate the positive and negative prompts even if they already exist.'>
                <InfoCircleOutlined style={{ marginLeft: 8, color: '#fff' }} />
              </Tooltip>
            </div>

            {/* Display Current Scene Number and Passage Range */}
            {currentPassage && currentPassage.scene ? (
              <div style={{ marginBottom: '20px' }}>
                <Title level={4} style={{ color: '#fff' }}>
                  Scene {currentPassage.scene.order}
                </Title>
                {scenePassageRanges[currentPassage.scene.order] && (
                  <Paragraph style={{ color: '#fff' }}>
                    Passages{' '}
                    {scenePassageRanges[currentPassage.scene.order].start + 1} -{' '}
                    {scenePassageRanges[currentPassage.scene.order].end + 1} of{' '}
                    {passages.length}
                  </Paragraph>
                )}
              </div>
            ) : (
              currentPassage && (
                <div style={{ marginBottom: '20px' }}>
                  <Title level={4} style={{ color: '#fff' }}>
                    No Scene Assigned
                  </Title>
                  <Paragraph style={{ color: '#fff' }}>
                    This passage is not assigned to any scene.
                  </Paragraph>
                </div>
              )
            )}

            {/* Navigation and Progress Buttons */}
            <Space style={{ marginBottom: '20px' }}>
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

              {/* Download Button */}
              <Button
                onClick={handleDownload}
                type='default'
                disabled={!backgroundImage}
              >
                Download Passage
              </Button>
            </Space>

            {/* Generated Content Area */}
            <div
              ref={passageRef}
              style={{
                position: 'relative',
                width: '100%',
                height: '500px', // Adjust height as needed
                backgroundColor: '#000',
                borderRadius: '10px',
                overflow: 'hidden',
                marginBottom: '20px',
              }}
            >
              {/* Background Image */}
              {backgroundImage && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url(${backgroundImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    zIndex: 1,
                  }}
                ></div>
              )}

              {/* Overlay to dim the background for better text readability */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 2,
                }}
              ></div>

              {/* Character Images */}
              {profileImages && Object.keys(profileImages).length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '10%', // Adjust vertical position as needed
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    justifyContent: 'space-around',
                    width: '90%',
                    zIndex: 3,
                  }}
                >
                  {currentPassage &&
                    currentPassage.profiles
                      .filter((p) => p.type.toLowerCase() === 'character')
                      .map((profile) => (
                        <Image
                          key={profile.id}
                          src={profileImages[profile.id]}
                          alt={`${profile.name} Image`}
                          style={{
                            width: '350px',
                            margin: '0 10px',
                            borderRadius: '10px',
                            boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                          }}
                          placeholder={<Spin />}
                        />
                      ))}
                </div>
              )}

              {/* Text Box with Passage Text */}
              {currentPassage && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '90%',
                    maxWidth: '800px',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    padding: '20px',
                    borderRadius: '10px',
                    color: '#fff',
                    zIndex: 4,
                  }}
                >
                  <Paragraph style={{ fontSize: '1.2em', margin: 0 }}>
                    {currentPassage.textContent}
                  </Paragraph>
                </div>
              )}

              {/* Loading Spinner */}
              {loadingImage && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 5,
                  }}
                >
                  <Spin size='large' />
                </div>
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
          </>
        )}
      </Content>
    </Layout>
  );
};

export default AIEnhancedReaderPage;
