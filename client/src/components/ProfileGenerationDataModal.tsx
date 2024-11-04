import {
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Typography,
} from 'antd';
import React, { useEffect, useState } from 'react';
import { AiModel, ProfileGenerationData } from '../utils/types';

const { Option } = Select;
const { Text } = Typography;

interface ProfileGenerationDataModalProps {
  visible: boolean;
  onOk: (values: any) => void; // Modified to accept form values
  onCancel: () => void;
  editingGenData: ProfileGenerationData | null;
  form: any;
  aiModels: {
    loras: AiModel[];
    models: AiModel[];
    embeddings: AiModel[];
  };
}

const ProfileGenerationDataModal: React.FC<ProfileGenerationDataModalProps> = ({
  visible,
  onOk,
  onCancel,
  editingGenData,
  form,
  aiModels,
}) => {
  // Populate form fields when editingGenData changes
  useEffect(() => {
    if (editingGenData) {
      form.setFieldsValue({
        name: editingGenData.name,
        prompt: editingGenData.prompt,
        negativePrompt: editingGenData.negativePrompt,
        steps: editingGenData.steps,
        width: editingGenData.width,
        height: editingGenData.height,
        checkpointId: editingGenData.checkpointId,
        removeBackground: editingGenData.removeBackground,
        loras: editingGenData.loras.map((lora) => ({
          id: lora.aiModelId,
          weight: lora.weight,
        })),
        embeddings: editingGenData.embeddings.map(
          (embedding) => embedding.aiModelId
        ),
        negativeEmbeddings: editingGenData.negativeEmbeddings.map(
          (embedding) => embedding.aiModelId
        ),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        steps: 30,
        width: 512,
        height: 768,
      });
    }
  }, [editingGenData, form]);

  const [filteredLoras, setFilteredLoras] = useState<AiModel[]>([]);

  const handleCheckpointChange = (value: number) => {
    const selectedCheckpoint = aiModels.models.find(
      (model) => model.id === value
    );
    if (selectedCheckpoint) {
      const compatibleLoras = aiModels.loras.filter(
        (lora) => lora.baseModel === selectedCheckpoint.baseModel
      );
      setFilteredLoras(compatibleLoras);
    } else {
      setFilteredLoras([]);
    }
    // Update form values
    form.setFieldsValue({ checkpointId: value, loras: [] });
  };

  useEffect(() => {
    const checkpointId = form.getFieldValue('checkpointId');
    const selectedCheckpoint = aiModels.models.find(
      (model) => model.id === checkpointId
    );
    console.log('selectedCheckpoint', selectedCheckpoint);
    if (selectedCheckpoint) {
      const compatibleLoras = aiModels.loras.filter(
        (lora) => lora.baseModel === selectedCheckpoint.baseModel
      );
      setFilteredLoras(compatibleLoras);
    } else {
      setFilteredLoras([]);
    }
  }, [form, aiModels.models, aiModels.loras]);

  const onFinish = (values: any) => {
    const formattedValues = {
      ...values,
      loras: values.loras.map((lora: any) => ({
        id: lora.id,
        weight: lora.weight,
      })),
      embeddings: values.embeddings || [],
      negativeEmbeddings: values.negativeEmbeddings || [],
    };
    onOk(formattedValues);
  };

  return (
    <Modal
      title={
        editingGenData
          ? 'Edit Profile Generation Data'
          : 'Add Profile Generation Data'
      }
      visible={visible}
      onCancel={onCancel}
      width={800}
      destroyOnClose
      footer={null} // Removed default footer
    >
      <Form
        form={form}
        layout='vertical'
        initialValues={{
          removeBackground: false,
          loras: [],
          embeddings: [],
          negativeEmbeddings: [],
          name: '',
          steps: 30,
          width: 512,
          height: 768,
        }}
        onFinish={onFinish} // Use the new onFinish handler
      >
        {/* Name Field */}
        <Form.Item
          label='Name'
          name='name'
          rules={[{ required: true, message: 'Please enter the name.' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          label='Prompt'
          name='prompt'
          rules={[{ required: true, message: 'Please enter the prompt.' }]}
        >
          <Input.TextArea rows={3} />
        </Form.Item>

        <Form.Item label='Negative Prompt' name='negativePrompt'>
          <Input.TextArea rows={2} />
        </Form.Item>

        <Form.Item label='Steps' name='steps'>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item label='Width' name='width'>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item label='Height' name='height'>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          label='Checkpoint'
          name='checkpointId'
          rules={[{ required: true, message: 'Please select a checkpoint.' }]}
        >
          <Select
            placeholder='Select a checkpoint'
            loading={aiModels.models.length === 0}
            onChange={handleCheckpointChange} // Add onChange handler
          >
            {aiModels.models.map((model) => (
              <Option key={model.id} value={model.id}>
                {model.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name='removeBackground'
          valuePropName='checked'
          style={{ marginBottom: '0' }}
        >
          <Checkbox>Remove Background</Checkbox>
        </Form.Item>

        {/* LORAs with Weights */}
        <Form.List name='loras'>
          {(fields, { add, remove }) => (
            <>
              <Text strong>Positive LORAs:</Text>
              {fields.map(({ key, name, ...restField }) => (
                <div key={key} style={{ display: 'flex', marginBottom: 8 }}>
                  <Form.Item
                    {...restField}
                    name={[name, 'id']}
                    rules={[{ required: true, message: 'Missing LORA' }]}
                    style={{ flex: 2, marginRight: 8 }}
                  >
                    <Select placeholder='Select a LORA' allowClear>
                      {filteredLoras.map((lora) => (
                        <Option key={lora.id} value={lora.id}>
                          {lora.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    name={[name, 'weight']}
                    rules={[{ required: true, message: 'Missing weight' }]}
                    style={{ flex: 1, marginRight: 8 }}
                    initialValue={1.0}
                  >
                    <InputNumber
                      min={0}
                      step={0.1}
                      placeholder='Weight'
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                  <Button type='link' onClick={() => remove(name)}>
                    Remove
                  </Button>
                </div>
              ))}
              <Form.Item>
                <Button
                  type='dashed'
                  onClick={() => add()}
                  block
                  disabled={filteredLoras.length === 0}
                >
                  Add LORA
                </Button>
                {filteredLoras.length === 0 && (
                  <Text type='warning'>
                    No compatible LORAs available for the selected checkpoint.
                  </Text>
                )}
              </Form.Item>
            </>
          )}
        </Form.List>

        <Form.Item label='Embeddings' name='embeddings'>
          <Select
            mode='multiple'
            placeholder='Select Embeddings'
            loading={aiModels.embeddings.length === 0}
            allowClear
          >
            {aiModels.embeddings.map((embedding) => (
              <Option key={embedding.id} value={embedding.id}>
                {embedding.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label='Negative Embeddings' name='negativeEmbeddings'>
          <Select
            mode='multiple'
            placeholder='Select Negative Embeddings'
            loading={aiModels.embeddings.length === 0}
            allowClear
          >
            {aiModels.embeddings.map((embedding) => (
              <Option key={embedding.id} value={embedding.id}>
                {embedding.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* Form Buttons */}
        <Form.Item>
          <Button onClick={onCancel} style={{ marginRight: 8 }}>
            Cancel
          </Button>
          <Button type='primary' htmlType='submit'>
            Ok
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ProfileGenerationDataModal;
