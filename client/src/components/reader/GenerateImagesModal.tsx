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
import React, { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../utils/general';
import { ProcessingJob } from '../../utils/types';

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
  const [existingJob, setExistingJob] = useState<ProcessingJob | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (visible) {
      checkExistingJob();
      fetchChapters();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setCurrentPhase(0);
      setProgress(null);
      setProcessing(false);
      setSelectedChapterId(null);
      setExistingJob(null);
    };
  }, [visible]);

  const checkExistingJob = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/jobs/book/${bookId}`);
      const job: ProcessingJob = response.data;

      if (job && job.status !== 'completed' && job.status !== 'failed') {
        setExistingJob(job);
        setProcessing(true);
        setCurrentPhase(getPhaseNumberFromStatus(job.status));
        startProgressPolling(job.id);
      } else {
        setExistingJob(null);
      }
    } catch (error) {
      console.error('Error checking existing job:', error);
    }
  };

  const fetchChapters = async () => {
    if (!bookId) return;

    try {
      const response = await axios.get(
        `${apiUrl}/api/books/${bookId}/chapters`
      );
      setChapters(response.data);
    } catch (error) {
      console.error('Error fetching chapters:', error);
    }
  };

  const startProcessing = async () => {
    if (!bookId) {
      message.error('Book ID is missing.');
      return;
    }

    try {
      setProcessing(true);
      setCurrentPhase(0);
      const jobResponse = await axios.post(
        `${apiUrl}/api/books/${bookId}/process`
      );
      const job: ProcessingJob = jobResponse.data;
      setExistingJob(job);
      startProgressPolling(job.id);
    } catch (error: any) {
      if (error.response && error.response.status === 409) {
        message.error('A processing job is already running for this book.');
      } else {
        message.error('Error starting book processing.');
      }
      setProcessing(false);
    }
  };

  const continueProcessing = async () => {
    if (!bookId || !selectedChapterId) {
      message.error('Book ID or Chapter ID is missing.');
      return;
    }

    try {
      setProcessing(true);
      setCurrentPhase(2);
      const jobResponse = await axios.get(
        `${apiUrl}/api/chapters/${selectedChapterId}/generate-images`
      );
      const job: ProcessingJob = jobResponse.data;
      setExistingJob(job);
      startProgressPolling(job.id);
    } catch (error: any) {
      if (error.response && error.response.status === 409) {
        message.error('A processing job is already running for this chapter.');
      } else {
        message.error('Error continuing chapter processing.');
      }
      setProcessing(false);
    }
  };

  const startProgressPolling = (jobId: number) => {
    fetchJobProgress(jobId); // Initial fetch

    // Poll every 5 seconds
    intervalRef.current = setInterval(() => {
      fetchJobProgress(jobId);
    }, 5000);
  };

  const fetchJobProgress = async (jobId: number) => {
    try {
      const response = await axios.get(`${apiUrl}/api/jobs/${jobId}`);
      const job: ProcessingJob = response.data;
      setExistingJob(job);
      setCurrentPhase(getPhaseNumberFromStatus(job.phase));

      // Update progress
      setProgress({
        status: job.status,
        message: `Completed ${job.completedTasks} of ${job.totalTasks} tasks.`,
        completed: job.completedTasks,
        total: job.totalTasks,
      });

      if (job.status === 'completed' || job.status === 'failed') {
        setProcessing(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        if (job.status === 'completed') {
          message.success('Processing completed.');
          onProcessingComplete();
        } else {
          message.error('Processing failed.');
        }
      }
    } catch (error) {
      console.error('Error fetching job progress:', error);
    }
  };

  const getPhaseNumberFromStatus = (status: string): number => {
    switch (status) {
      case 'Phase 1':
        return 0;
      case 'Phase 2':
        return 1;
      case 'Phase 3':
        return 2;
      case 'Phase 4':
        return 3;
      case 'Phase 5':
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
          <Text>
            {progress.message} ({progress.completed}/{progress.total})
          </Text>
          <Progress
            percent={Number(
              ((progress.completed! / progress.total!) * 100).toFixed(2)
            )}
          />
        </div>
      )}

      {/* Display start and end times */}
      {existingJob?.startTime && (
        <div style={{ marginTop: '10px' }}>
          <Text>
            Started at: {new Date(existingJob.startTime).toLocaleString()}
          </Text>
        </div>
      )}
      {existingJob?.endTime && (
        <div style={{ marginTop: '10px' }}>
          <Text>
            Ended at: {new Date(existingJob.endTime).toLocaleString()}
          </Text>
        </div>
      )}

      {currentPhase === 0 && !processing && !existingJob && (
        <div style={{ marginTop: '20px' }}>
          <Button type='primary' onClick={startProcessing} loading={processing}>
            Start Processing
          </Button>
        </div>
      )}

      {currentPhase >= 2 && !processing && !existingJob && (
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

      {existingJob && existingJob.status !== 'completed' && processing && (
        <div style={{ marginTop: '20px' }}>
          <Text>
            A processing job is already running for this {existingJob.jobType}.
            Please wait until it completes.
          </Text>
        </div>
      )}

      {currentPhase === 5 && !processing && (
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
