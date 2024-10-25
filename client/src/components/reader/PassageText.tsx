import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Button, InputNumber, Typography } from 'antd';
import React, { useEffect, useRef, useState } from 'react';

const { Paragraph } = Typography;

interface PassageTextProps {
  text: string;
  autoPlay: boolean;
  initialWpm: number;
  onComplete: () => void;
}

const PassageText: React.FC<PassageTextProps> = ({
  text,
  autoPlay,
  initialWpm,
  onComplete,
}) => {
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
      if (currentWordIndex < words.length) {
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

  console.log(words);
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
            backgroundColor:
              index === currentWordIndex && autoPlay ? 'grey' : 'transparent',
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
    <>
      <Paragraph style={{ fontSize: '1.2em', margin: 0 }}>
        {renderedText}
      </Paragraph>

      {autoPlay && (
        <div
          style={{ marginBottom: '10px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <InputNumber
            min={50}
            max={1000}
            size='small'
            value={wpm}
            onChange={handleWpmChange}
            style={{ marginRight: '10px' }}
          />
          <Button size='small' onClick={togglePause}>
            {isPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}{' '}
            Auto-Play
          </Button>
        </div>
      )}
    </>
  );
};

export default PassageText;
