import { UploadOutlined } from '@ant-design/icons';
import { Button, List, message, Upload } from 'antd';
import { RcFile } from 'antd/es/upload/interface';
import axios from 'axios';
import React, { useState } from 'react';

import { apiUrl } from '../utils/general';

interface UploadedBook {
  id: number;
  name: string;
  type: string;
  url: string;
}

const LibraryPage: React.FC = () => {
  const [books, setBooks] = useState<UploadedBook[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = (file: RcFile): boolean => {
    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);

    axios
      .post(`${apiUrl}/api/books/upload`, formData)
      .then((data) => {
        message.success(`${file.name} uploaded successfully.`);
      })
      .catch((error) => {
        message.error(`Error uploading file: ${error}`);
      })
      .finally(() => {
        setUploading(false);
      });

    return false; // Prevent default upload behavior
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h1>Upload Your Books</h1>
      <Upload
        beforeUpload={handleUpload}
        accept='.pdf,.epub'
        showUploadList={false}
      >
        <Button icon={<UploadOutlined />} loading={uploading}>
          {uploading ? 'Uploading' : 'Upload PDF/EPUB'}
        </Button>
      </Upload>

      <h2 style={{ marginTop: '20px' }}>Uploaded Books</h2>
      {books.length === 0 ? (
        <p>No books uploaded yet.</p>
      ) : (
        <List
          bordered
          dataSource={books}
          renderItem={(book) => (
            <List.Item key={book.id}>
              <a href={book.url} target='_blank' rel='noopener noreferrer'>
                {book.name}
              </a>{' '}
              ({book.type.includes('pdf') ? 'PDF' : 'EPUB'})
            </List.Item>
          )}
        />
      )}
    </div>
  );
};

export default LibraryPage;
