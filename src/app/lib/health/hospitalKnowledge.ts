import skills from '../../../../agents/hospital_agent_example/data/skills/skills.json';

export interface HealthReference { id: string; disease: string; department: string; questions: string[] }
const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function grams(text: string) {
  const chars = Array.from(normalize(text));
  return new Set(chars.slice(0, -1).map((char, i) => char + chars[i + 1]));
}

/** Local lexical text retrieval, not diagnosis or a claim of clinical validation.
 * Only interview questions leave this module: never treatment/dose recommendations.
 */
export function retrieveHealthReferences(question: string, department: string): HealthReference[] {
  const input = normalize(question), query = grams(question);
  if (input.length < 2) return [];
  return skills.map((skill, index) => {
    const title = normalize(skill.disease), terms = grams(skill.presentation);
    const overlap = [...query].filter(term => terms.has(term) && !['可以', '需要', '什么', '怎么', '现在', '我的', '这个', '一下'].includes(term)).length;
    const named = input.includes(title) || (title.length >= 3 && input.includes(title.replace(/^原发性/, '')));
    return { skill, index, score: named ? 100 : overlap >= 2 ? overlap + (department === skill.department ? 1 : 0) : 0 };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 3)
    .map(({ skill, index }) => ({ id: `health-text-${index + 1}`, disease: skill.disease, department: skill.department,
      questions: [...skill.interview_guide.first_questions, ...skill.interview_guide.followup_questions].slice(0, 4) }));
}
