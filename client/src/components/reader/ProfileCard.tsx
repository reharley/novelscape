import { Card, Typography } from 'antd';
import React from 'react';
import { Profile } from '../../utils/types';

const { Meta } = Card;
const { Text } = Typography;

interface ProfileCardProps {
  profile: Profile;
  onClick: (profile: Profile) => void;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ profile, onClick }) => {
  console.log('ProfileCard:', profile);
  return (
    <Card
      hoverable
      style={{ width: 240 }}
      cover={
        profile.imageUrl && profile.imageUrl !== '' ? (
          <img alt={profile.name} src={profile.imageUrl} />
        ) : (
          <div
            style={{
              height: '200px',
              backgroundColor: '#f0f0f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text type='secondary'>No Image</Text>
          </div>
        )
      }
      onClick={() => onClick(profile)}
    >
      <Meta title={profile.name} description={profile.type} />
    </Card>
  );
};

export default ProfileCard;
