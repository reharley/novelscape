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
  const [isPaused, setIsPaused] = useState(false);
  console.log(words);
  // Reset currentWordIndex when text changes
  useEffect(() => {
    setCurrentWordIndex(0);
  }, [text]);

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

  const handleWpmChange = (value: number | null) => {
    if (value) {
      setWpm(value);
    }
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

  // Construct the passage with highlighted current word
  const renderedText = words.map((word, index) => {
    return (
      <>
        <span
          key={index}
          style={{
            backgroundColor:
              index === currentWordIndex ? 'grey' : 'transparent',
            borderRadius: '5px',
            padding: index === currentWordIndex ? '2px' : undefined,
          }}
        >
          {word}
        </span>{' '}
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
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      )}
    </>
  );
};

export default PassageText;
