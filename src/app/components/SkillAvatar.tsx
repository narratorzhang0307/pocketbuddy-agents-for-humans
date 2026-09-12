import { FROST_AVATAR, skillAvatarFor } from '../lib/skill/avatars';

export default function SkillAvatar({ skillId, size = 52, className = '' }: {
  skillId?: string; size?: number; className?: string;
}) {
  const avatar = skillAvatarFor(skillId);
  return <span className={`block shrink-0 overflow-hidden rounded-xl ${className}`} style={{ width: size, height: size, backgroundColor: avatar.accent }}>
    <img src={avatar.src} alt={avatar.id.startsWith('pocket.sports-') ? `${avatar.name} avatar` : `${avatar.name}头像`} width={size} height={size}
      className="h-full w-full object-cover" loading="lazy" draggable={false}
      onError={event => { if (!event.currentTarget.src.endsWith(FROST_AVATAR.src)) event.currentTarget.src = FROST_AVATAR.src; }} />
  </span>;
}
