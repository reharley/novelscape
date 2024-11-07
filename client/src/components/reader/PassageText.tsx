import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import {
  Button,
  Image,
  InputNumber,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
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
  const { autoPlay, wpm: initialWpm } = userSettings ?? {};
  const [wpm, setWpm] = useState(initialWpm || 150);
  const tokens = text.match(/\s+|[\w’']+|[—–-]|[^\w\s]/g) || [];

  const tokenObjects = tokens.map((token) => {
    const isWord = /[\w’']+/.test(token);
    return { text: token, isWord };
  });

  const wordIndices = tokenObjects.reduce((arr, token, index) => {
    if (token.isWord) arr.push(index);
    return arr;
  }, [] as number[]);

  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay ?? false);
  const [wasPlaying, setWasPlaying] = useState(autoPlay ?? false);
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
    setWasPlaying(!isPlaying);
    setIsPlaying(!isPlaying);
  };

  // Reset currentWordIndex and manage playback based on wasPlaying state
  useEffect(() => {
    setCurrentWordIndex(0);
    if (wasPlaying && audioRef.current) {
      audioRef.current.play().catch((error) => {
        console.error('Error playing audio:', error);
      });
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [audioUrl, wasPlaying]);

  // Update currentWordIndex based on audio playback time
  useEffect(() => {
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
  }, [audioUrl, wordTimestamps, isPlaying, currentWordIndex, onComplete]);

  const renderedText = tokenObjects.map((token, index) => {
    const wordIndex = wordIndices.indexOf(index);
    const isHighlighted =
      wordIndex === currentWordIndex && token.isWord && isPlaying;
    return (
      <span
        key={index}
        style={{
          textDecoration: isHighlighted ? 'underline' : 'none',
          borderRadius: '5px',
        }}
      >
        {token.text}
      </span>
    );
  });
  console.log('current speaker', speaker);

  return (
    <Space direction='vertical'>
      <Space>
        {/* Speaker Profile Image */}
        {userSettings?.passageSpeaker && speaker && speaker.imageUrl && (
          <Space
            key={speaker.id}
            direction='vertical'
            style={{ textAlign: 'center' }}
          >
            <Text style={{ color: '#fff' }}>{speaker.name}</Text>
            <Image
              src={speaker.imageUrl}
              alt={`${speaker.name} Image`}
              width={120}
              preview={false}
              style={{ borderRadius: '10px', marginRight: '15px' }}
              placeholder={<Spin />}
            />
          </Space>
        )}
        <Paragraph style={{ fontSize: '1.2em', margin: 0 }}>
          {renderedText}
        </Paragraph>
      </Space>

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
          <Button onClick={togglePlayPause}>
            {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}{' '}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
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
