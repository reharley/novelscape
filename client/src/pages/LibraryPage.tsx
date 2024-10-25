import {
  DeleteOutlined,
  DiscordOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, message, Popconfirm, Row, Upload } from 'antd';
import { RcFile } from 'antd/es/upload/interface';
import axios from 'axios';
import React, { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/general';
import { Book } from '../utils/types';

const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [uploading, setUploading] = useState(false);

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
  }, []);

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

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <Button
        href='https://discord.gg/9gSKPA3x'
        size='large'
        target='_blank'
        rel='noopener noreferrer'
      >
        <DiscordOutlined /> Join the Discord!
      </Button>
      <h1>Your Library</h1>
      <Upload beforeUpload={handleUpload} accept='.epub' showUploadList={false}>
        <Button icon={<UploadOutlined />} loading={uploading}>
          {uploading ? 'Uploading' : 'Upload EPUB'}
        </Button>
      </Upload>

      <h2 style={{ marginTop: '20px' }}>Uploaded Books</h2>
      {books.length === 0 ? (
        <p>No books uploaded yet.</p>
      ) : (
        <Row gutter={[16, 16]}>
          {books.map((book) => (
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
    </div>
  );
};

export default LibraryPage;
