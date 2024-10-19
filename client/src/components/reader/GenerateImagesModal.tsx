import {
  Button,
  message,
  Modal,
  Progress,
  Select,
  Steps,
  Typography,
} from 'antd';
import axios from 'axios';
import { EventSourcePolyfill } from 'event-source-polyfill';
import React, { useEffect, useState } from 'react';
import { apiUrl } from '../../utils/general';

const { Text, Title } = Typography;
const { Step } = Steps;
const { Option } = Select;

interface ProgressData {
  status: string;
  message?: string;
  phase?: string;
  completed?: number;
  total?: number;
}

interface Chapter {
  id: number;
  order: number;
  title: string;
}

interface GenerateImagesModalProps {
  visible: boolean;
  onClose: () => void;
  bookId: string;
  chapterId: string;
  onProcessingComplete: () => void; // Callback to inform parent component
}

const GenerateImagesModal: React.FC<GenerateImagesModalProps> = ({
  visible,
  onClose,
  bookId,
  chapterId,
  onProcessingComplete,
}) => {
  const [currentPhase, setCurrentPhase] = useState<number>(0);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    chapterId ? parseInt(chapterId) : null
  );

  if (selectedChapterId === null && chapterId) {
    setSelectedChapterId(parseInt(chapterId));
  }
  useEffect(() => {
    if (visible) {
      checkBookProcessingStatus();
    }
    // Cleanup on modal close
    return () => {
      setCurrentPhase(0);
      setProgress(null);
      setProcessing(false);
      setSelectedChapterId(null);
    };
  }, [visible]);

  const checkBookProcessingStatus = async () => {
    if (!bookId) {
      message.error('Book ID is missing.');
      return;
    }
    try {
      // Check if passages and chapters exist
      const passagesResponse = await axios.get(
        `${apiUrl}/api/books/${bookId}/passages`
      );
      const passages = passagesResponse.data;

      const chaptersResponse = await axios.get(
        `${apiUrl}/api/books/${bookId}/chapters`
      );
      const chaptersData = chaptersResponse.data;

      if (passages.length > 0 && chaptersData.length > 0) {
        setCurrentPhase(2);
        setChapters(chaptersData);
      } else {
        setCurrentPhase(0);
      }
    } catch (error) {
      console.error('Error checking book processing status:', error);
      setCurrentPhase(0);
    }
  };

  const startProcessing = async () => {
    if (!bookId) {
      message.error('Book ID is missing.');
      return;
    }

    setProcessing(true);
    setProgress(null); // Reset progress

    try {
      // Start listening to progress updates
      const eventSource = new EventSourcePolyfill(
        `${apiUrl}/api/books/${bookId}/extract-profiles/progress`,
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
          message.success(data.message || 'Processing completed.');
          eventSource.close();
          setProcessing(false);
          fetchChapters();
        } else if (data.status === 'error') {
          message.error(data.message || 'Error during processing.');
          eventSource.close();
          setProcessing(false);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource failed:', err);
        message.error('Connection to progress stream failed.');
        eventSource.close();
        setProcessing(false);
      };

      // Trigger book processing
      await axios.post(`${apiUrl}/api/books/${bookId}/extract-profiles`);
    } catch (error) {
      message.error('Error starting book processing.');
      setProcessing(false);
    }
  };

  const continueProcessing = async () => {
    if (!bookId || !selectedChapterId) {
      message.error('Book ID or Chapter ID is missing.');
      return;
    }

    setProcessing(true);
    setProgress(null); // Reset progress

    try {
      // Start listening to progress updates
      const eventSource = new EventSourcePolyfill(
        `${apiUrl}/api/books/${selectedChapterId}/generate-chapter-images/progress`,
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
          message.success(data.message || 'Processing completed.');
          eventSource.close();
          setProcessing(false);
          // onProcessingComplete();
          // onClose();
        } else if (data.status === 'error') {
          message.error(data.message || 'Error during processing.');
          eventSource.close();
          setProcessing(false);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource failed:', err);
        message.error('Connection to progress stream failed.');
        eventSource.close();
        setProcessing(false);
      };

      // Trigger image generation
      await axios.get(
        `${apiUrl}/api/books/${selectedChapterId}/generate-chapter-images`
      );
    } catch (error) {
      message.error('Error continuing book processing.');
      setProcessing(false);
    }
  };

  const fetchChapters = async () => {
    if (!bookId) return;

    try {
      const response = await axios.get(
        `${apiUrl}/api/books/${bookId}/chapters`
      );
      setChapters(response.data);
      setCurrentPhase(2);
    } catch (error) {
      console.error('Error fetching chapters:', error);
      message.error('Failed to fetch chapters.');
    }
  };

  const getPhaseNumber = (phaseName?: string): number => {
    switch (phaseName) {
      case 'Phase 1':
      case 'Phase 1: Extracting passages and chapters...':
        return 1;
      case 'Phase 2':
      case 'Phase 2: Extracting canonical character names...':
        return 2;
      case 'Phase 3':
      case 'Phase 3: Processing passages with context...':
        return 3;
      case 'Phase 4':
      case 'Phase 4: Detecting scenes...':
        return 4;
      default:
        return 0;
    }
  };

  return (
    <Modal
      visible={visible}
      title='Processing Book'
      onCancel={onClose}
      footer={[
        <Button key='close' onClick={onClose} disabled={processing}>
          Close
        </Button>,
      ]}
    >
      <Steps current={currentPhase} direction='vertical' size='small'>
        <Step title='Extract Passages and Chapters' />
        <Step title='Building Character List' />
        <Step title='Processing Passages' />
        <Step title='Detecting Scenes' />
        <Step title='Generating Images' />
      </Steps>

      {processing && progress && (
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

      {currentPhase === 0 && !processing && (
        <div style={{ marginTop: '20px' }}>
          <Button type='primary' onClick={startProcessing} loading={processing}>
            Start Processing
          </Button>
        </div>
      )}

      {currentPhase >= 2 && !processing && (
        <div style={{ marginTop: '20px' }}>
          <Title level={4}>Select Chapter to Continue</Title>
          <Select
            placeholder='Select a chapter'
            style={{ width: 300, marginBottom: '20px' }}
            onChange={(value) => setSelectedChapterId(value)}
            value={selectedChapterId || undefined}
          >
            {chapters.map((chapter) => (
              <Option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </Option>
            ))}
          </Select>
          <Button
            type='primary'
            onClick={continueProcessing}
            disabled={!selectedChapterId}
            loading={processing}
          >
            Continue Processing
          </Button>
        </div>
      )}

      {currentPhase === 4 && !processing && (
        <div style={{ marginTop: '20px' }}>
          <Button
            type='primary'
            onClick={() => {
              onProcessingComplete(); // Inform parent component
              onClose(); // Close modal
            }}
          >
            Go to Reader
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default GenerateImagesModal;
