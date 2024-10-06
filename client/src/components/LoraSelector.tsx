import { InputNumber, Select, Space } from 'antd';
import React from 'react';

const { Option } = Select;

interface LoraOption {
  name: string;
  weight: number;
}

interface LoraSelectorProps {
  loras: string[];
  selectedLoras: LoraOption[];
  setSelectedLoras: (loras: LoraOption[]) => void;
  placeholder: string;
}

const LoraSelector: React.FC<LoraSelectorProps> = ({
  loras,
  selectedLoras,
  setSelectedLoras,
  placeholder,
}) => {
  const handleChange = (values: string[]) => {
    const updatedLoras = values.map((name) => {
      const existing = selectedLoras.find((lora) => lora.name === name);
      return existing || { name, weight: 1 };
    });
    setSelectedLoras(updatedLoras);
  };

  const handleWeightChange = (name: string, weight: number) => {
    const updatedLoras = selectedLoras.map((lora) =>
      lora.name === name ? { ...lora, weight } : lora
    );
    setSelectedLoras(updatedLoras);
  };

  return (
    <div>
      <Select
        mode='multiple'
        placeholder={placeholder}
        style={{ width: '100%' }}
        onChange={handleChange}
        value={selectedLoras.map((lora) => lora.name)}
      >
        {loras.map((lora) => (
          <Option key={lora} value={lora}>
            {lora}
          </Option>
        ))}
      </Select>
      {selectedLoras.map((lora) => (
        <Space key={lora.name} style={{ marginTop: '8px' }}>
          <span>{lora.name}</span>
          <InputNumber
            min={0}
            max={2}
            step={0.1}
            value={lora.weight}
            onChange={(value) => handleWeightChange(lora.name, value || 1)}
          />
        </Space>
      ))}
    </div>
  );
};

export default LoraSelector;
