import { UploadOutlined } from '@ant-design/icons';
import { Button, Form, message, Modal, Upload } from 'antd';
import axios from 'axios';
import React, { useState } from 'react';
import { apiUrl } from '../../utils/general';

type Props = {
  visible: boolean;
  bookId: string | undefined;
  onClose: () => void;
};

const AudiobookUploadModal: React.FC<Props> = ({
  visible,
  bookId,
  onClose,
}) => {
  const [fileList, setFileList] = useState<any[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);

  const handleUpload = async () => {
    if (!bookId) {
      message.error('Please enter a valid Book ID.');
      return;
    }
    if (fileList.length === 0) {
      message.error('Please select at least one audio file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('bookId', bookId.toString());
    fileList.forEach((file) => {
      console.log('file:', file);
      formData.append('audioFiles', file);
    });

    setUploading(true);

    try {
      await axios.post(apiUrl + '/api/stt/upload-audiobook', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      message.success('Audiobook uploaded and processing started.');
      setFileList([]);
      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
      message.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const uploadProps = {
    onRemove: (file: any) => {
      setFileList((prevList) => {
        const index = prevList.indexOf(file);
        const newFileList = prevList.slice();
        newFileList.splice(index, 1);
        return newFileList;
      });
    },
    beforeUpload: (file: any) => {
      setFileList((prevList) => [...prevList, file]);
      return false; // Prevent automatic upload
    },
    fileList,
  };

  console.log('visible:', visible);
  return (
    <Modal
      visible={visible}
      title='Upload Audiobook'
      onCancel={onClose}
      footer={[
        <Button key='back' onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key='submit'
          type='primary'
          loading={uploading}
          onClick={handleUpload}
        >
          {uploading ? 'Uploading' : 'Start Upload'}
        </Button>,
      ]}
    >
      <Form layout='vertical'>
        <Form.Item label='Audio Files' required>
          <Upload {...uploadProps} multiple>
            <Button icon={<UploadOutlined />}>Select Audio Files</Button>
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AudiobookUploadModal;
