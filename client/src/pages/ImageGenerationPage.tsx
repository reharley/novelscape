import {
  Button,
  Divider,
  Layout,
  List,
  Select,
  Spin,
  Typography,
  message,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import JobCard from '../components/JobCard';
import { Book, Chapter, ImageGenerationJob } from '../utils/types';

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

  const baseUrl = 'http://localhost:5000/api'; // Adjust as needed

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
    console.log('Setting up polling...');

    // Define the polling function
    const fetchJobs = async () => {
      try {
        console.log('Fetching jobs...');
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
          forceRegenerate: true, // Include this if your backend supports it
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
