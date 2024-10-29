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
import { isNumber } from '../../utils/general';
import { Profile, UserSettings } from '../../utils/types';

const { Paragraph, Text } = Typography;

interface PassageTextProps {
  text: string;
  onComplete: () => void;
  userSettings?: UserSettings;

  speaker?: Profile | null;
}

const PassageText: React.FC<PassageTextProps> = ({
  text,
  onComplete,
  speaker,
  userSettings,
}) => {
  const { autoPlay, wpm: initialWpm } = userSettings ?? {};
  const [wpm, setWpm] = useState(initialWpm);
  const words = text.split(/[ \n]+/).filter((word) => word.trim() !== '');
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isPaused, setIsPaused] = useState(true);
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

  // Handle autoPlay and wake lock
  useEffect(() => {
    let isComponentMounted = true;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && autoPlay && !isPaused) {
        requestWakeLock();
      } else {
        releaseWakeLock();
      }
    };

    if (autoPlay && !isPaused) {
      handleVisibilityChange();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseWakeLock();
    }

    return () => {
      isComponentMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [autoPlay, isPaused]);

  useEffect(() => {
    if (autoPlay && !isPaused) {
      if (currentWordIndex < words.length && isNumber(wpm)) {
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
  }, [autoPlay, wpm, currentWordIndex, isPaused, words.length, onComplete]);

  const handleWpmChange = (value: number | null) => {
    if (value) {
      setWpm(value);
    }
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const renderedText = words.map((word, index) => {
    const isFirstWord = index === 0;
    const isLastWord = index === words.length - 1;

    return (
      <>
        <span
          key={index}
          style={{
            textDecoration:
              index === currentWordIndex && autoPlay ? 'underline' : 'none',
            // backgroundColor:
            //   index === currentWordIndex && autoPlay ? 'grey' : 'transparent',
            borderRadius: '5px',
            //   marginLeft: isFirstWord ? undefined : '0.17em',
            //   marginRight: isLastWord ? undefined : '0.17rem',
          }}
        >
          {word + ' '}
        </span>
      </>
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
              //   style={{
              //     width: '161px',
              //     margin: '0 10px',
              //     borderRadius: '10px',
              //     boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
              //   }}
              style={{ borderRadius: '10px', marginRight: '15px' }}
              placeholder={<Spin />}
            />
          </Space>
        )}
        <Paragraph style={{ fontSize: '1.2em', margin: 0 }}>
          {renderedText}
        </Paragraph>
      </Space>

      {autoPlay && (
        <Space
          style={{ marginBottom: '10px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title='Adjust speed of autoplay in words per minute (wpm)'>
            <InputNumber
              min={50}
              max={400}
              size='small'
              value={wpm}
              onChange={handleWpmChange}
              style={{ width: '60px' }}
            />
            <Text>WPM</Text>
          </Tooltip>
          <Button onClick={togglePause}>
            {isPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}{' '}
            Auto-Play
          </Button>
        </Space>
      )}
    </Space>
  );
};

export default PassageText;
