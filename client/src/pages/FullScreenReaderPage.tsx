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

import { useMsal } from '@azure/msal-react';
import GenerateImagesModal from '../components/reader/GenerateImagesModal';
import PassageText from '../components/reader/PassageText';
import { apiUrl, isNumber } from '../utils/general';
import { Passage, Profile, UserSettings, WordTimestamp } from '../utils/types';

const { Text } = Typography;
const { Option } = Select;

interface Chapter {
  id: number;
  title: string;
  order: number;
}

interface AudioData {
  audioUrl: string;
  wordTimestamps: WordTimestamp[];
}

const FullScreenReaderPage: React.FC = () => {
  const { bookId, chapterId, passageIndex } = useParams<{
    bookId: string;
    chapterId: string;
    passageIndex: string;
  }>();
  const msalInstance = useMsal();
  const loggedIn = msalInstance.accounts.length > 0;
  const navigate = useNavigate();

  // State variables
  const [passages, setPassages] = useState<Passage[]>([]);
  const [currentPassageIndex, setCurrentPassageIndex] = useState<number>(0);
  const [isPreviewVisible, setIsPreviewVisible] = useState<boolean>(false);
  const [loadingImage, setLoadingImage] = useState<boolean>(false);
  const [loadingPassages, setLoadingPassages] = useState<boolean>(false);
  const [processingModalVisible, setProcessingModalVisible] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>();
  const passageRef = useRef<HTMLDivElement>(null);

  const baseUrl = apiUrl + '/api';

  // New state to store passageId to audioUrl and wordTimestamps mapping
  const [audioMap, setAudioMap] = useState<{ [key: number]: AudioData }>({});

  // Add useRef to track if prefetch is in progress
  const isPrefetchingRef = useRef(false);

  // New state variable for TTS enabled
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(
    userSettings?.ttsAi ?? false
  );

  // Fetch user settings when component mounts
  useEffect(() => {
    const fetchUserSettings = async () => {
      try {
        const response = await axios.get(apiUrl + '/api/user/settings');
        setUserSettings(response.data);
      } catch (error) {
        console.error('Error fetching user settings:', error);
      }
    };
    fetchUserSettings();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!bookId) return;

      if (chapterId) {
        const chapterIdNum = parseInt(chapterId, 10);
        fetchPassages(bookId, chapterIdNum);
      }
      if (passageIndex) {
        const index = parseInt(passageIndex, 10);
        setCurrentPassageIndex(index);
      }
      const [fetchedChapters, lastReadingPosition] = await Promise.all([
        fetchChapters(bookId),
        loggedIn ? fetchLastReadPosition(bookId) : null,
      ]);
      if (!passageIndex) {
        if (lastReadingPosition) {
          navigate(
            `/reader/${bookId}/${lastReadingPosition.chapterId}/${
              lastReadingPosition.passageIndex || 0
            }`
          );
        } else if (fetchedChapters.length > 0) {
          const firstChapterId = chapterId ?? fetchedChapters[0].id;
          navigate(`/reader/${bookId}/${firstChapterId}/0`);
        } else {
          // No chapters, show processing modal
          setProcessingModalVisible(true);
        }
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapterId, passageIndex]);

  // New useEffect for prefetching audio
  useEffect(() => {
    const prefetchAudio = async () => {
      if (!ttsEnabled || passages.length === 0 || isPrefetchingRef.current)
        return;

      const prefetchCount = 4;
      const startIndex = currentPassageIndex + 1;
      const endIndex = Math.min(startIndex + prefetchCount, passages.length);

      const passagesToPrefetch = passages
        .slice(startIndex, endIndex)
        .filter((passage) => passage && !audioMap[passage.id]);

      const passageIds = passagesToPrefetch.map((passage) => passage.id);

      if (passageIds.length > 0) {
        // Set the flag to indicate prefetch is in progress
        isPrefetchingRef.current = true;
        try {
          const response = await axios.post(
            `${baseUrl}/tts/generate-multiple`,
            { passageIds }
          );
          const { audioUrls, wordTimestamps } = response.data;

          // Use functional update to set `audioMap` without needing it in dependencies
          setAudioMap((prev) => {
            const updatedAudioMap = { ...prev };
            passageIds.forEach((id: number) => {
              if (audioUrls[id] && wordTimestamps[id]) {
                updatedAudioMap[id] = {
                  audioUrl: audioUrls[id],
                  wordTimestamps: wordTimestamps[id],
                };
              }
            });
            return updatedAudioMap;
          });
        } catch (error) {
          console.error('Error prefetching audio:', error);
        } finally {
          // Reset the flag after prefetch completes
          isPrefetchingRef.current = false;
        }
      }
    };
    if (userSettings?.ttsAi) {
      prefetchAudio();
    }
  }, [passages, currentPassageIndex, baseUrl, userSettings?.ttsAi, ttsEnabled]); // Removed `audioMap` from dependencies

  // Update passages with audioUrls and wordTimestamps from audioMap
  useEffect(() => {
    if (Object.keys(audioMap).length === 0) return;

    setPassages((prevPassages) =>
      prevPassages.map((passage) =>
        audioMap[passage.id]
          ? {
              ...passage,
              audioUrl: audioMap[passage.id].audioUrl,
              wordTimestamps: audioMap[passage.id].wordTimestamps,
            }
          : passage
      )
    );
  }, [audioMap]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPassageIndex]);

  const splitPassage = (passage: Passage): Passage[] => {
    const maxTextLength = 280;
    const tokens =
      passage.textContent.match(/\s+|[\w’']+|[—–-]|[^\w\s]/g) || [];

    const tokenObjects = tokens.map((token) => {
      const isWord = /[\w’']+/.test(token);
      return { text: token, isWord };
    });

    const totalTextLength = tokenObjects.reduce(
      (sum, token) => sum + token.text.length,
      0
    );

    if (totalTextLength <= maxTextLength) {
      return [passage];
    }

    const wordTimestamps = passage.wordTimestamps || [];

    let passages: Passage[] = [];
    let currentTokens: { text: string; isWord: boolean }[] = [];
    let currentWordTimestamps: WordTimestamp[] = [];
    let currentLength = 0;
    let splitIndex = 0;
    let tokenIndex = 0;
    let wordTimestampIndex = 0;

    while (tokenIndex < tokenObjects.length) {
      const token = tokenObjects[tokenIndex];
      const tokenTextLength = token.text.length;

      if (
        currentLength + tokenTextLength > maxTextLength &&
        currentTokens.length > 0
      ) {
        // Create a new passage
        let textContent = currentTokens.map((t) => t.text).join('');
        if (splitIndex > 0) {
          textContent = '... ' + textContent;
        }
        if (tokenIndex < tokenObjects.length) {
          textContent = textContent + ' ...';
        }
        const newPassage: Passage = {
          ...passage,
          textContent: textContent,
          wordTimestamps: [...currentWordTimestamps],
          splitId: `${passage.id}-${splitIndex}`,
        };
        passages.push(newPassage);

        // Reset for next passage
        currentTokens = [];
        currentWordTimestamps = [];
        currentLength = 0;
        splitIndex++;
      }

      currentTokens.push(token);
      currentLength += tokenTextLength;

      if (token.isWord) {
        // Push corresponding wordTimestamp
        if (wordTimestampIndex < wordTimestamps.length) {
          currentWordTimestamps.push(wordTimestamps[wordTimestampIndex]);
          wordTimestampIndex++;
        } else {
          // console.warn('Word timestamps exhausted before tokens');
        }
      }

      tokenIndex++;
    }

    // Handle the last passage
    if (currentTokens.length > 0) {
      let textContent = currentTokens.map((t) => t.text).join('');
      if (splitIndex > 0) {
        textContent = '... ' + textContent;
      }
      const newPassage: Passage = {
        ...passage,
        textContent: textContent,
        wordTimestamps: [...currentWordTimestamps],
        splitId: `${passage.id}-${splitIndex}`,
      };
      passages.push(newPassage);
    }

    return passages;
  };

  const fetchLastReadPosition = async (bookId: string) => {
    try {
      const response = await axios.get(
        `${baseUrl}/books/${bookId}/reading-progress`
      );
      if (
        isNumber(response.data.chapterId) &&
        isNumber(response.data.passageIndex)
      ) {
        return {
          chapterId: response.data.chapterId,
          passageIndex: response.data.passageIndex,
        };
      }
    } catch (error) {
      console.error('Error fetching last read position:', error);
    }
  };

  const fetchChapters = async (bookId: string): Promise<Chapter[]> => {
    try {
      const response = await axios.get<Chapter[]>(
        `${baseUrl}/books/${bookId}/chapters`
      );
      const chapters = response.data;
      setChapters(chapters);

      if (chapters.length === 0) {
        // No chapters, show processing modal
        setProcessingModalVisible(true);
      }
      return chapters;
    } catch (error) {
      console.error('Error fetching chapters:', error);
      setProcessingModalVisible(true);
      return [];
    }
  };

  const fetchPassages = async (bookId: string, chapterId: number) => {
    setLoadingPassages(true);
    try {
      const response = await axios.get<Passage[]>(
        `${baseUrl}/books/${bookId}/chapters/${chapterId}/passages`
      );
      const fetchedPassages = response.data;

      const processedPassages: Passage[] = [];

      fetchedPassages.forEach((passage) => {
        const splitPassages = splitPassage(passage);
        processedPassages.push(...splitPassages);
      });

      setPassages(processedPassages);
    } catch (error) {
      console.error('Error fetching passages:', error);
    } finally {
      setLoadingPassages(false);
    }
  };

  const updateLastReadPosition = async (
    bookId: string,
    chapterId: string,
    passageIndex: number
  ) => {
    if (loggedIn) {
      try {
        await axios.post(`${baseUrl}/books/${bookId}/reading-progress`, {
          chapterId: parseInt(chapterId, 10),
          passageIndex,
        });
      } catch (error) {
        console.error('Error updating last read position:', error);
      }
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
    } else {
      handleNextChapter();
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
    } else {
      handlePreviousChapter();
    }
  };

  const handleNextChapter = (
    event?: React.MouseEvent<HTMLElement, MouseEvent>
  ) => {
    event?.stopPropagation();
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

  const handlePreviousChapter = async () => {
    const currentChapterIndex = chapters.findIndex(
      (chapter) => chapter.id === parseInt(chapterId || '', 10)
    );

    if (currentChapterIndex > 0) {
      const prevChapterId = chapters[currentChapterIndex - 1].id;

      // Fetch passages for the previous chapter
      try {
        const response = await axios.get<Passage[]>(
          `${baseUrl}/books/${bookId}/chapters/${prevChapterId}/passages`
        );

        const fetchedPassages = response.data;
        const processedPassages: Passage[] = [];

        // Split passages if necessary
        fetchedPassages.forEach((passage) => {
          const splitPassages = splitPassage(passage);
          processedPassages.push(...splitPassages);
        });

        // Navigate to the last passage index of the previous chapter
        const lastIndex = processedPassages.length - 1;
        navigate(`/reader/${bookId}/${prevChapterId}/${lastIndex}`);
      } catch (error) {
        console.error('Error fetching passages for previous chapter:', error);
      }
    } else {
      message.info('This is the first chapter.');
    }
  };
  // Handler for chapter selection
  const handleChapterSelect = (value: number) => {
    navigate(`/reader/${bookId}/${value}/0`);
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
        useCORS: true,
        allowTaint: true,
        logging: true,
        scale: 2,
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
    if (processingModalVisible || isPreviewVisible) return;
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
        onClick={handleScreenClick}
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
              top: '10%',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              justifyContent: 'space-around',
              width: '90%',
              zIndex: 3,
            }}
          >
            {currentPassage.profiles
              .filter(
                (p: Profile) =>
                  p.type?.toLowerCase() === 'person' &&
                  currentPassage.speaker?.id !== p.id
              )
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
                    preview={{
                      onVisibleChange: (visible) => {
                        setIsPreviewVisible(visible);
                      },
                    }}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                    }}
                    style={{
                      width: '161px',
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

        {/* Text Box with PassageText Component, Chapter Dropdown, and Navigation Buttons */}
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
          onClick={handleScreenClick}
        >
          {currentPassage && (
            <PassageText
              text={currentPassage.textContent}
              audioUrl={currentPassage.audioUrl} // Pass audioUrl here
              wordTimestamps={currentPassage.wordTimestamps} // Pass wordTimestamps here
              userSettings={userSettings}
              speaker={currentPassage.speaker}
              ttsEnabled={ttsEnabled}
              setTtsEnabled={setTtsEnabled}
              onComplete={() => {
                handleNextPassage();
              }}
            />
          )}
          {/* Navigation Buttons inside the text box */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <Space wrap>
              {/* Chapter Dropdown */}
              <Select
                value={parseInt(chapterId || '', 10)}
                onClick={(e) => e.stopPropagation()}
                onChange={handleChapterSelect}
                size='small'
                style={{ width: 200 }}
              >
                {chapters.map((chapter) => (
                  <Option key={chapter.id} value={chapter.id}>
                    {chapter.title || `Chapter ${chapter.order}`}
                  </Option>
                ))}
              </Select>

              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/');
                }}
                size='small'
              >
                Library
              </Button>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/user');
                }}
                size='small'
              >
                Settings
              </Button>
              <Button
                type='primary'
                size='small'
                onClick={(e) => {
                  e.stopPropagation();
                  setProcessingModalVisible(true);
                }}
                disabled={!loggedIn}
              >
                Generate Images
              </Button>
              <Button onClick={handleDownload} size='small'>
                Download
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
