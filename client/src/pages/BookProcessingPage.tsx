import {
  Button,
  Layout,
  message,
  Modal,
  Progress,
  Select,
  Steps,
  Typography,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiUrl } from '../utils/general';

const { Content } = Layout;
const { Option } = Select;
const { Text, Title } = Typography;
const { confirm } = Modal;
const { Step } = Steps;

interface Profile {
  name: string;
  type: string;
  descriptions: { id: string; text: string }[];
}

interface Chapter {
  id: number;
  order: number;
  title: string;
}

interface ProgressData {
  status: string;
  message?: string;
  phase?: string;
  completed?: number;
  total?: number;
  file?: string;
}

const BookProcessingPage: React.FC = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();

  const [currentPhase, setCurrentPhase] = useState<number>(0);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    null
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  useEffect(() => {
    if (bookId) {
      checkBookProcessingStatus();
    }
  }, [bookId]);

  const checkBookProcessingStatus = async () => {
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

    setExtracting(true);
    setProgress(null); // Reset progress

    try {
      // Start listening to progress updates
      const eventSource = new EventSource(
        `${apiUrl}/api/books/${bookId}/extract-profiles/progress`
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
          message.success(data.message);
          eventSource.close();
          setExtracting(false);
          fetchChapters();
        } else if (data.status === 'error') {
          message.error(data.message);
          eventSource.close();
          setExtracting(false);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource failed:', err);
        message.error('Connection to progress stream failed.');
        eventSource.close();
        setExtracting(false);
      };

      // Trigger book processing
      await axios.post(`${apiUrl}/api/books/${bookId}/extract-profiles`);
    } catch (error) {
      message.error('Error starting book processing.');
      setExtracting(false);
    }
  };

  const continueProcessing = async () => {
    if (!bookId || !selectedChapterId) {
      message.error('Book ID or Chapter ID is missing.');
      return;
    }

    setExtracting(true);
    setProgress(null); // Reset progress

    try {
      // Start listening to progress updates
      const eventSource = new EventSource(
        `${apiUrl}/api/books/${bookId}/detect-scenes/progress`
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
          message.success(data.message);
          eventSource.close();
          setExtracting(false);
          // Navigate to reader with selected chapter
          navigate(`/reader/${bookId}/${selectedChapterId}/0`);
        } else if (data.status === 'error') {
          message.error(data.message);
          eventSource.close();
          setExtracting(false);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource failed:', err);
        message.error('Connection to progress stream failed.');
        eventSource.close();
        setExtracting(false);
      };

      // Trigger scene detection
      await axios.post(`${apiUrl}/api/books/${bookId}/detect-scenes`);
    } catch (error) {
      message.error('Error continuing book processing.');
      setExtracting(false);
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

  const deleteBook = () => {
    if (!bookId) {
      message.error('Book ID is missing.');
      return;
    }

    confirm({
      title:
        'Are you sure you want to delete this book and all associated data?',
      onOk: async () => {
        try {
          await axios.delete(`${apiUrl}/api/books/${bookId}`);
          message.success('Book and data deleted successfully.');
          navigate('/'); // Redirect to home or books list
        } catch (error) {
          message.error('Error deleting book.');
        }
      },
    });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content style={{ padding: '50px' }}>
        <Title level={2}>Book Processing</Title>

        <Steps current={currentPhase}>
          <Step title='Extract Passages and Chapters' />
          <Step title='Extract Canonical Names' />
          <Step title='Process Passages with Context' />
          <Step title='Detect Scenes' />
        </Steps>

        {extracting && progress && (
          <div style={{ marginTop: '20px' }}>
            <Title level={4}>Processing Progress</Title>
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

        {currentPhase === 0 && (
          <div style={{ marginTop: '20px' }}>
            <Button
              type='primary'
              onClick={startProcessing}
              loading={extracting}
            >
              Start Processing
            </Button>
            <Button danger onClick={deleteBook} style={{ marginLeft: '10px' }}>
              Delete Book
            </Button>
          </div>
        )}

        {currentPhase >= 2 && (
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
              loading={extracting}
            >
              Continue Processing
            </Button>
          </div>
        )}

        {currentPhase === 4 && (
          <div style={{ marginTop: '20px' }}>
            <Button
              type='primary'
              onClick={() =>
                navigate(`/reader/${bookId}/${selectedChapterId}/0`)
              }
            >
              Go to Reader
            </Button>
          </div>
        )}
      </Content>
    </Layout>
  );
};

export default BookProcessingPage;
