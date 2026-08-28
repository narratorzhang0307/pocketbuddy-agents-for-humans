export const HOSPITAL_AGENT_AVATAR_SRC = '/assets/agent-avatars/20260828/hospital-agent-bear-v1.png';

export default function HospitalAgentAvatar({ size = 52 }: { size?: number }) {
  return <img src={HOSPITAL_AGENT_AVATAR_SRC} alt="健康咨询 Agent 小白熊头像"
    width={size} height={size} style={{ width: size, height: size }}
    className="block shrink-0 rounded-xl border-2 border-black object-cover" draggable={false} />;
}
