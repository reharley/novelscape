import { Badge, Card, Progress, Typography } from 'antd';
import React from 'react';
import { ImageGenerationJob } from '../utils/types';

const { Text } = Typography;

interface JobCardProps {
  job: ImageGenerationJob;
}

const JobCard: React.FC<JobCardProps> = ({ job }) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge status='default' text='Pending' />;
      case 'in_progress':
        return <Badge status='processing' text='In Progress' />;
      case 'completed':
        return <Badge status='success' text='Completed' />;
      case 'completed_with_errors':
        return <Badge status='warning' text='Completed with Errors' />;
      default:
        return <Badge status='default' text={status} />;
    }
  };

  return (
    <Card
      title={`Job ID: ${job.id}`}
      bordered
      style={{ width: '100%', marginBottom: '16px' }}
    >
      <Text strong>Status: </Text>
      {getStatusBadge(job.status)}
      <Progress
        percent={parseFloat(job.progress.toFixed(2))}
        status={
          job.status === 'completed_with_errors'
            ? 'exception'
            : job.status === 'completed'
            ? 'success'
            : 'active'
        }
        style={{ marginTop: '16px' }}
      />
      <div style={{ marginTop: '8px' }}>
        <Text>
          Completed Tasks: {job.completedTasks} / {job.totalTasks}
        </Text>
      </div>
      <div>
        <Text>Failed Tasks: {job.failedTasks}</Text>
      </div>
      <div>
        <Text type='secondary'>
          Last Updated: {new Date(job.updatedAt).toLocaleString()}
        </Text>
      </div>
    </Card>
  );
};

export default JobCard;
