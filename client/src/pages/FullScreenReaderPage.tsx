import {
  Button,
  Image,
  message,
  Progress,
  Select,
  Space,
  Spin,
  Typography,
} from 'antd';
import axios from 'axios';
import html2canvas from 'html2canvas';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GenerateImagesModal from '../components/reader/GenerateImagesModal';
import ModelPreview from '../components/reader/ModelPreview';
import ModelSelectionModal from '../components/reader/ModelSelectionModal';
import { apiUrl } from '../utils/general';
import { AiModel, ModelImage, Passage, Profile } from '../utils/types';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select; // Destructure Option from Select

interface Chapter {
  id: number;
  title: string;
  order: number;
}

const FullScreenReaderPage: React.FC = () => {
  const { bookId, chapterId, passageIndex } = useParams<{
    bookId: string;
    chapterId: string;
    passageIndex: string;
  }>();
  const navigate = useNavigate();

  // State variables
  const [passages, setPassages] = useState<Passage[]>([]);
  const [currentPassageIndex, setCurrentPassageIndex] = useState<number>(0);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState<boolean>(false);
  const [loadingPassages, setLoadingPassages] = useState<boolean>(false);
  const [processingModalVisible, setProcessingModalVisible] = useState(false);

  // State variables for chapters
  const [chapters, setChapters] = useState<Chapter[]>([]);
  // New state variables for modal and preview
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isModelModalVisible, setIsModelModalVisible] =
    useState<boolean>(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState<boolean>(false);
  const [previewModel, setPreviewModel] = useState<AiModel | null>(null);

  const [loadingProfileImages, setLoadingProfileImages] =
    useState<boolean>(false);
  // Handler for opening the modal
  const handleGenerateImages = (
    event?: React.MouseEvent<HTMLElement, MouseEvent>
  ) => {
    event?.stopPropagation();
    setProcessingModalVisible(true);
  };

  // New state variable for force regenerate checkbox
  const [forceRegenerate, setForceRegenerate] = useState<boolean>(false);

  // New state for scene passage ranges
  const [scenePassageRanges, setScenePassageRanges] = useState<{
    [sceneOrder: number]: { start: number; end: number };
  }>({});

  // New state for multiple scenes
  const [numberOfScenes, setNumberOfScenes] = useState<number>(1);
  const [loadingMultipleScenes, setLoadingMultipleScenes] =
    useState<boolean>(false);

  const baseUrl = apiUrl + '/api';

  // Ref for the passage display area
  const passageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bookId) {
      if (chapterId) {
        const chapterIdNum = parseInt(chapterId, 10);
        fetchPassages(bookId, chapterIdNum);
      } else {
        // Fetch last read position
        fetchLastReadPosition(bookId);
      }
    }
  }, [bookId, chapterId]);

  useEffect(() => {
    if (bookId) {
      fetchChapters(bookId);
    }
  }, [bookId]);

  useEffect(() => {
    // Update currentPassageIndex when passageIndex param changes
    if (passageIndex) {
      const index = parseInt(passageIndex, 10);
      setCurrentPassageIndex(index);
    } else {
      setCurrentPassageIndex(0);
    }
  }, [passageIndex]);

  useEffect(() => {
    if (bookId && chapterId) {
      updateLastReadPosition(bookId, chapterId, currentPassageIndex);
    }
  }, [currentPassageIndex]);
  const splitPassage = (passage: Passage): Passage[] => {
    const text = passage.textContent;
    if (text.length <= 280) {
      return [passage];
    }

    const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [text];

    const newPassages: Passage[] = [];
    let currentText = '';
    let splitIndex = 0;

    sentences.forEach((sentence) => {
      const trimmedSentence = sentence.trim();
      if ((currentText + ' ' + trimmedSentence).trim().length <= 280) {
        currentText = (currentText + ' ' + trimmedSentence).trim();
      } else {
        if (currentText.length > 0) {
          newPassages.push({
            ...passage,
            textContent: currentText,
            splitId: `${passage.id}-${splitIndex}`,
          });
          splitIndex++;
        }
        currentText = trimmedSentence;
      }
    });

    if (currentText.length > 0) {
      newPassages.push({
        ...passage,
        textContent: currentText,
        splitId: `${passage.id}-${splitIndex}`,
      });
    }

    return newPassages;
  };

  const fetchLastReadPosition = async (bookId: string) => {
    try {
      const response = await axios.get(
        `${baseUrl}/books/${bookId}/reading-progress`
      );
      const { chapterId, passageIndex } = response.data;

      if (chapterId != null) {
        // Navigate to the last read position
        navigate(`/reader/${bookId}/${chapterId}/${passageIndex || 0}`);
      } else {
        // No last read position, fetch chapters
        fetchChapters(bookId);
      }
    } catch (error) {
      console.error('Error fetching last read position:', error);
      message.error('Failed to fetch last read position.');
      // Default to first chapter
      fetchChapters(bookId);
    }
  };

  const fetchChapters = async (bookId: string) => {
    try {
      const response = await axios.get<Chapter[]>(
        `${baseUrl}/books/${bookId}/chapters`
      );
      const chapters = response.data;
      setChapters(chapters);

      if (chapters.length > 0) {
        const firstChapterId = chapters[0].id;
        // Only navigate if no chapterId is present
        if (!chapterId) {
          navigate(`/reader/${bookId}/${firstChapterId}/0`);
        }
      } else {
        // No chapters, redirect to processing page
        setProcessingModalVisible(true);
      }
    } catch (error) {
      console.error('Error fetching chapters:', error);
      message.error('Failed to fetch chapters.');
      setProcessingModalVisible(true);
    }
  };

  const fetchPassages = (bookId: string, chapterId: number) => {
    setLoadingPassages(true);
    axios
      .get<Passage[]>(
        `${baseUrl}/books/${bookId}/chapters/${chapterId}/passages`
      )
      .then((response) => {
        const fetchedPassages = response.data;
        const processedPassages: Passage[] = [];

        fetchedPassages.forEach((passage) => {
          const splitPassages = splitPassage(passage);
          processedPassages.push(...splitPassages);
        });

        setPassages(processedPassages);
        setBackgroundImage(null);

        // Calculate scene passage ranges
        if (processedPassages.length > 0) {
          const ranges: {
            [sceneOrder: number]: { start: number; end: number };
          } = {};
          let currentSceneOrder: number | undefined = undefined;
          let startIndex = 0;

          processedPassages.forEach((passage, index) => {
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
              index === processedPassages.length - 1 &&
              currentSceneOrder !== undefined
            ) {
              ranges[currentSceneOrder] = {
                start: startIndex,
                end: index,
              };
            }
          });

          setScenePassageRanges(ranges);
        }
      })
      .catch((error) => {
        console.error('Error fetching passages:', error);
        message.error('Failed to fetch passages.');
        // navigate(`/processing/${bookId}`);
      })
      .finally(() => setLoadingPassages(false));
  };

  const updateLastReadPosition = async (
    bookId: string,
    chapterId: string,
    passageIndex: number
  ) => {
    try {
      // await axios.post(`${baseUrl}/books/${bookId}/reading-progress`, {
      //   chapterId: parseInt(chapterId, 10),
      //   passageIndex,
      // });
    } catch (error) {
      console.error('Error updating last read position:', error);
    }
  };

  const handleNextPassage = (
    event?: React.MouseEvent<HTMLElement, MouseEvent>
  ) => {
    event?.stopPropagation();
    if (currentPassageIndex < passages.length - 1) {
      const newIndex = currentPassageIndex + 1;
      setCurrentPassageIndex(newIndex);
      navigate(`/reader/${bookId}/${chapterId}/${newIndex}`);
      setBackgroundImage(null);
    }
  };

  const handlePreviousPassage = (
    event?: React.MouseEvent<HTMLElement, MouseEvent>
  ) => {
    event?.stopPropagation();
    if (currentPassageIndex > 0) {
      const newIndex = currentPassageIndex - 1;
      setCurrentPassageIndex(newIndex);
      navigate(`/reader/${bookId}/${chapterId}/${newIndex}`);
      setBackgroundImage(null);
    }
  };

  const handleNextChapter = (
    event: React.MouseEvent<HTMLElement, MouseEvent>
  ) => {
    event.stopPropagation();
    const currentChapterIndex = chapters.findIndex(
      (chapter) => chapter.id === parseInt(chapterId || '', 10)
    );
    if (currentChapterIndex < chapters.length - 1) {
      const nextChapterId = chapters[currentChapterIndex + 1].id;
      navigate(`/reader/${bookId}/${nextChapterId}/0`);
    } else {
      message.info('This is the last chapter.');
    }
  };

  const handlePreviousChapter = (
    event: React.MouseEvent<HTMLElement, MouseEvent>
  ) => {
    event.stopPropagation();

    const currentChapterIndex = chapters.findIndex(
      (chapter) => chapter.id === parseInt(chapterId || '', 10)
    );
    if (currentChapterIndex > 0) {
      const prevChapterId = chapters[currentChapterIndex - 1].id;
      navigate(`/reader/${bookId}/${prevChapterId}/0`);
    } else {
      message.info('This is the first chapter.');
    }
  };

  // Handler for chapter selection
  const handleChapterSelect = (value: number) => {
    navigate(`/reader/${bookId}/${value}/0`);
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
  const handleDownload = async (
    event: React.MouseEvent<HTMLElement, MouseEvent>
  ) => {
    event.stopPropagation();
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
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `passage_${currentPassageIndex + 1}_${timestamp}.png`;
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

  // Add keydown event listeners for arrow keys
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        handleNextPassage();
      } else if (event.key === 'ArrowLeft') {
        handlePreviousPassage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentPassageIndex]);

  // Handle click on left and right halves
  const handleScreenClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const { clientX } = event;
    const screenWidth = window.innerWidth;
    if (clientX < screenWidth / 2) {
      handlePreviousPassage();
    } else {
      handleNextPassage();
    }
  };

  // Get current chapter index
  const currentChapterIndex = chapters.findIndex(
    (chapter) => chapter.id === parseInt(chapterId || '', 10)
  );
  console.log('chapterId', chapterId);

  console.log('currentPassage:', currentPassage);
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000',
        overflow: 'hidden',
        position: 'relative',
      }}
      onClick={handleScreenClick}
    >
      {/* Generated Content Area */}
      <div
        ref={passageRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
          overflow: 'hidden',
        }}
      >
        {/* Background Image */}
        {currentPassage && currentPassage.scene?.imageUrl && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundImage: `url(${currentPassage.scene.imageUrl})`,
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
        {currentPassage && currentPassage.profiles.length > 0 && (
          <Space
            wrap
            style={{
              position: 'absolute',
              top: '10%', // Adjust vertical position as needed
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              justifyContent: 'space-around',
              // overflowY: 'auto',
              width: '90%',
              zIndex: 3,
            }}
          >
            {currentPassage.profiles
              .filter((p) => p.type.toLowerCase() === 'person')
              .map((profile) => (
                <Space
                  key={profile.id}
                  direction='vertical'
                  style={{ textAlign: 'center' }}
                >
                  <Text style={{ color: '#fff' }}>{profile.name}</Text>
                  <Image
                    src={profile.imageUrl}
                    alt={`${profile.name} Image`}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                    }}
                    style={{
                      width: '150px',
                      margin: '0 10px',
                      borderRadius: '10px',
                      boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                    }}
                    placeholder={<Spin />}
                  />
                </Space>
              ))}
          </Space>
        )}

        {/* Text Box with Passage Text, Chapter Dropdown, and Navigation Buttons */}
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
            zIndex: 4,
          }}
        >
          {/* Chapter Dropdown */}
          <Select
            value={parseInt(chapterId || '', 10)}
            onChange={handleChapterSelect}
            style={{ width: 200, marginBottom: 10 }}
          >
            {chapters.map((chapter) => (
              <Option key={chapter.id} value={chapter.id}>
                {chapter.title || `Chapter ${chapter.order}`}
              </Option>
            ))}
          </Select>
          {currentPassage && (
            <Paragraph style={{ fontSize: '1.2em', margin: 0 }}>
              {currentPassage.textContent}
            </Paragraph>
          )}

          {/* Navigation Buttons inside the text box */}
          <div
            style={{
              marginTop: '20px',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <Button onClick={handleDownload}>Download</Button>
            <Button type='primary' onClick={handleGenerateImages}>
              Generate Images
            </Button>
            <Space>
              <Button
                onClick={handlePreviousChapter}
                disabled={currentChapterIndex === 0}
              >
                Previous Chapter
              </Button>
              <Button
                onClick={handleNextChapter}
                disabled={currentChapterIndex === chapters.length - 1}
              >
                Next Chapter
              </Button>
              <Button
                onClick={handlePreviousPassage}
                disabled={currentPassageIndex === 0}
              >
                Previous
              </Button>
              <Button
                onClick={handleNextPassage}
                type='primary'
                disabled={currentPassageIndex === passages.length - 1}
              >
                Next
              </Button>
            </Space>
          </div>
          <Progress
            percent={readingProgress}
            strokeColor='#1890ff'
            trailColor='#333'
          />
        </div>

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
      {/* Generate Images Modal */}
      <GenerateImagesModal
        visible={processingModalVisible}
        onClose={() => setProcessingModalVisible(false)}
        bookId={bookId || ''}
        chapterId={chapterId || ''}
        onProcessingComplete={() => window.location.reload()}
      />
    </div>
  );
};

export default FullScreenReaderPage;
