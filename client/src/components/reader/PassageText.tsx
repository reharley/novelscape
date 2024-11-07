import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Button, InputNumber, Space, Tooltip, Typography } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { Profile, UserSettings, WordTimestamp } from '../../utils/types';

const { Paragraph, Text } = Typography;

interface PassageTextProps {
  text: string;
  audioUrl?: string;
  wordTimestamps: WordTimestamp[];
  onComplete: () => void;
  userSettings?: UserSettings;
  speaker?: Profile | null;
}

const PassageText: React.FC<PassageTextProps> = ({
  text,
  audioUrl,
  wordTimestamps,
  onComplete,
  speaker,
  userSettings,
}) => {
  const { autoPlay, wpm: initialWpm, ttsAi } = userSettings ?? {};
  const [wpm, setWpm] = useState(initialWpm || 150);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay ?? false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Function to play or pause the audio
  const togglePlayPause = (e: any) => {
    e.stopPropagation();
    if (!audioUrl) return;
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Reset currentWordIndex and manage playback
  useEffect(() => {
    if (!ttsAi) return; // Check ttsAi flag
    setCurrentWordIndex(0);
    if (autoPlay && audioRef.current) {
      audioRef.current.play().catch((error) => {
        console.error('Error playing audio:', error);
      });
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [audioUrl, autoPlay, ttsAi]);

  // Update currentWordIndex based on audio playback time
  useEffect(() => {
    if (!ttsAi) return; // Check ttsAi flag
    const audio = audioRef.current;
    if (!audio || wordTimestamps.length === 0) return;

    const handleTimeUpdate = () => {
      const currentTime = audio.currentTime;
      const currentWord = wordTimestamps.find(
        (wt) => currentTime >= wt.startTime && currentTime < wt.endTime
      );
      if (currentWord) {
        const index = wordTimestamps.indexOf(currentWord);
        if (index !== currentWordIndex) {
          setCurrentWordIndex(index);
        }
      } else if (
        currentTime >= wordTimestamps[wordTimestamps.length - 1].endTime
      ) {
        setCurrentWordIndex(wordTimestamps.length); // All words completed
        onComplete();
      }
    };

    if (isPlaying) {
      audio.addEventListener('timeupdate', handleTimeUpdate);
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [
    audioUrl,
    wordTimestamps,
    isPlaying,
    currentWordIndex,
    onComplete,
    ttsAi,
  ]);

  return (
    <Space direction='vertical'>
      <Paragraph>{text}</Paragraph>

      {audioUrl && (
        <Space style={{ marginBottom: '10px' }}>
          <Tooltip title='Adjust speed of autoplay in words per minute (wpm)'>
            <Button
              size='small'
              onClick={() => setWpm((prev) => Math.max(prev - 5, 50))}
            >
              -
            </Button>
            <InputNumber
              min={50}
              max={400}
              size='small'
              value={wpm}
              onChange={(value) => setWpm(value || 150)}
              style={{ width: '60px' }}
            />
            <Button
              size='small'
              onClick={() => setWpm((prev) => Math.min(prev + 5, 400))}
            >
              +
            </Button>
            <Text>WPM</Text>
          </Tooltip>
          {ttsAi && (
            <Button onClick={togglePlayPause}>
              {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}{' '}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
          )}
        </Space>
      )}

      <audio
        ref={audioRef}
        src={audioUrl}
        onEnded={onComplete}
        key={audioUrl}
      />
    </Space>
  );
};

export default PassageText;
