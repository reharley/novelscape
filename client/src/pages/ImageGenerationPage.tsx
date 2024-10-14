import {
  Button,
  Col,
  Divider,
  Layout,
  List,
  Row,
  Select,
  Spin,
  Typography,
  message,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import JobCard from '../components/JobCard';
import LoraSelector from '../components/LoraSelector';
import { apiUrl } from '../utils/general';
import { AiModel, Book, Chapter, ImageGenerationJob } from '../utils/types';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const ChapterImageGenerationPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    null
  );
  const [loadingBooks, setLoadingBooks] = useState<boolean>(false);
  const [loadingChapters, setLoadingChapters] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [jobs, setJobs] = useState<ImageGenerationJob[]>([]);
  // Updated state variables for generation options
  const [checkpoints, setCheckpoints] = useState<AiModel[]>([]);
  const [loras, setLoras] = useState<AiModel[]>([]);
  const [embeddings, setEmbeddings] = useState<AiModel[]>([]);
  const [selectedProfileCheckpoint, setSelectedProfileCheckpoint] = useState<
    string | null
  >(null);
  const [selectedBackgroundCheckpoint, setSelectedBackgroundCheckpoint] =
    useState<string | null>(null);
  const [selectedProfileLoras, setSelectedProfileLoras] = useState<
    { name: string; weight: number }[]
  >([]);
  const [selectedBackgroundLoras, setSelectedBackgroundLoras] = useState<
    { name: string; weight: number }[]
  >([]);
  const [selectedProfileEmbeddings, setSelectedProfileEmbeddings] = useState<
    string[]
  >([]);
  const [selectedBackgroundEmbeddings, setSelectedBackgroundEmbeddings] =
    useState<string[]>([]);
  // Negative Embeddings
  const [
    selectedProfileNegativeEmbeddings,
    setSelectedProfileNegativeEmbeddings,
  ] = useState<string[]>([]);
  const [
    selectedBackgroundNegativeEmbeddings,
    setSelectedBackgroundNegativeEmbeddings,
  ] = useState<string[]>([]);
  // State variables to store filtered options
  const [filteredProfileLoras, setFilteredProfileLoras] = useState<AiModel[]>(
    []
  );
  const [filteredBackgroundLoras, setFilteredBackgroundLoras] = useState<
    AiModel[]
  >([]);
  const [filteredProfileEmbeddings, setFilteredProfileEmbeddings] = useState<
    AiModel[]
  >([]);
  const [filteredBackgroundEmbeddings, setFilteredBackgroundEmbeddings] =
    useState<AiModel[]>([]);

  const baseUrl = apiUrl + '/api';
  // Fetch models and resources
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const [checkpointsRes, lorasRes, embeddingsRes] = await Promise.all([
          axios.get<AiModel[]>(`${baseUrl}/ai-models/list-models`),
          axios.get<AiModel[]>(`${baseUrl}/ai-models/list-loras`),
          axios.get<AiModel[]>(`${baseUrl}/ai-models/list-embeddings`),
        ]);
        setCheckpoints(checkpointsRes.data);
        setLoras(lorasRes.data);
        setEmbeddings(embeddingsRes.data);
      } catch (error) {
        console.error('Error fetching resources:', error);
        message.error('Failed to fetch generation resources.');
      }
    };
    fetchResources();
  }, [baseUrl]);

  // Filter LoRAs and Embeddings based on selected checkpoints
  useEffect(() => {
    if (selectedProfileCheckpoint) {
      const baseModel = checkpoints.find(
        (ckpt) => ckpt.fileName === selectedProfileCheckpoint
      )?.baseModel;
      const filteredLoras = loras.filter(
        (lora) => lora.baseModel === baseModel
      );
      const filteredEmbeddings = embeddings.filter(
        (embedding) => embedding.baseModel === baseModel
      );
      setFilteredProfileLoras(filteredLoras);
      setFilteredProfileEmbeddings(filteredEmbeddings);
    } else {
      setFilteredProfileLoras([]);
      setFilteredProfileEmbeddings([]);
    }
  }, [selectedProfileCheckpoint, checkpoints, loras, embeddings]);

  useEffect(() => {
    if (selectedBackgroundCheckpoint) {
      const baseModel = checkpoints.find(
        (ckpt) => ckpt.fileName === selectedBackgroundCheckpoint
      )?.baseModel;
      const filteredLoras = loras.filter(
        (lora) => lora.baseModel === baseModel
      );
      const filteredEmbeddings = embeddings.filter(
        (embedding) => embedding.baseModel === baseModel
      );
      setFilteredBackgroundLoras(filteredLoras);
      setFilteredBackgroundEmbeddings(filteredEmbeddings);
    } else {
      setFilteredBackgroundLoras([]);
      setFilteredBackgroundEmbeddings([]);
    }
  }, [selectedBackgroundCheckpoint, checkpoints, loras, embeddings]);

  // Fetch books on component mount
  useEffect(() => {
    const fetchBooks = async () => {
      setLoadingBooks(true);
      try {
        const response = await axios.get<Book[]>(`${baseUrl}/books`);
        setBooks(response.data);
      } catch (error: any) {
        console.error('Error fetching books:', error);
        message.error('Failed to fetch books.');
      } finally {
        setLoadingBooks(false);
      }
    };

    fetchBooks();
  }, [baseUrl]);

  // Fetch chapters when a book is selected
  useEffect(() => {
    const fetchChapters = async () => {
      if (!selectedBookId) {
        setChapters([]);
        return;
      }

      setLoadingChapters(true);
      try {
        const response = await axios.get<Chapter[]>(
          `${baseUrl}/books/${selectedBookId}/chapters`
        );
        setChapters(response.data);
      } catch (error: any) {
        console.error('Error fetching chapters:', error);
        message.error('Failed to fetch chapters.');
      } finally {
        setLoadingChapters(false);
      }
    };

    fetchChapters();
  }, [selectedBookId, baseUrl]);

  // Polling mechanism to fetch job statuses periodically
  useEffect(() => {
    // Define the polling function
    const fetchJobs = async () => {
      try {
        const response = await axios.get<ImageGenerationJob[]>(
          `${baseUrl}/generate-image/jobs`
        );
        setJobs(response.data);
      } catch (error: any) {
        console.error('Error fetching jobs:', error);
        message.error('Failed to fetch jobs.');
      }
    };

    // Fetch jobs immediately upon mounting
    fetchJobs();

    // Set up the interval to fetch jobs every 5 seconds
    const interval = setInterval(fetchJobs, 5000);

    // Clean up the interval on component unmount
    return () => clearInterval(interval);
  }, [baseUrl]);

  // Function to initiate image generation for a chapter
  const handleGenerateImages = async () => {
    if (!selectedChapterId) {
      message.error('Please select a chapter.');
      return;
    }

    setGenerating(true);
    try {
      const response = await axios.post<{ jobId: number }>(
        `${baseUrl}/generate-image/chapters/${selectedChapterId}/generate-images`,
        {
          forceRegenerate: true,
          profileOptions: {
            checkpoint: selectedProfileCheckpoint,
            positiveLoras: selectedProfileLoras,
            embeddings: selectedProfileEmbeddings,
            negativeEmbeddings: selectedProfileNegativeEmbeddings,
          },
          backgroundOptions: {
            checkpoint: selectedBackgroundCheckpoint,
            positiveLoras: selectedBackgroundLoras,
            embeddings: selectedBackgroundEmbeddings,
            negativeEmbeddings: selectedBackgroundNegativeEmbeddings,
          },
        }
      );

      const { jobId } = response.data;
      message.success(`Image generation job started. Job ID: ${jobId}`);

      // Optionally, fetch the job immediately
      const jobResponse = await axios.get<ImageGenerationJob>(
        `${baseUrl}/jobs/${jobId}`
      );
      setJobs((prevJobs) => [jobResponse.data, ...prevJobs]);
    } catch (error: any) {
      console.error('Error initiating image generation:', error);
      message.error(
        error.response?.data?.error || 'Failed to initiate image generation.'
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        <Title level={2} style={{ textAlign: 'center' }}>
          Chapter Image Generation
        </Title>

        {/* Book Selection */}
        <div style={{ marginBottom: '24px' }}>
          <Text strong>Select a Book:</Text>
          <br />
          {loadingBooks ? (
            <Spin />
          ) : (
            <Select
              placeholder='Select a book'
              style={{ width: '100%', marginTop: '8px' }}
              onChange={(value: string) => setSelectedBookId(value)}
              value={selectedBookId || undefined}
            >
              {books.map((book) => (
                <Option key={book.id} value={book.id}>
                  {book.title}
                </Option>
              ))}
            </Select>
          )}
        </div>

        {/* Chapter Selection */}
        {selectedBookId && (
          <div style={{ marginBottom: '24px' }}>
            <Text strong>Select a Chapter:</Text>
            <br />
            {loadingChapters ? (
              <Spin />
            ) : (
              <Select
                placeholder='Select a chapter'
                style={{ width: '100%', marginTop: '8px' }}
                onChange={(value: number) => setSelectedChapterId(value)}
                value={selectedChapterId || undefined}
              >
                {chapters.map((chapter) => (
                  <Option key={chapter.id} value={chapter.id}>
                    {`Chapter ${chapter.order + 1}: ${chapter.title}`}
                  </Option>
                ))}
              </Select>
            )}
          </div>
        )}
        {/* Generation Options */}
        {selectedChapterId && (
          <div style={{ marginBottom: '24px' }}>
            <Title level={4}>Generation Options</Title>
            <Row gutter={16}>
              <Col span={12}>
                <Text strong>Profile Checkpoint:</Text>
                <Select
                  placeholder='Select checkpoint'
                  style={{ width: '100%', marginBottom: '8px' }}
                  onChange={(value) => setSelectedProfileCheckpoint(value)}
                  value={selectedProfileCheckpoint || undefined}
                >
                  {checkpoints.map((ckpt) => (
                    <Option key={ckpt.name} value={ckpt.fileName}>
                      {ckpt.name}
                    </Option>
                  ))}
                </Select>

                <Text strong>Positive LoRAs for Profiles:</Text>
                <LoraSelector
                  loras={filteredProfileLoras.map((lora) => lora.name)}
                  selectedLoras={selectedProfileLoras}
                  setSelectedLoras={setSelectedProfileLoras}
                  placeholder='Select positive LoRAs'
                />

                <Text strong>Embeddings for Profiles:</Text>
                <Select
                  mode='multiple'
                  placeholder='Select embeddings'
                  style={{ width: '100%', marginBottom: '8px' }}
                  onChange={(values) => setSelectedProfileEmbeddings(values)}
                  value={selectedProfileEmbeddings}
                >
                  {filteredProfileEmbeddings.map((embedding) => (
                    <Option key={embedding.name} value={embedding.fileName}>
                      {embedding.name}
                    </Option>
                  ))}
                </Select>
                <Text strong>Negative Embeddings for Profiles:</Text>
                <Select
                  mode='multiple'
                  placeholder='Select negative embeddings'
                  style={{ width: '100%', marginBottom: '8px' }}
                  onChange={(values) =>
                    setSelectedProfileNegativeEmbeddings(values)
                  }
                  value={selectedProfileNegativeEmbeddings}
                >
                  {filteredProfileEmbeddings.map((embedding) => (
                    <Option key={embedding.name} value={embedding.fileName}>
                      {embedding.name}
                    </Option>
                  ))}
                </Select>
              </Col>
              <Col span={12}>
                <Text strong>Background Checkpoint:</Text>
                <Select
                  placeholder='Select checkpoint'
                  style={{ width: '100%', marginBottom: '8px' }}
                  onChange={(value) => setSelectedBackgroundCheckpoint(value)}
                  value={selectedBackgroundCheckpoint || undefined}
                >
                  {checkpoints.map((ckpt) => (
                    <Option key={ckpt.name} value={ckpt.fileName}>
                      {ckpt.name}
                    </Option>
                  ))}
                </Select>

                <Text strong>Positive LoRAs for Backgrounds:</Text>
                <LoraSelector
                  loras={filteredBackgroundLoras.map((lora) => lora.name)}
                  selectedLoras={selectedBackgroundLoras}
                  setSelectedLoras={setSelectedBackgroundLoras}
                  placeholder='Select positive LoRAs'
                />

                <Text strong>Embeddings for Backgrounds:</Text>
                <Select
                  mode='multiple'
                  placeholder='Select embeddings'
                  style={{ width: '100%', marginBottom: '8px' }}
                  onChange={(values) => setSelectedBackgroundEmbeddings(values)}
                  value={selectedBackgroundEmbeddings}
                >
                  {filteredBackgroundEmbeddings.map((embedding) => (
                    <Option key={embedding.name} value={embedding.fileName}>
                      {embedding.name}
                    </Option>
                  ))}
                </Select>

                <Text strong>Negative Embeddings for Backgrounds:</Text>
                <Select
                  mode='multiple'
                  placeholder='Select negative embeddings'
                  style={{ width: '100%', marginBottom: '8px' }}
                  onChange={(values) =>
                    setSelectedBackgroundNegativeEmbeddings(values)
                  }
                  value={selectedBackgroundNegativeEmbeddings}
                >
                  {filteredBackgroundEmbeddings.map((embedding) => (
                    <Option key={embedding.name} value={embedding.fileName}>
                      {embedding.name}
                    </Option>
                  ))}
                </Select>
              </Col>
            </Row>
          </div>
        )}

        {/* Generate Images Button */}
        {selectedChapterId && (
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <Button
              type='primary'
              onClick={handleGenerateImages}
              loading={generating}
              disabled={generating}
            >
              Generate Images for Chapter
            </Button>
          </div>
        )}

        <Divider />

        {/* Jobs List */}
        <div>
          <Title level={4}>Image Generation Jobs</Title>
          {jobs.length === 0 ? (
            <Text>No jobs found.</Text>
          ) : (
            <List
              itemLayout='vertical'
              dataSource={jobs}
              renderItem={(job) => <JobCard key={job.id} job={job} />}
            />
          )}
        </div>
      </Content>
    </Layout>
  );
};

export default ChapterImageGenerationPage;
