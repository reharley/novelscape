import { Descriptions, Drawer, Spin } from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { apiUrl } from '../../utils/general';

interface Props {
  profileId: number;
  onClose: () => void;
}

interface ProfileDetail {
  id: number;
  name: string;
  type: string;
  gender?: string;
  imageUrl?: string;
  descriptions: Array<{ id: number; text: string }>;
  image?: {
    url: string;
    generationData?: {
      prompt: string;
      steps: number;
      cfgScale: number;
      negativePrompt?: string;
      sampler?: string;
      seed?: number;
      size?: string;
      clipSkip?: number;
      civitaiResources: Array<{
        modelName: string;
        versionName: string;
        strength?: number;
      }>;
    };
  };
}

const ProfileDetails: React.FC<Props> = ({ profileId, onClose }) => {
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    axios
      .get(apiUrl + `/api/profiles/${profileId}`)
      .then((response) => {
        setProfile(response.data);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching profile details:', error);
        setLoading(false);
      });
  }, [profileId]);

  if (loading || !profile) {
    return <Spin size='large' />;
  }

  return (
    <Drawer
      title={profile.name}
      width={640}
      placement='right'
      onClose={onClose}
      visible={!!profileId}
    >
      <Descriptions bordered column={1}>
        <Descriptions.Item label='Id'>{profile.id}</Descriptions.Item>
        <Descriptions.Item label='Name'>{profile.name}</Descriptions.Item>
        <Descriptions.Item label='Gender'>{profile.gender}</Descriptions.Item>
        <Descriptions.Item label='Type'>{profile.type}</Descriptions.Item>

        {profile.image && (
          <>
            <Descriptions.Item label='Image'>
              <img
                src={profile.image.url}
                alt='Profile Image'
                style={{ maxWidth: '100%' }}
              />
            </Descriptions.Item>

            {profile.image.generationData && (
              <>
                <Descriptions.Item label='Prompt'>
                  {profile.image.generationData.prompt}
                </Descriptions.Item>
                <Descriptions.Item label='Steps'>
                  {profile.image.generationData.steps}
                </Descriptions.Item>
                <Descriptions.Item label='CFG Scale'>
                  {profile.image.generationData.cfgScale}
                </Descriptions.Item>
                {profile.image.generationData.negativePrompt && (
                  <Descriptions.Item label='Negative Prompt'>
                    {profile.image.generationData.negativePrompt}
                  </Descriptions.Item>
                )}
                {profile.image.generationData.sampler && (
                  <Descriptions.Item label='Sampler'>
                    {profile.image.generationData.sampler}
                  </Descriptions.Item>
                )}
                {profile.image.generationData.seed !== undefined && (
                  <Descriptions.Item label='Seed'>
                    {profile.image.generationData.seed}
                  </Descriptions.Item>
                )}
                {profile.image.generationData.size && (
                  <Descriptions.Item label='Size'>
                    {profile.image.generationData.size}
                  </Descriptions.Item>
                )}
                {profile.image.generationData.clipSkip !== undefined && (
                  <Descriptions.Item label='Clip Skip'>
                    {profile.image.generationData.clipSkip}
                  </Descriptions.Item>
                )}

                {profile.image.generationData.civitaiResources.map(
                  (resource, index) => (
                    <Descriptions.Item key={index} label='Civitai Resource'>
                      Model Name: {resource.modelName}
                      <br />
                      Version: {resource.versionName}
                      <br />
                      {resource.strength !== undefined && (
                        <>
                          Strength: {resource.strength}
                          <br />
                        </>
                      )}
                    </Descriptions.Item>
                  )
                )}
              </>
            )}
          </>
        )}
        <Descriptions.Item label='Descriptions'>
          {profile.descriptions.map((desc) => (
            <p key={desc.id}>{desc.text}</p>
          ))}
        </Descriptions.Item>
      </Descriptions>
    </Drawer>
  );
};

export default ProfileDetails;
