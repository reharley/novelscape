import { Button, Modal, Progress, Steps, Typography, message } from 'antd';
import axios from 'axios';
import { EventSourcePolyfill } from 'event-source-polyfill';
import React, { useEffect, useState } from 'react';
import { apiUrl } from '../../utils/general';

const { Text } = Typography;
const { Step } = Steps;

interface ProgressData {
  status: string;
  message?: string;
  phase?: string;
  completed?: number;
  total?: number;
}

interface GenerateImagesModalProps {
  visible: boolean;
  onClose: () => void;
  bookId: string;
  chapterId: string;
}

const GenerateImagesModal: React.FC<GenerateImagesModalProps> = ({
  visible,
  onClose,
  bookId,
  chapterId,
}) => {
  const [currentPhase, setCurrentPhase] = useState<number>(0);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (visible) {
      startGeneratingImages();
    }
    // Cleanup on modal close
    return () => {
      setCurrentPhase(0);
      setProgress(null);
      setGenerating(false);
    };
  }, [visible]);

  const startGeneratingImages = async () => {
    setGenerating(true);
    setProgress(null);

    try {
      const eventSource = new EventSourcePolyfill(
        `${apiUrl}/api/books/${chapterId}/generate-chapter-images/progress`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
        }
      );

      eventSource.onmessage = (event) => {
        const data: ProgressData = JSON.parse(event.data);
        setProgress(data);

        if (data.status === 'phase') {
          const phaseNumber = getPhaseNumber(data.phase);
          setCurrentPhase(phaseNumber - 1);
        }

        if (data.status === 'phase_completed') {
          const phaseNumber = getPhaseNumber(data.phase);
          setCurrentPhase(phaseNumber);
        }

        if (data.status === 'completed') {
          message.success(data.message || 'Image generation completed.');
          eventSource.close();
          setGenerating(false);
        } else if (data.status === 'error') {
          message.error(data.message || 'Error during image generation.');
          eventSource.close();
          setGenerating(false);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource failed:', err);
        message.error('Connection to progress stream failed.');
        eventSource.close();
        setGenerating(false);
      };

      // Trigger image generation
      await axios.get(
        `${apiUrl}/api/books/${chapterId}/generate-chapter-images`
      );
    } catch (error) {
      message.error('Error starting image generation.');
      setGenerating(false);
    }
  };

  const getPhaseNumber = (phaseName?: string): number => {
    switch (phaseName) {
      case 'Phase 1':
      case 'Phase 1: Generating Images...':
        return 1;
      case 'Phase 2':
      case 'Phase 2: Finalizing Images...':
        return 2;
      default:
        return 0;
    }
  };

  return (
    <Modal
      visible={visible}
      title='Generating Images'
      onCancel={onClose}
      footer={[
        <Button key='close' onClick={onClose} disabled={generating}>
          Close
        </Button>,
      ]}
    >
      <Steps current={currentPhase}>
        <Step title='Generating Images' />
        <Step title='Finalizing Images' />
      </Steps>

      {generating && progress && (
        <div style={{ marginTop: '20px' }}>
          {progress.status === 'started' && <Text>{progress.message}</Text>}
          {progress.status === 'phase' && (
            <Text>
              {progress.phase}: {progress.message}
            </Text>
          )}
          {progress.status === 'phase_progress' && (
            <div>
              <Text>
                {progress.phase}: {progress.completed}/{progress.total}
              </Text>
              <Progress
                percent={Number(
                  ((progress.completed! / progress.total!) * 100).toFixed(2)
                )}
              />
            </div>
          )}
          {progress.status === 'phase_completed' && (
            <Text type='success'>{progress.message}</Text>
          )}
          {progress.status === 'completed' && (
            <Text type='success'>{progress.message}</Text>
          )}
          {progress.status === 'error' && (
            <Text type='danger'>{progress.message}</Text>
          )}
        </div>
      )}
    </Modal>
  );
};

export default GenerateImagesModal;
