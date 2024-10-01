import { List, Modal, Spin, Typography } from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { AiModel } from '../../utils/types';

const { Text } = Typography;

interface ModelSelectionModalProps {
  visible: boolean;
  onCancel: () => void;
  onSelect: (model: AiModel) => void;
  profileId: number;
}

const ModelSelectionModal: React.FC<ModelSelectionModalProps> = ({
  visible,
  onCancel,
  onSelect,
  profileId,
}) => {
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      fetchModels();
    }
  }, [visible]);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const response = await axios.get<AiModel[]>(
        'http://localhost:5000/api/ai-models/list-models',
        {
          params: { profileId },
        }
      );
      setModels(response.data);
    } catch (error) {
      console.error('Error fetching models:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title='Select a Model'
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      {loading ? (
        <Spin />
      ) : (
        <List
          itemLayout='horizontal'
          dataSource={models}
          renderItem={(model) => (
            <List.Item
              onClick={() => onSelect(model)}
              style={{ cursor: 'pointer' }}
            >
              <List.Item.Meta
                title={model.name}
                description={
                  <Text>
                    {model.description || 'No description available.'}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  );
};

export default ModelSelectionModal;
