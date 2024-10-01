// src/components/ModelPreview.tsx

import { Carousel, Image, Modal, Spin, Typography } from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { AiModel, GenerationData, ModelImage } from '../../utils/types';

const { Title, Paragraph } = Typography;

interface ModelPreviewProps {
  visible: boolean;
  onClose: () => void;
  model: AiModel;
}

const ModelPreview: React.FC<ModelPreviewProps> = ({
  visible,
  onClose,
  model,
}) => {
  const [generationData, setGenerationData] = useState<GenerationData | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [carouselImages, setCarouselImages] = useState<string[]>([]);

  useEffect(() => {
    if (visible && model) {
      fetchGenerationData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, model]);

  const fetchGenerationData = async () => {
    setLoading(true);
    try {
      // Assuming the first image is representative
      const response = await axios.get<GenerationData>(
        `http://localhost:5000/api/civitai/${model.id}`
      );
      setGenerationData(response.data);

      // Fetch associated images from ModelImage
      const modelImage = await axios.get<ModelImage>(
        `http://localhost:5000/api/model-images/${model.id}`
      );
      setCarouselImages([modelImage.data.url]); // Adjust if multiple images are associated
    } catch (error) {
      console.error('Error fetching generation data:', error);
      // Optionally, display an error message to the user
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={model.name}
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      {loading ? (
        <Spin />
      ) : generationData ? (
        <>
          <Paragraph>
            <strong>Description:</strong>{' '}
            {model.description || 'No description available.'}
          </Paragraph>
          <Paragraph>
            <strong>Prompt:</strong> {generationData.prompt}
          </Paragraph>
          <Paragraph>
            <strong>Negative Prompt:</strong> {generationData.negativePrompt}
          </Paragraph>
          <Paragraph>
            <strong>CFG Scale:</strong> {generationData.cfgScale}
          </Paragraph>
          <Paragraph>
            <strong>Steps:</strong> {generationData.steps}
          </Paragraph>
          <Paragraph>
            <strong>Sampler:</strong> {generationData.sampler}
          </Paragraph>
          <Paragraph>
            <strong>Seed:</strong> {generationData.seed}
          </Paragraph>
          <Paragraph>
            <strong>Size:</strong> {generationData.size}
          </Paragraph>
          <Paragraph>
            <strong>Created Date:</strong>{' '}
            {new Date(generationData.createdDate).toLocaleString()}
          </Paragraph>
          <Paragraph>
            <strong>Clip Skip:</strong> {generationData.clipSkip}
          </Paragraph>

          <Title level={5}>Civitai Resources</Title>
          {generationData.civitaiResources.map((resource) => (
            <Paragraph key={resource.id}>
              <strong>Type:</strong> {resource.type}
              <br />
              {resource.weight !== undefined && (
                <>
                  <strong>Weight:</strong> {resource.weight}
                  <br />
                </>
              )}
              <strong>Model Version ID:</strong> {resource.modelVersionId}
              <br />
              <strong>Model Version Name:</strong> {resource.modelVersionName}
            </Paragraph>
          ))}

          <Title level={5}>Image Previews</Title>
          {carouselImages.length > 0 ? (
            <Carousel autoplay>
              {carouselImages.map((url, index) => (
                <div key={index}>
                  <Image
                    src={url}
                    alt={`Model Preview ${index + 1}`}
                    style={{
                      width: '100%',
                      maxHeight: '500px',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              ))}
            </Carousel>
          ) : (
            <Paragraph>No images available for this model.</Paragraph>
          )}
        </>
      ) : (
        <Paragraph>No generation data available.</Paragraph>
      )}
    </Modal>
  );
};

export default ModelPreview;
