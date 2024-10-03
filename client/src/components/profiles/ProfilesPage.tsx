// components/profiles/ProfilesPage.tsx

import {
  Button,
  Card,
  Layout,
  List,
  message,
  Modal,
  Select,
  Typography,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';

const { Content } = Layout;
const { Option } = Select;
const { Text, Title } = Typography;
const { confirm } = Modal;

interface Profile {
  name: string;
  type: string;
  descriptions: { id: string; text: string }[];
}

const ProfilesPage: React.FC = () => {
  const [bookFiles, setBookFiles] = useState<string[]>([]);
  const [selectedBookFile, setSelectedBookFile] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [extractingProfiles, setExtractingProfiles] = useState(false);

  // Fetch available books from the file system
  useEffect(() => {
    axios
      .get('http://localhost:5000/api/books/files')
      .then((response) => setBookFiles(response.data))
      .catch((error) => console.error('Error fetching book files:', error));
  }, []);

  // Fetch profiles for the selected book
  const fetchProfiles = async () => {
    if (selectedBookFile !== null) {
      setLoadingProfiles(true);
      axios
        .get(`http://localhost:5000/api/books/${selectedBookFile}/profiles`)
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
    try {
      const response = await axios.post(
        `http://localhost:5000/api/books/${selectedBookFile}/extract-profiles`
      );
      message.success(response.data.message);
      // Refresh profiles after passage
      await fetchProfiles();
    } catch (error) {
      message.error('Error extracting profiles.');
    } finally {
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
          await axios.delete(
            `http://localhost:5000/api/books/${selectedBookFile}`
          );
          message.success('Book and profiles deleted successfully.');
          setProfiles([]);
        } catch (error) {
          message.error('Error deleting book.');
        }
      },
    });
  };
  console.log(bookFiles);
  console.log(selectedBookFile);
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content style={{ padding: '50px' }}>
        <Title level={2}>Profiles Review</Title>
        <Select
          placeholder='Select a book'
          style={{ width: 300, marginBottom: '20px' }}
          onChange={(value) => setSelectedBookFile(value)}
        >
          {bookFiles.map((bookFile) => (
            <Option key={bookFile} value={bookFile}>
              {bookFile.replace('.epub', '')}
            </Option>
          ))}
        </Select>

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

export default ProfilesPage;
