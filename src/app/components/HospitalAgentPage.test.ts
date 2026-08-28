import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HospitalAgentPage from './HospitalAgentPage';
import HospitalAgentAvatar, { HOSPITAL_AGENT_AVATAR_SRC } from './HospitalAgentAvatar';
import { resolveSkillRunTarget } from '../lib/plaza/skillRoutes';
import skillIndex from '../../../agents/hospital_agent_example/data/skills/skills_index.json';

describe('Hospital Agent entry and local catalogue', () => {
  it('adds a lazy, independently addressed page to the actual Agents tab', () => {
    const source = readFileSync(new URL('./MusicAgentsTab.tsx', import.meta.url), 'utf8');
    expect(source).toContain("lazy(() => import('./HospitalAgentPage'))");
    expect(source).toContain("runSkill('health-consultation')");
    expect(source).toContain("running === 'hospital'");
    expect(source).toContain('<HospitalAgentPage onBack={closeRunning}');
    expect(resolveSkillRunTarget('hospital-agent')).toBe('hospital');
    expect(resolveSkillRunTarget('health-consultation')).toBe('hospital');
    expect(resolveSkillRunTarget('lianlema-coach')).toBe('lianlema');
  });

  it('uses the real 19-department / 67-skill index, matching the Python runtime data', () => {
    const skills = JSON.parse(readFileSync(new URL('../../../agents/hospital_agent_example/data/skills/skills.json', import.meta.url), 'utf8'));
    const indexed = Object.entries(skillIndex.skills_by_department).flatMap(([department, names]) => names.map((disease) => `${department}:${disease}`));
    expect(indexed.sort()).toEqual(skills.map((skill: { department: string; disease: string }) => `${skill.department}:${skill.disease}`).sort());
    expect(Object.keys(skillIndex.skills_by_department)).toHaveLength(19);
    expect(indexed).toHaveLength(67);
  });

  it('uses the chosen local bear image for both the Agents entry and hospital header', () => {
    const entry = readFileSync(new URL('./MusicAgentsTab.tsx', import.meta.url), 'utf8');
    expect(entry).toContain("import HospitalAgentAvatar from './HospitalAgentAvatar'");
    expect(entry).toContain('<HospitalAgentAvatar />');
    expect(entry).not.toContain('Stethoscope');
    const avatar = renderToStaticMarkup(createElement(HospitalAgentAvatar));
    expect(avatar).toContain(`src="${HOSPITAL_AGENT_AVATAR_SRC}"`);
    expect(avatar).toContain('健康咨询 Agent 小白熊头像');
    expect(avatar).toContain('width="52" height="52"');
    const page = renderToStaticMarkup(createElement(HospitalAgentPage, { onBack() {} }));
    expect(page).toContain(`src="${HOSPITAL_AGENT_AVATAR_SRC}"`);
    expect(page).toContain('width="36" height="36"');
    expect(page).not.toContain('lucide-stethoscope');
  });

  it('bundles the original square bear PNG locally so the avatar does not depend on network access', () => {
    expect(HOSPITAL_AGENT_AVATAR_SRC).toBe('/assets/agent-avatars/20260828/hospital-agent-bear-v1.png');
    const image = readFileSync(new URL(`../../../public${HOSPITAL_AGENT_AVATAR_SRC}`, import.meta.url));
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.readUInt32BE(16)).toBe(1254);
    expect(image.readUInt32BE(20)).toBe(1254);
  });

  it('replaces deployment settings with explicit-consent Qwen questions and preserves the research boundary', () => {
    const html = renderToStaticMarkup(createElement(HospitalAgentPage, { onBack() {} }));
    expect(html).toContain('健康咨询 Agent');
    expect(html).toContain('返回 Agents');
    expect(html).toContain('覆盖科室');
    expect(html).toContain('本地疾病 Skills');
    expect(html).toContain('原发性高血压');
    expect(html).toContain('data-hospital-qwen="voice-rag-v2"');
    expect(html).toContain('同意并发送给 Qwen');
    expect(html).toContain('不自动附带健康记录');
    expect(html).not.toContain('HOSPITAL_AGENT_BASE_URL');
    expect(html).not.toContain('部署接入说明');
    expect(html).not.toContain('后端连接');
    expect(html).toContain('不提供真实医疗诊断或处方');
    expect(html).toContain('非实时运行进度');
    expect(html).toContain('<textarea');
    expect(html).not.toContain('本次已由');
    expect(html).not.toContain('评测成功');
  });

  it('does not make a connection or paid model request on mount', () => {
    const source = readFileSync(new URL('./HospitalAgentPage.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('checkHospitalAgentHealth');
    expect(source).toContain('async function sendQuestion()');
    const effect = source.split('useEffect(() => {')[1].split('}, []);')[0];
    expect(effect).not.toMatch(/fetch|askHospitalAgent|readHealthMemory/);
  });

  it('keeps health form controls at an iOS-safe size without disabling user zoom', () => {
    const html = renderToStaticMarkup(createElement(HospitalAgentPage, { onBack() {} }));
    expect(html).toContain('hospital-agent-page');
    const source = readFileSync(new URL('./HospitalAgentPage.tsx', import.meta.url), 'utf8');
    expect(source).toContain("import './HospitalAgentPage.css'");
    const css = readFileSync(new URL('./HospitalAgentPage.css', import.meta.url), 'utf8');
    // This must override theme.css's unlayered 12px form-control rule;
    // a Tailwind font-size utility alone loses to that global rule.
    expect(css).toMatch(/\.hospital-agent-page\s+:is\(textarea, select\)\s*\{[^}]*font-size:\s*max\(16px, 1rem\)/);
    for (const id of ['hospital-question', 'hospital-department']) {
      const control = html.match(new RegExp(`<(?:textarea|select)\\b[^>]*id="${id}"[^>]*>`))?.[0];
      expect(control).toBeDefined();
      expect(control).toContain('min-w-0');
      expect(control).not.toContain('text-xs');
    }
    const entry = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
    expect(entry).not.toMatch(/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0)?(?:[,"\s]|$)/i);
    expect(css).not.toMatch(/transform:\s*scale|zoom:/);
  });
});
