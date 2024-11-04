import {
  DeleteOutlined,
  DiscordOutlined,
  SettingOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMsal } from '@azure/msal-react';
import {
  Button,
  Card,
  Col,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Upload,
} from 'antd';
import { RcFile } from 'antd/es/upload/interface';
import axios from 'axios';
import React, { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';
import { getStylePackages } from '../api/stylePackageApi'; // Import the API function to fetch StylePackages
import { apiUrl } from '../utils/general';
import { Book, StylePackage } from '../utils/types';

const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { accounts } = useMsal();

  const [books, setBooks] = useState<Book[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showUserBooks, setShowUserBooks] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false); // Combined modal visibility
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [availableStyles, setAvailableStyles] = useState<StylePackage[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<number | null>(null); // Use number type for IDs

  const userId = accounts[0]?.localAccountId;
  const fetchBooks = () => {
    axios
      .get(`${apiUrl}/api/books/`)
      .then((response) => {
        setBooks(response.data);
      })
      .catch((error) => {
        console.error(`Error fetching books: ${error}`);
      });
  };

  useEffect(() => {
    fetchBooks();
    fetchStylePackages(); // Fetch StylePackages when component mounts
  }, []);

  const fetchStylePackages = async () => {
    try {
      const data = await getStylePackages(); // Fetch StylePackages from the server
      setAvailableStyles(data);
    } catch (error) {
      // message.error('Failed to fetch Style Packages.');
    }
  };

  const handleUpload = (file: RcFile): boolean => {
    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);

    axios
      .post(`${apiUrl}/api/books/upload`, formData)
      .then(() => {
        message.success(`${file.name} uploaded successfully.`);
        fetchBooks(); // Refresh the list of books after upload
      })
      .catch((error) => {
        message.error(`Error uploading file: ${error}`);
      })
      .finally(() => {
        setUploading(false);
      });

    return false; // Prevent default upload behavior
  };

  const handleDelete = (bookId: number) => {
    axios
      .delete(`${apiUrl}/api/books/${bookId}`)
      .then(() => {
        message.success('Book deleted successfully.');
        fetchBooks(); // Refresh the list of books after deletion
      })
      .catch((error) => {
        message.error(`Error deleting book: ${error}`);
      });
  };

  const showStylePackageModal = (bookId: number) => {
    setSelectedBookId(bookId);
    const book = books.find((b) => b.id === bookId);
    setSelectedStyle(book?.stylePackageId || null); // Set current StylePackage or null

    setIsModalVisible(true);
  };

  const handleSaveStyle = () => {
    if (selectedBookId != null) {
      if (selectedStyle != null) {
        // Add or update the StylePackage
        axios
          .post(`${apiUrl}/api/books/${selectedBookId}/style-packages`, {
            stylePackageId: selectedStyle,
          })
          .then(() => {
            message.success('StylePackage updated successfully.');
            fetchBooks();
            setIsModalVisible(false);
            setSelectedStyle(null);
          })
          .catch((error) => {
            message.error(`Error updating StylePackage: ${error}`);
          });
      } else {
        // Remove the StylePackage
        const selectedBook = books.find((b) => b.id === selectedBookId);
        const stylePackageId = selectedBook?.stylePackageId;
        axios
          .delete(
            `${apiUrl}/api/books/${selectedBookId}/style-packages/${stylePackageId}`
          )
          .then(() => {
            message.success('StylePackage removed successfully.');
            fetchBooks();
            setIsModalVisible(false);
            setSelectedStyle(null);
          })
          .catch((error) => {
            message.error(`Error removing StylePackage: ${error}`);
          });
      }
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h3>Quick Guide</h3>
      <iframe
        width='100%'
        height='315'
        src={`https://www.youtube.com/embed/kWb0I-cmLw4`}
        frameBorder='0'
        allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
        allowFullScreen
      ></iframe>
      <Button
        href='https://discord.gg/9gSKPA3x'
        size='large'
        target='_blank'
        rel='noopener noreferrer'
      >
        <DiscordOutlined /> Join the Discord!
      </Button>
      <h1>Your Library</h1>
      <Space direction='vertical'>
        <Upload
          beforeUpload={handleUpload}
          accept='.epub'
          showUploadList={false}
        >
          <Button icon={<UploadOutlined />} loading={uploading}>
            {uploading ? 'Uploading' : 'Upload EPUB'}
          </Button>
        </Upload>

        <Space>
          <h2 style={{ marginTop: '20px' }}>Uploaded Books</h2>
          <div>
            <span style={{ marginLeft: '8px' }}>Show My Books</span>
          </div>
          <Switch
            checked={showUserBooks}
            onChange={(checked) => setShowUserBooks(checked)}
          />
        </Space>
      </Space>
      {books.length === 0 ? (
        <p>No books uploaded yet.</p>
      ) : (
        <Row gutter={[16, 16]}>
          {books
            .filter((book) => !showUserBooks || book.userId === userId)
            .map((book) => (
              <Col key={book.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  cover={
                    <img
                      onClick={() => navigate(`/reader/${book.id}`)}
                      alt='placeholder'
                      src={book.coverUrl || 'https://via.placeholder.com/150'}
                    />
                  }
                  actions={[
                    <Popconfirm
                      title='Are you sure you want to delete this book?'
                      onConfirm={() => handleDelete(book.id)}
                      okText='Yes'
                      cancelText='No'
                    >
                      <DeleteOutlined key='delete' />
                    </Popconfirm>,
                    <SettingOutlined
                      key='manage-styles'
                      onClick={() => showStylePackageModal(book.id)}
                    />,
                  ]}
                >
                  <Card.Meta
                    title={book.title}
                    description={book.title || 'No description'}
                  />
                </Card>
              </Col>
            ))}
        </Row>
      )}
      <Modal
        title='Manage StylePackage'
        visible={isModalVisible}
        onOk={handleSaveStyle}
        onCancel={() => {
          setIsModalVisible(false);
          setSelectedStyle(null);
        }}
      >
        <Select
          style={{ width: '100%' }}
          placeholder='Select a style'
          value={selectedStyle}
          onChange={(value) => setSelectedStyle(value)}
        >
          <Select.Option value={null}>None</Select.Option>
          {availableStyles.map((stylePackage) => (
            <Select.Option key={stylePackage.id} value={stylePackage.id}>
              {stylePackage.name}
            </Select.Option>
          ))}
        </Select>
      </Modal>
    </div>
  );
};

export default LibraryPage;
