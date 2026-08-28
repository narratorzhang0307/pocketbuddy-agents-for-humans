import { useState, type CSSProperties } from 'react';
import type { AgentWorldPocketBuddyBlueprint } from '../lib/pocket-buddy';
import ProgressiveImage from './ProgressiveImage';

export function pocketBuddyPreviewUrl(sourceAssetUrl: string) {
  return sourceAssetUrl.includes('/assets/pocket-buddy/packages/')
    || sourceAssetUrl.includes('/assets/pocket-buddy/pet-materials-v1/')
    || sourceAssetUrl.includes('/assets/pocket-buddy/agent-world-original-v2/')
    ? sourceAssetUrl
    : sourceAssetUrl.replace(/\.png$/, '-thumb.png');
}

export default function AgentWorldPocketBuddyPortrait({
  blueprint,
  className = '',
  animated = true,
  style,
}: {
  blueprint: AgentWorldPocketBuddyBlueprint;
  className?: string;
  animated?: boolean;
  style?: CSSProperties;
  motionPackageId?: string;
}) {
  const [failedUrl, setFailedUrl] = useState('');
  const sourceAssetUrl = blueprint.assetUrl;
  // An unavailable selected asset is empty, never a generated substitute mascot.
  if (!sourceAssetUrl || failedUrl === sourceAssetUrl) return null;

  const previewAssetUrl = pocketBuddyPreviewUrl(sourceAssetUrl);
  const isPetMaterial = sourceAssetUrl.startsWith('/assets/pocket-buddy/pet-materials-v1/');
  const isPetMaterialV2 = sourceAssetUrl.startsWith('/assets/pocket-buddy/pet-materials-v2/');
  const isAlienMaterial = sourceAssetUrl.startsWith('/assets/pocket-buddy/alien-materials-');
  const isLargeCatalogPet = ['puff', 'pip', 'mossback'].includes(blueprint.id);
  const sharedClassName = `pbf-catalog-portrait pbf-agent-world-sprite ${isPetMaterial ? 'is-pet-material' : ''} ${isPetMaterialV2 ? 'is-pet-material-v2' : ''} ${isAlienMaterial ? 'is-alien-material' : ''} ${isLargeCatalogPet ? 'is-large-catalog-pet' : ''} ${animated ? 'is-animated' : ''} ${className}`;
  return (
    <ProgressiveImage
      key={sourceAssetUrl}
      className={sharedClassName}
      style={style}
      src={sourceAssetUrl}
      previewSrc={previewAssetUrl}
      eager={blueprint.id === 'holiday-christmas-dachshund'}
      alt={`${blueprint.name}的图鉴形象`}
      draggable={false}
      onError={(event) => {
        if (event.currentTarget.getAttribute('src') === sourceAssetUrl) setFailedUrl(sourceAssetUrl);
      }}
    />
  );
}
