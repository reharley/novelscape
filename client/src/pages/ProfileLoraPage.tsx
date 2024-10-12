import {
  Button,
  Card,
  Layout,
  List,
  message,
  Modal,
  Progress,
  Select,
  Typography,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { apiUrl } from '../utils/general';

const { Content } = Layout;
const { Option } = Select;
const { Text, Title } = Typography;
const { confirm } = Modal;

interface Profile {
  name: string;
  type: string;
  descriptions: { id: string; text: string }[];
}

interface ProgressData {
  status: string;
  message?: string;
  phase?: string;
  completed?: number;
  total?: number;
  file?: string;
}

const ProfileLoraPage: React.FC = () => {
  const [bookFiles, setBookFiles] = useState<string[]>([]);
  const [selectedBookFile, setSelectedBookFile] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [extractingProfiles, setExtractingProfiles] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);

  // Fetch available books from the file system
  useEffect(() => {
    axios
      .get(apiUrl + '/api/books/files')
      .then((response) => setBookFiles(response.data))
      .catch((error) => console.error('Error fetching book files:', error));
  }, []);

  // Fetch profiles for the selected book
  const fetchProfiles = async () => {
    if (selectedBookFile !== null) {
      setLoadingProfiles(true);
      axios
        .get(apiUrl + `/api/books/${selectedBookFile}/profiles`)
        .then((response) => setProfiles(response.data))
        .catch((error) => console.error('Error fetching profiles:', error))
        .finally(() => setLoadingProfiles(false));
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [selectedBookFile]);

  // Extract profiles for the selected book
  const extractProfiles = async () => {
    if (selectedBookFile === null) {
      message.error('Please select a book first.');
      return;
    }

    setExtractingProfiles(true);
    setProgress(null); // Reset progress
    try {
      // Start listening to progress updates
      const eventSource = new EventSource(
        apiUrl + `/api/books/${selectedBookFile}/extract-profiles/progress`
      );

      eventSource.onmessage = (event) => {
        const data: ProgressData = JSON.parse(event.data);
        setProgress(data);

        if (data.status === 'completed') {
          message.success(data.message);
          eventSource.close();
          setExtractingProfiles(false);
          // Refresh profiles after extraction
          fetchProfiles();
        } else if (data.status === 'error') {
          message.error(data.message);
          eventSource.close();
          setExtractingProfiles(false);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource failed:', err);
        message.error('Connection to progress stream failed.');
        eventSource.close();
        setExtractingProfiles(false);
      };

      // Trigger profile extraction
      await axios.post(
        apiUrl + `/api/books/${selectedBookFile}/extract-profiles`
      );
    } catch (error) {
      message.error('Error extracting profiles.');
      setExtractingProfiles(false);
    }
  };

  const detectScenes = async () => {
    if (selectedBookFile === null) {
      message.error('Please select a book first.');
      return;
    }

    setExtractingProfiles(true);
    setProgress(null); // Reset progress
    try {
      // Start listening to progress updates
      const eventSource = new EventSource(
        apiUrl + `/api/books/${selectedBookFile}/detect-scenes/progress`
      );

      eventSource.onmessage = (event) => {
        const data: ProgressData = JSON.parse(event.data);
        setProgress(data);

        if (data.status === 'completed') {
          message.success(data.message);
          eventSource.close();
          setExtractingProfiles(false);
          // Refresh profiles after extraction
          fetchProfiles();
        } else if (data.status === 'error') {
          message.error(data.message);
          eventSource.close();
          setExtractingProfiles(false);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource failed:', err);
        message.error('Connection to progress stream failed.');
        eventSource.close();
        setExtractingProfiles(false);
      };

      // Trigger profile extraction
      await axios.post(apiUrl + `/api/books/${selectedBookFile}/detect-scenes`);
    } catch (error) {
      message.error('Error extracting profiles.');
      setExtractingProfiles(false);
    }
  };

  // Delete book and profiles
  const deleteBook = () => {
    if (selectedBookFile === null) {
      message.error('Please select a book first.');
      return;
    }

    confirm({
      title:
        'Are you sure you want to delete this book and all associated profiles?',
      onOk: async () => {
        try {
          await axios.delete(apiUrl + `/api/books/${selectedBookFile}`);
          message.success('Book and profiles deleted successfully.');
          setProfiles([]);
        } catch (error) {
          message.error('Error deleting book.');
        }
      },
    });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content style={{ padding: '50px' }}>
        <Title level={2}>Profiles Review</Title>
        <Select
          placeholder='Select a book'
          style={{ width: 300, marginBottom: '20px' }}
          onChange={(value) => setSelectedBookFile(value)}
          value={selectedBookFile || undefined}
        >
          {bookFiles.map((bookFile) => (
            <Option key={bookFile} value={bookFile}>
              {bookFile.replace('.epub', '')}
            </Option>
          ))}
        </Select>
        <Button onClick={detectScenes}>Detect Scenes</Button>

        <div style={{ marginBottom: '20px' }}>
          <Button
            type='primary'
            onClick={extractProfiles}
            loading={extractingProfiles}
            style={{ marginRight: '10px' }}
          >
            Extract Profiles
          </Button>
          <Button danger onClick={deleteBook}>
            Clear Book and Profiles
          </Button>
        </div>

        {extractingProfiles && progress && (
          <div style={{ marginBottom: '20px' }}>
            <Title level={4}>Extraction Progress</Title>
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
            {progress.status === 'file_extracted' && (
              <Text>Extracted file: {progress.file}</Text>
            )}
            {progress.status === 'completed' && (
              <Text type='success'>{progress.message}</Text>
            )}
            {progress.status === 'error' && (
              <Text type='danger'>{progress.message}</Text>
            )}
          </div>
        )}

        {loadingProfiles ? (
          <p>Loading profiles...</p>
        ) : (
          <List
            grid={{ gutter: 16, column: 4 }}
            dataSource={profiles}
            renderItem={(profile) => (
              <List.Item>
                <Card title={profile.name}>
                  <Text strong>Type:</Text> {profile.type}
                  <br />
                  <Text strong>Descriptions:</Text>
                  <ul>
                    {profile.descriptions.map((desc) => (
                      <li key={desc.id}>{desc.text}</li>
                    ))}
                  </ul>
                </Card>
              </List.Item>
            )}
          />
        )}
      </Content>
    </Layout>
  );
};

export default ProfileLoraPage;
