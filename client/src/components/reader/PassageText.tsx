import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import {
  Button,
  Image,
  InputNumber,
  Space,
  Spin,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isNumber } from '../../utils/general';
import { Profile, UserSettings, WordTimestamp } from '../../utils/types';

const { Paragraph, Text } = Typography;

interface PassageTextProps {
  text: string;
  audioUrl?: string;
  wordTimestamps?: WordTimestamp[];
  onComplete: () => void;
  userSettings?: UserSettings;
  speaker?: Profile | null;
  ttsEnabled: boolean;
  setTtsEnabled: (value: boolean) => void;
}

const PassageText: React.FC<PassageTextProps> = ({
  text,
  audioUrl,
  wordTimestamps = [],
  onComplete,
  speaker,
  userSettings,
  ttsEnabled,
  setTtsEnabled,
}) => {
  const { autoPlay, wpm: initialWpm, ttsAi } = userSettings ?? {};
  const [wpm, setWpm] = useState(initialWpm || 150);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  const tokenObjects = useMemo(() => {
    const tokens = text.match(/\s+|[\w’']+|[—–-]|[^\w\s]/g) || [];
    const tokenObjects = tokens.map((token) => {
      const isWord = /[\w’']+/.test(token);
      return { text: token, isWord };
    });
    return tokenObjects;
  }, [text]);

  const wordIndices = tokenObjects.reduce((arr, token, index) => {
    if (token.isWord) arr.push(index);
    return arr;
  }, [] as number[]);

  // Function to normalize words (remove punctuation and convert to lowercase)

  // Map wordTimestamps to token indices
  const wordTokenIndices = useMemo(getWordTokenIndices, [
    tokenObjects,
    wordTimestamps,
    ttsEnabled,
  ]);
  function getWordTokenIndices() {
    if (ttsEnabled && wordTimestamps.length > 0) {
      const indices: number[] = [];
      let wordIndex = 0;

      for (let tokenIndex = 0; tokenIndex < tokenObjects.length; tokenIndex++) {
        const token = tokenObjects[tokenIndex];
        if (token.isWord && wordIndex < wordTimestamps.length) {
          const tokenText = token.text;
          const wordText = wordTimestamps[wordIndex].word.match(
            /\s+|[\w’']+|[—–-]|[^\w\s]/g
          );
          if (wordText?.includes(tokenText) && !indices.includes(tokenIndex)) {
            indices.push(tokenIndex);
            wordIndex++;
          }
        }
      }
      return indices;
    } else {
      return [];
    }
  }

  // State for autoPlay functionality
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isPaused, setIsPaused] = useState(true); // Initially paused

  // State for ttsAi functionality
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false); // Initially not playing

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Function to request a wake lock
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Wake Lock was released');
        });
        console.log('Wake Lock is active');
      } else {
        console.warn('Wake Lock API is not supported in this browser.');
      }
    } catch (err: any) {
      console.error(`${err.name}, ${err.message}`);
    }
  };

  // Function to release the wake lock
  const releaseWakeLock = async () => {
    if (wakeLockRef.current !== null) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log('Wake Lock released');
    }
  };

  // Reset currentWordIndex when text changes
  useEffect(() => {
    setCurrentWordIndex(0);
  }, [text]);

  // Handle wake lock for autoPlay and TTS
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        ((ttsEnabled && isPlaying) || (!ttsEnabled && !isPaused))
      ) {
        requestWakeLock();
      } else {
        releaseWakeLock();
      }
    };

    if ((ttsEnabled && isPlaying) || (!ttsEnabled && !isPaused)) {
      handleVisibilityChange();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseWakeLock();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isPlaying, isPaused, ttsEnabled]);

  // AutoPlay functionality when ttsEnabled is false
  useEffect(() => {
    if (ttsEnabled) return; // Skip this effect if ttsEnabled is true

    if (!isPaused) {
      if (currentWordIndex < wordIndices.length && isNumber(wpm)) {
        const interval = (60 * 1000) / wpm; // milliseconds per word

        timerRef.current = setTimeout(() => {
          setCurrentWordIndex((prev) => prev + 1);
        }, interval);
      } else {
        // Full passage presented, wait 0.2 sec then call onComplete
        timerRef.current = setTimeout(() => {
          onComplete();
        }, 200);
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    wpm,
    currentWordIndex,
    isPaused,
    wordIndices.length,
    onComplete,
    ttsEnabled,
  ]);

  // TTS functionality
  useEffect(() => {
    if (!ttsEnabled) return; // Skip if ttsEnabled is false

    const audio = audioRef.current;
    if (!audio || wordTimestamps.length === 0) return;

    if (isPlaying) {
      audio.play().catch((error) => {
        console.error('Error playing audio:', error);
      });
    } else {
      audio.pause();
    }
  }, [audioUrl, isPlaying, ttsEnabled]);

  // Update currentWordIndex based on audio playback time
  useEffect(() => {
    if (!ttsEnabled) return;
    const audio = audioRef.current;
    if (!audio || wordTimestamps.length === 0) return;

    const handleTimeUpdate = () => {
      console.log('Time update');
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
        setCurrentWordIndex(wordIndices.length); // All words completed
        onComplete();
      }
    };

    let timerId: NodeJS.Timeout | null = null;

    if (isPlaying) {
      timerId = setInterval(handleTimeUpdate, 100);
    }

    return () => {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    };
  }, [
    audioUrl,
    wordTimestamps,
    isPlaying,
    currentWordIndex,
    onComplete,
    ttsEnabled,
  ]);

  // Adjust audio playback rate based on wpm
  useEffect(() => {
    if (ttsEnabled && audioRef.current) {
      audioRef.current.playbackRate = wpm / 150; // Assuming 150 wpm is normal speed
    }
  }, [ttsEnabled, wpm]);

  const handleWpmChange = (value: number | null) => {
    if (value !== null) {
      setWpm(value);
    }
  };

  const handleIncreaseWpm = () => {
    setWpm((prev) => (prev ? Math.min(prev + 5, 400) : 55));
  };

  const handleDecreaseWpm = () => {
    setWpm((prev) => (prev ? Math.max(prev - 5, 50) : 50));
  };

  const togglePause = (e: any) => {
    e.stopPropagation();
    if (ttsEnabled) {
      if (!audioUrl) return;
      const audio = audioRef.current;
      if (isPlaying) {
        audio?.pause();
        setIsPlaying(false);
      } else {
        audio?.play();
        setIsPlaying(true);
      }
    } else {
      setIsPaused((prev) => !prev);
    }
  };

  // console.log('currentWordIndex:', currentWordIndex);
  // console.log('wordTokenIndices:', wordTokenIndices);
  // console.log('tokenObjects:', tokenObjects);
  // console.log('wordTimestamps:', wordTimestamps);

  // For highlighting words
  const renderedText = tokenObjects.map((token, index) => {
    let isHighlighted = false;
    if (ttsEnabled && wordTokenIndices.length > 0) {
      const currentTokenIndex = wordTokenIndices[currentWordIndex];
      if (index === currentTokenIndex) {
        isHighlighted = true;
      }
    } else if (!ttsEnabled && !isPaused) {
      isHighlighted = index === wordIndices[currentWordIndex];
    }
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
      {(autoPlay || ttsEnabled) && (
        <Space
          style={{ marginBottom: '10px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            checked={ttsEnabled}
            onChange={(checked) => setTtsEnabled(checked)}
            checkedChildren='TTS AI On'
            unCheckedChildren='TTS AI Off'
          />
          {!ttsEnabled && (
            <Tooltip title='Adjust speed of playback in words per minute (wpm)'>
              <Button size='small' onClick={handleDecreaseWpm}>
                -
              </Button>
              <InputNumber
                min={50}
                max={400}
                size='small'
                value={wpm}
                onChange={handleWpmChange}
                style={{ width: '60px' }}
              />
              <Button size='small' onClick={handleIncreaseWpm}>
                +
              </Button>
              <Text>WPM</Text>
            </Tooltip>
          )}
          <Button onClick={togglePause}>
            {(ttsEnabled && isPlaying) || (!ttsEnabled && !isPaused) ? (
              <PauseCircleOutlined />
            ) : (
              <PlayCircleOutlined />
            )}{' '}
            {ttsEnabled ? 'Play TTS' : 'Auto-Play'}
          </Button>
        </Space>
      )}

      {/* Audio Element for TTS */}
      {ttsEnabled && audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={onComplete}
          key={audioUrl}
        />
      )}
    </Space>
  );
};

export default PassageText;
