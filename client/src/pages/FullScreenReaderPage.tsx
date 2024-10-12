import {
  Button,
  Image,
  message,
  Progress,
  Space,
  Spin,
  Typography,
} from 'antd';
import axios from 'axios';
import html2canvas from 'html2canvas';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ModelPreview from '../components/reader/ModelPreview';
import ModelSelectionModal from '../components/reader/ModelSelectionModal';
import { apiUrl } from '../utils/general';
import { AiModel, ModelImage, Passage, Profile } from '../utils/types';

const { Title, Text, Paragraph } = Typography;

const AIEnhancedReaderPage: React.FC = () => {
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

  // New state variables for modal and preview
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isModelModalVisible, setIsModelModalVisible] =
    useState<boolean>(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState<boolean>(false);
  const [previewModel, setPreviewModel] = useState<AiModel | null>(null);

  const [loadingProfileImages, setLoadingProfileImages] =
    useState<boolean>(false);

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
    if (bookId && chapterId) {
      const chapterIdNum = parseInt(chapterId, 10);
      fetchPassages(bookId, chapterIdNum);
    }
  }, [bookId, chapterId]);

  useEffect(() => {
    // Update currentPassageIndex when passageIndex param changes
    if (passageIndex) {
      const index = parseInt(passageIndex, 10);
      setCurrentPassageIndex(index);
    } else {
      setCurrentPassageIndex(0);
    }
  }, [passageIndex]);

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
      })
      .finally(() => setLoadingPassages(false));
  };

  const generateImagesForPassage = async () => {
    if (!bookId || !chapterId) {
      message.error('Book ID or Chapter ID is missing.');
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
      fetchPassages(bookId, parseInt(chapterId, 10));

      message.success('Images generated and updated successfully.');
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

  const generateImagesForScene = async (sceneId: number) => {
    setLoadingImage(true);
    try {
      const response = await axios.post(
        `${baseUrl}/generate-image/scenes/${sceneId}/generate-images`,
        {
          forceRegenerate,
        }
      );
      const { images } = response.data as {
        sceneId: number;
        images: {
          profileId: number;
          profileName: string;
          image: string | null;
          error?: string;
        }[];
      };
      if (bookId && chapterId) fetchPassages(bookId, parseInt(chapterId, 10));

      message.success(
        'Images generated and updated successfully for the scene.'
      );
    } catch (error: any) {
      console.error('Error generating images for scene:', error);
      message.error(
        error.response?.data?.error ||
          'Failed to generate images for the scene.'
      );
    } finally {
      setLoadingImage(false);
    }
  };

  const generateImagesForMultipleScenes = async () => {
    if (!bookId || !chapterId) {
      message.error('Book ID or Chapter ID is missing.');
      return;
    }

    const currentPassage = passages[currentPassageIndex];
    if (!currentPassage || !currentPassage.scene) {
      message.error('No scene associated with the current passage.');
      return;
    }

    setLoadingMultipleScenes(true);

    try {
      const response = await axios.post(
        `${baseUrl}/generate-image/scenes/generate-images`,
        {
          startSceneId: currentPassage.scene.id,
          numberOfScenes: numberOfScenes,
          forceRegenerate,
        }
      );
      const { successScenes, failedScenes } = response.data as {
        successScenes: number[];
        failedScenes: { sceneId: number; error: string }[];
      };

      if (successScenes.length > 0) {
        message.success(
          `Images generated successfully for scenes: ${successScenes.join(
            ', '
          )}.`
        );
      }

      if (failedScenes.length > 0) {
        failedScenes.forEach((fail) =>
          message.error(
            `Failed to generate images for scene ${fail.sceneId}: ${fail.error}`
          )
        );
      }

      // Fetch the updated passages to get the new image URLs
      if (bookId && chapterId) {
        fetchPassages(bookId, parseInt(chapterId, 10));
      }
    } catch (error: any) {
      console.error('Error generating images for multiple scenes:', error);
      message.error(
        error.response?.data?.error ||
          'Failed to generate images for multiple scenes.'
      );
    } finally {
      setLoadingMultipleScenes(false);
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

        {/* Text Box with Passage Text and Next/Previous Buttons */}
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
              zIndex: 4,
            }}
          >
            <Paragraph style={{ fontSize: '1.2em', margin: 0 }}>
              {currentPassage.textContent}
            </Paragraph>

            {/* Navigation Buttons inside the text box */}
            <div
              style={{
                marginTop: '20px',
                display: 'flex',
                justifyContent: 'end',
              }}
            >
              <Button onClick={handleDownload}>Download</Button>
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
            </div>
            <Progress
              percent={readingProgress}
              strokeColor='#1890ff'
              trailColor='#333'
            />
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
    </div>
  );
};

export default AIEnhancedReaderPage;
