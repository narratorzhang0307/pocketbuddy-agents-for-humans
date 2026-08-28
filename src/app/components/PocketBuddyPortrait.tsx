import { useEffect, useState, type CSSProperties } from 'react';
import {
  getAgentWorldPocketBuddyBlueprint,
  getPocketBuddyPortraitUrl,
  type PocketBuddy,
} from '../lib/pocket-buddy';
import AgentWorldPocketBuddyPortrait from './AgentWorldPocketBuddyPortrait';

export default function PocketBuddyPortrait({
  buddy,
  className = '',
  animated = true,
  style,
}: {
  buddy: PocketBuddy;
  className?: string;
  animated?: boolean;
  style?: CSSProperties;
}) {
  const catalogBlueprint = getAgentWorldPocketBuddyBlueprint(
    buddy.visual.catalogId,
  );
  const [url, setUrl] = useState(buddy.visual.thumbnailUrl);
  const [failedUrl, setFailedUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (catalogBlueprint) {
      setUrl(catalogBlueprint.assetUrl ?? '');
      return () => {
        active = false;
      };
    }
    const id = buddy.visual.portraitBlobId;
    setUrl(buddy.visual.thumbnailUrl);
    if (!id) {
      setUrl(buddy.visual.thumbnailUrl);
      return () => {
        active = false;
      };
    }
    void getPocketBuddyPortraitUrl(id).then((next) => {
      if (active && next) setUrl(next);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [buddy.visual.portraitBlobId, buddy.visual.thumbnailUrl, catalogBlueprint]);

  if (catalogBlueprint) {
    return (
      <AgentWorldPocketBuddyPortrait
        blueprint={catalogBlueprint}
        className={className}
        animated={animated}
        style={style}
      />
    );
  }
  if (url && url !== failedUrl) {
    return (
      <img
        className={className}
        style={style}
        src={url}
        alt={`${buddy.name}的口袋形象`}
        onError={() => setFailedUrl(url)}
      />
    );
  }
  return null;
}
